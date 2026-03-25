import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Clock, Users, Heart, X, Star, Zap, Shuffle, Send } from 'lucide-react';

interface SpeedNetworkingGameProps {
  onClose: () => void;
}

const CONVERSATION_PROMPTS = [
  "¿Qué te apasiona fuera del trabajo?",
  "¿Cuál es tu mayor logro profesional?",
  "¿Qué habilidad te gustaría desarrollar?",
  "¿Cuál es tu libro/película favorita?",
  "¿Qué te motiva a levantarte cada mañana?",
  "¿Cuál ha sido tu mayor desafío y cómo lo superaste?",
  "¿Qué consejo le darías a tu yo del pasado?",
  "¿Qué proyecto te gustaría liderar?",
  "¿Cuál es tu lugar favorito en el mundo?",
  "¿Qué te gusta hacer en tu tiempo libre?",
];

const MOCK_PARTICIPANTS = [
  { id: '2', name: 'Ana García', avatar: '👩', role: 'Diseñadora', department: 'Diseño' },
  { id: '3', name: 'Carlos Ruiz', avatar: '👨', role: 'Desarrollador', department: 'Tecnología' },
  { id: '4', name: 'María López', avatar: '👩‍🦰', role: 'Marketing', department: 'Marketing' },
  { id: '5', name: 'Pedro Sánchez', avatar: '👨‍🦱', role: 'Product Manager', department: 'Producto' },
  { id: '6', name: 'Laura Martínez', avatar: '👩‍🦳', role: 'HR', department: 'Recursos Humanos' },
];

const ROUND_DURATION = 180;
const TOTAL_ROUNDS = 5;

