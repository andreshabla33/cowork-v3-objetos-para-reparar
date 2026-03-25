import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, Users, Search, X, CheckCircle2, MessageSquare, Fingerprint, AlertTriangle, Send, Lightbulb } from 'lucide-react';

interface MysteryRoleplayGameProps {
  onClose: () => void;
}

interface Role {
  id: string;
  name: string;
  avatar: string;
  description: string;
  secretInfo: string;
  isSuspect: boolean;
  alibi: string;
}

interface Clue {
  id: string;
  title: string;
  description: string;
  icon: string;
  revealed: boolean;
}

const ROLES: Role[] = [
  { id: 'detective', name: 'Detective Principal', avatar: '🕵️', description: 'Eres el investigador a cargo del caso.', secretInfo: 'Tienes acceso a todas las pistas. Tu trabajo es guiar la investigación.', isSuspect: false, alibi: 'Estaba en la comisaría revisando archivos.' },
  { id: 'sospechoso1', name: 'El Gerente', avatar: '👔', description: 'Gerente de la empresa, encontraste el cuerpo.', secretInfo: 'Viste a alguien sospechoso cerca de la oficina anoche, pero no quieres meterte en problemas.', isSuspect: true, alibi: 'Estaba en una reunión hasta las 8 PM.' },
  { id: 'sospechoso2', name: 'La Programadora', avatar: '👩‍💻', description: 'Desarrolladora que trabajaba hasta tarde.', secretInfo: 'Escuchaste una discusión fuerte pero no viste nada. Tienes miedo de hablar.', isSuspect: true, alibi: 'Estaba codificando en el área común hasta medianoche.' },
  { id: 'sospechoso3', name: 'El Mensajero', avatar: '📦', description: 'Repartidor que pasa por la oficina diariamente.', secretInfo: 'Entregaste un paquete sospechoso ayer por la mañana.', isSuspect: true, alibi: 'Solo estuve 5 minutos para dejar un paquete.' },
  { id: 'testigo', name: 'La Recepcionista', avatar: '💁', description: 'Ves todo lo que pasa en la oficina.', secretInfo: 'Viste a dos personas discutiendo fuertemente el día del incidente.', isSuspect: false, alibi: 'Estaba en mi puesto de recepción todo el día.' },
];

const CLUES: Clue[] = [
  { id: 'c1', title: 'Huellas Digitales', description: 'Huellas encontradas en el escritorio', icon: '🖐️', revealed: false },
  { id: 'c2', title: 'Email Misterioso', description: 'Mensaje amenazante enviado a la víctima', icon: '📧', revealed: false },
  { id: 'c3', title: 'Registro de Entradas', description: 'Quién entró y salió del edificio', icon: '📋', revealed: false },
  { id: 'c4', title: 'Testigo Ocular', description: 'Alguien vio algo sospechoso', icon: '👁️', revealed: false },
  { id: 'c5', title: 'Objeto Extraño', description: 'Algo inusual encontrado en la escena', icon: '🔍', revealed: false },
];

const GAME_DURATION = 40 * 60;

export const MysteryRoleplayGame: React.FC<MysteryRoleplayGameProps> = ({ onClose }) => {
  const [gameState, setGameState] = useState<'lobby' | 'role-reveal' | 'playing' | 'voting' | 'finished'>('lobby');
  const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION);
  const [assignedRole, setAssignedRole] = useState<Role>(ROLES[0]);
  const [clues, setClues] = useState<Clue[]>(CLUES);
  const [chatMessages, setChatMessages] = useState<{sender: string; message: string; isSystem?: boolean}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [revealedInfo, setRevealedInfo] = useState(false);

  useEffect(() => {
    if (gameState === 'playing' && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) { setGameState('voting'); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartGame = () => {
    const randomRole = ROLES[Math.floor(Math.random() * ROLES.length)];
    setAssignedRole(randomRole);
    setGameState('role-reveal');
  };

  const handleBeginInvestigation = () => {
    setGameState('playing');
    setTimeRemaining(GAME_DURATION);
    addMessage('Sistema', '🔍 La investigación ha comenzado. Discutan entre ustedes para descubrir la verdad.', true);
    setTimeout(() => addMessage('El Gerente', 'Esto es terrible... ¿Alguien vio algo anoche?', false), 2000);
    setTimeout(() => addMessage('La Programadora', 'Yo estuve trabajando hasta tarde, pero no vi nada inusual.', false), 4000);
  };

  const addMessage = (sender: string, message: string, isSystem = false) => {
    setChatMessages(prev => [...prev, { sender, message, isSystem }]);
  };

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      addMessage('Tú (Detective)', chatInput);
      setChatInput('');
      setTimeout(() => {
        const responses = ['Eso es interesante...', '¿Tienes alguna prueba?', 'Yo no fui, lo juro.', 'Alguien está mintiendo aquí.', 'Necesitamos más pistas.'];
        const randomRole = ROLES[Math.floor(Math.random() * ROLES.length)];
        addMessage(randomRole.name, responses[Math.floor(Math.random() * responses.length)]);
      }, 2000);
    }
  };

  const handleRevealClue = (clueId: string) => {
    setClues(prev => prev.map(c => c.id === clueId ? { ...c, revealed: true } : c));
    const clue = clues.find(c => c.id === clueId);
    if (clue) addMessage('Sistema', `🔍 Nueva pista revelada: ${clue.title} - ${clue.description}`, true);
  };

  const handleVote = () => {
    if (selectedSuspect) {
      setHasVoted(true);
      setTimeout(() => setGameState('finished'), 2000);
    }
  };

  if (gameState === 'lobby') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 lg:p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4 lg:gap-3">
            <div className="w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg bg-indigo-500/20 flex items-center justify-center"><Star className="w-6 h-6 lg:w-5 lg:h-5 text-indigo-400" /></div>
            <div><h2 className="text-2xl lg:text-xl font-bold text-white">Mystery Role Play</h2><p className="text-sm lg:text-xs text-zinc-400">Resuelve el misterio en equipo</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>

        <div className="flex-1 flex">
          <div className="flex-1 p-8 lg:p-5 space-y-6 lg:space-y-4">
            <div className="grid grid-cols-4 gap-4 lg:gap-3">
              {[{ icon: Clock, value: '40 min', label: 'Investigación' }, { icon: Users, value: '4-8', label: 'Jugadores' }, { icon: Fingerprint, value: '5', label: 'Pistas' }, { icon: AlertTriangle, value: '1', label: 'Culpable' }].map((item, i) => (
                <div key={i} className="p-4 lg:p-3 bg-zinc-900 rounded-xl lg:rounded-lg border border-zinc-800">
                  <item.icon className="w-5 h-5 lg:w-4 lg:h-4 text-zinc-400 mb-2 lg:mb-1.5" />
                  <p className="text-2xl lg:text-xl font-bold text-white">{item.value}</p>
                  <p className="text-xs lg:text-[10px] text-zinc-500">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="p-6 lg:p-4 bg-red-500/10 border border-red-500/30 rounded-2xl lg:rounded-xl">
              <h3 className="text-lg lg:text-base font-semibold text-red-400 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />El Caso</h3>
              <p className="text-zinc-300 leading-relaxed">Un importante documento ha desaparecido de la oficina principal. La seguridad fue desactivada brevemente anoche entre las 10 PM y la medianoche. Hay 4 sospechosos, cada uno con su propia historia y secretos. Como equipo, deben investigar, interrogar y descubrir quién es el responsable antes de que sea demasiado tarde.</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg lg:text-base font-semibold text-white">Cómo jugar</h3>
              <div className="space-y-3">
                {['Cada jugador recibe un rol secreto con información exclusiva', 'Investiga revelando pistas y interrogando a sospechosos', 'Discute con tu equipo para analizar la evidencia', 'Vota por el culpable al final del tiempo'].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">{i + 1}</div>
                    <p className="text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleStartGame} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Search className="w-5 h-5" />Comenzar Investigación
            </button>
          </div>

          <div className="w-80 lg:w-64 p-6 lg:p-4 border-l border-zinc-800">
            <h3 className="text-lg lg:text-base font-semibold text-white mb-4 lg:mb-3">Roles Disponibles</h3>
            <div className="space-y-3">
              {ROLES.map((role) => (
                <div key={role.id} className="p-3 bg-zinc-900 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl lg:text-xl">{role.avatar}</span>
                    <div><p className="font-medium text-white">{role.name}</p><p className="text-xs text-zinc-500">{role.isSuspect ? 'Sospechoso' : 'Investigador'}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'role-reveal') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md w-full">
          <p className="text-zinc-400 mb-4">Tu rol secreto es...</p>
          <div className="p-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl mb-6">
            <div className="text-6xl mb-4">{assignedRole.avatar}</div>
            <h2 className="text-3xl font-bold text-white mb-2">{assignedRole.name}</h2>
            <p className="text-indigo-200">{assignedRole.description}</p>
          </div>
          <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 mb-6">
            <p className="text-sm text-zinc-500 mb-2">Tu información secreta:</p>
            <p className="text-zinc-300">{assignedRole.secretInfo}</p>
          </div>
          <button onClick={handleBeginInvestigation} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors">Comenzar a Investigar</button>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'voting') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-lg w-full">
          <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto mb-6"><MessageSquare className="w-10 h-10 text-indigo-400" /></div>
          <h2 className="text-3xl font-bold text-white mb-2">¡Tiempo de Votar!</h2>
          <p className="text-zinc-400 mb-8">Basándote en la evidencia y las discusiones, ¿quién crees que es el culpable?</p>

          {!hasVoted ? (
            <div className="space-y-3">
              {ROLES.filter(r => r.isSuspect).map((role) => (
                <motion.button key={role.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSelectedSuspect(role.id)} className={`w-full p-4 rounded-xl border-2 text-left transition-all ${selectedSuspect === role.id ? 'bg-indigo-500/20 border-indigo-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{role.avatar}</span>
                    <div className="flex-1"><p className="font-semibold text-white">{role.name}</p><p className="text-sm text-zinc-500">{role.alibi}</p></div>
                    {selectedSuspect === role.id && <CheckCircle2 className="w-6 h-6 text-indigo-400" />}
                  </div>
                </motion.button>
              ))}
              <button onClick={handleVote} disabled={!selectedSuspect} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors mt-4">Confirmar Voto</button>
            </div>
          ) : (
            <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-green-400 font-semibold">Voto registrado</p>
              <p className="text-zinc-500 text-sm">Esperando resultados...</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const correctAnswer = 'sospechoso2';
    const isCorrect = selectedSuspect === correctAnswer;

    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6 max-w-xl">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ${isCorrect ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {isCorrect ? <CheckCircle2 className="w-12 h-12 text-green-400" /> : <X className="w-12 h-12 text-red-400" />}
          </div>

          <div>
            <h2 className={`text-4xl font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{isCorrect ? '¡Caso Resuelto!' : 'Caso No Resuelto'}</h2>
            <p className="text-zinc-400 mt-2">{isCorrect ? 'Excelente trabajo de investigación' : 'El culpable escapó esta vez'}</p>
          </div>

          <div className="p-6 bg-zinc-900 rounded-xl border border-zinc-800">
            <p className="text-sm text-zinc-500 mb-2">El culpable era:</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl">{ROLES.find(r => r.id === correctAnswer)?.avatar}</span>
              <span className="text-xl font-bold text-white">{ROLES.find(r => r.id === correctAnswer)?.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-2xl font-bold text-white">{clues.filter(c => c.revealed).length}</p><p className="text-xs text-zinc-500">Pistas reveladas</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-2xl font-bold text-white">{chatMessages.length}</p><p className="text-xs text-zinc-500">Mensajes</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-2xl font-bold text-indigo-400">{isCorrect ? '500' : '100'}</p><p className="text-xs text-zinc-500">Puntos</p></div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors">Nuevo Caso</button>
            <button onClick={onClose} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold transition-colors">Volver al Lobby</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center"><Star className="w-5 h-5 text-indigo-400" /></div>
          <div>
            <p className="text-sm text-zinc-400">Investigación en curso</p>
            <div className="flex items-center gap-2"><span className="text-xs text-zinc-500">Pistas:</span><span className="text-sm font-bold text-white">{clues.filter(c => c.revealed).length}/{clues.length}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${timeRemaining < 300 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-white'}`}><Clock className="w-4 h-4" />{formatTime(timeRemaining)}</div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-zinc-800 bg-zinc-950 p-4 overflow-auto">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Fingerprint className="w-4 h-4" />Pistas</h3>
          <div className="space-y-2">
            {clues.map((clue) => (
              <div key={clue.id} onClick={() => !clue.revealed && handleRevealClue(clue.id)} className={`p-3 rounded-xl border cursor-pointer transition-all ${clue.revealed ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{clue.icon}</span>
                  <div className="flex-1">
                    <p className={`font-medium text-sm ${clue.revealed ? 'text-white' : 'text-zinc-500'}`}>{clue.revealed ? clue.title : '???'}</p>
                    {clue.revealed && <p className="text-xs text-zinc-400 mt-1">{clue.description}</p>}
                  </div>
                  {!clue.revealed && <Lightbulb className="w-4 h-4 text-zinc-600" />}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-zinc-900 rounded-xl">
            <h4 className="font-medium text-white mb-2 flex items-center gap-2"><Star className="w-4 h-4" />Tu Rol</h4>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{assignedRole.avatar}</span>
              <div><p className="text-sm text-white">{assignedRole.name}</p><button onClick={() => setRevealedInfo(!revealedInfo)} className="text-xs text-indigo-400 hover:text-indigo-300">{revealedInfo ? 'Ocultar info' : 'Ver info secreta'}</button></div>
            </div>
            {revealedInfo && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-zinc-400 p-2 bg-zinc-800 rounded-lg">{assignedRole.secretInfo}</motion.p>}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-zinc-900">
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`${msg.isSystem ? 'text-center' : ''}`}>
                {msg.isSystem ? (
                  <span className="inline-block px-4 py-2 bg-zinc-800 rounded-full text-sm text-zinc-400">{msg.message}</span>
                ) : (
                  <div className={`flex ${msg.sender.startsWith('Tú') ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-3 rounded-2xl ${msg.sender.startsWith('Tú') ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-zinc-800 text-zinc-300 rounded-bl-md'}`}>
                      <p className="text-xs text-zinc-400 mb-1">{msg.sender}</p>
                      <p>{msg.message}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-zinc-800">
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Haz una pregunta o comparte tu teoría..." className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500" />
              <button onClick={handleSendMessage} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>

        <div className="w-72 border-l border-zinc-800 bg-zinc-950 p-4">
          <h3 className="font-semibold text-white mb-4">Sospechosos</h3>
          <div className="space-y-2">
            {ROLES.filter(r => r.isSuspect).map((role) => (
              <div key={role.id} className="p-3 bg-zinc-900 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{role.avatar}</span>
                  <div><p className="font-medium text-white text-sm">{role.name}</p><p className="text-xs text-zinc-500">{role.alibi}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