export const SpeedNetworkingGame: React.FC<SpeedNetworkingGameProps> = ({ onClose }) => {
  const [gameState, setGameState] = useState<'lobby' | 'countdown' | 'playing' | 'finished'>('lobby');
  const [currentRound, setCurrentRound] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(ROUND_DURATION);
  const [currentPartner, setCurrentPartner] = useState(MOCK_PARTICIPANTS[0]);
  const [currentPrompt, setCurrentPrompt] = useState(CONVERSATION_PROMPTS[0]);
  const [conversations, setConversations] = useState<{partner: string; prompt: string; rating?: number}[]>([]);
  const [chatMessages, setChatMessages] = useState<{sender: string; message: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showRating, setShowRating] = useState(false);
  const [connections, setConnections] = useState<string[]>([]);

  useEffect(() => {
    if (gameState === 'playing' && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) { handleRoundEnd(); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeRemaining, currentRound]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartGame = () => {
    setGameState('countdown');
    setTimeout(() => { setGameState('playing'); startRound(0); }, 3000);
  };

  const startRound = (round: number) => {
    setCurrentRound(round);
    setTimeRemaining(ROUND_DURATION);
    setCurrentPartner(MOCK_PARTICIPANTS[round]);
    setCurrentPrompt(CONVERSATION_PROMPTS[Math.floor(Math.random() * CONVERSATION_PROMPTS.length)]);
    setChatMessages([]);
    setShowRating(false);
    setTimeout(() => { addMessage(MOCK_PARTICIPANTS[round].name, `¡Hola! Soy ${MOCK_PARTICIPANTS[round].name}, ${MOCK_PARTICIPANTS[round].role} en ${MOCK_PARTICIPANTS[round].department}.`); }, 1000);
  };

  const addMessage = (sender: string, message: string) => {
    setChatMessages(prev => [...prev, { sender, message }]);
  };

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      addMessage('Tú', chatInput);
      setChatInput('');
      setTimeout(() => {
        const responses = ['¡Qué interesante! Cuéntame más.', 'Me encanta esa perspectiva.', 'Nunca lo había pensado así.', '¡Totalmente de acuerdo!', 'Eso suena increíble.'];
        addMessage(currentPartner.name, responses[Math.floor(Math.random() * responses.length)]);
      }, 1500 + Math.random() * 2000);
    }
  };

  const handleRoundEnd = () => { setShowRating(true); };

  const handleRateConversation = (rating: number) => {
    setConversations(prev => [...prev, { partner: currentPartner.name, prompt: currentPrompt, rating }]);
    if (rating >= 4) setConnections(prev => [...prev, currentPartner.name]);
    if (currentRound < TOTAL_ROUNDS - 1) { setShowRating(false); startRound(currentRound + 1); }
    else setGameState('finished');
  };

  if (gameState === 'lobby') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 lg:p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4 lg:gap-3">
            <div className="w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg bg-pink-500/20 flex items-center justify-center"><MessageCircle className="w-6 h-6 lg:w-5 lg:h-5 text-pink-400" /></div>
            <div><h2 className="text-2xl lg:text-xl font-bold text-white">Speed Networking</h2><p className="text-sm lg:text-xs text-zinc-400">Conecta con tus compañeros rápidamente</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>

        <div className="flex-1 flex">
          <div className="flex-1 p-8 lg:p-5 space-y-6 lg:space-y-4">
            <div className="grid grid-cols-4 gap-4 lg:gap-3">
              {[{ icon: Clock, value: '3 min', label: 'Por conversación' }, { icon: Users, value: TOTAL_ROUNDS.toString(), label: 'Conexiones' }, { icon: Heart, value: '15+', label: 'Temas' }, { icon: Zap, value: '15 min', label: 'Total' }].map((item, i) => (
                <div key={i} className="p-4 lg:p-3 bg-zinc-900 rounded-xl lg:rounded-lg border border-zinc-800">
                  <item.icon className="w-5 h-5 lg:w-4 lg:h-4 text-zinc-400 mb-2 lg:mb-1.5" />
                  <p className="text-2xl lg:text-xl font-bold text-white">{item.value}</p>
                  <p className="text-xs lg:text-[10px] text-zinc-500">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg lg:text-base font-semibold text-white">Cómo funciona</h3>
              <div className="space-y-3">
                {['Se te emparejará aleatoriamente con un compañero', 'Tienes 3 minutos para conversar sobre el tema sugerido', 'Califica la conversación al final de cada ronda', '¡Conecta con quienes tengan intereses similares!'].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center text-pink-400 font-bold text-sm">{i + 1}</div>
                    <p className="text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleStartGame} className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Shuffle className="w-5 h-5" />Comenzar Networking
            </button>
          </div>

          <div className="w-80 lg:w-64 p-6 lg:p-4 border-l border-zinc-800">
            <h3 className="text-lg lg:text-base font-semibold text-white mb-4 lg:mb-3">Participantes</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-pink-500/10 rounded-xl border border-pink-500/30">
                <span className="text-2xl lg:text-xl">👤</span><div><p className="font-medium text-white">Tú</p><p className="text-xs text-pink-400">Jugador</p></div>
              </div>
              {MOCK_PARTICIPANTS.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-zinc-900 rounded-xl">
                  <span className="text-2xl lg:text-xl">{p.avatar}</span><div><p className="font-medium text-white">{p.name}</p><p className="text-xs text-zinc-500">{p.role}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'countdown') {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <p className="text-zinc-400 mb-4">Preparando conexiones...</p>
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="text-6xl">🔗</motion.div>
          <p className="text-zinc-500 mt-4">Emparejando participantes</p>
        </motion.div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const avgRating = conversations.reduce((sum, c) => sum + (c.rating || 0), 0) / conversations.length;
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6 max-w-xl w-full">
          <div className="w-24 h-24 rounded-full bg-pink-500/20 flex items-center justify-center mx-auto"><Heart className="w-12 h-12 text-pink-400" /></div>
          <div><h2 className="text-4xl font-bold text-white">¡Networking Completado!</h2><p className="text-zinc-400 mt-2">Has conectado con {connections.length} compañeros</p></div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-white">{conversations.length}</p><p className="text-xs text-zinc-500">Conversaciones</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-pink-400">{connections.length}</p><p className="text-xs text-zinc-500">Conexiones</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-amber-400">{avgRating.toFixed(1)}</p><p className="text-xs text-zinc-500">Calificación promedio</p></div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Tus conexiones</h3>
            <div className="flex flex-wrap gap-2 justify-center">
              {connections.map((name, idx) => (<span key={idx} className="px-3 py-1 bg-pink-500/20 text-pink-400 rounded-full text-sm">{name}</span>))}
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-semibold transition-colors">Jugar de Nuevo</button>
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
          <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center"><MessageCircle className="w-5 h-5 text-pink-400" /></div>
          <div>
            <p className="text-sm text-zinc-400">Ronda {currentRound + 1} de {TOTAL_ROUNDS}</p>
            <div className="w-32 h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden"><motion.div className="h-full bg-pink-500" initial={{ width: 0 }} animate={{ width: `${((currentRound + 1) / TOTAL_ROUNDS) * 100}%` }} /></div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${timeRemaining < 30 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-white'}`}><Clock className="w-4 h-4" />{formatTime(timeRemaining)}</div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-zinc-800 bg-zinc-950 p-6">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-4xl mx-auto">{currentPartner.avatar}</div>
            <div><h3 className="text-xl font-bold text-white">{currentPartner.name}</h3><p className="text-pink-400">{currentPartner.role}</p><p className="text-sm text-zinc-500">{currentPartner.department}</p></div>
          </div>
          <div className="mt-8">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Tema sugerido</p>
            <div className="p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl"><p className="text-pink-200 text-sm">{currentPrompt}</p></div>
          </div>
          <button onClick={handleRoundEnd} className="w-full mt-6 py-3 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-white rounded-xl text-sm transition-colors">Saltar conversación</button>
        </div>

        <div className="flex-1 flex flex-col bg-zinc-900">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'Tú' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] px-4 py-3 rounded-2xl ${msg.sender === 'Tú' ? 'bg-pink-600 text-white rounded-br-md' : 'bg-zinc-800 text-zinc-300 rounded-bl-md'}`}><p>{msg.message}</p></div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Escribe un mensaje..." className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500" />
              <button onClick={handleSendMessage} className="px-4 py-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl transition-colors"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showRating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full mx-4 border border-zinc-700 text-center">
              <p className="text-zinc-400 mb-2">¿Cómo fue tu conversación con</p>
              <h3 className="text-2xl font-bold text-white mb-6">{currentPartner.name}?</h3>
              <div className="flex justify-center gap-2 mb-8">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button key={star} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} onClick={() => handleRateConversation(star)} className="text-4xl text-zinc-600 hover:text-yellow-400 transition-colors">★</motion.button>
                ))}
              </div>
              <p className="text-sm text-zinc-500">4-5 estrellas = Conexión guardada</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
