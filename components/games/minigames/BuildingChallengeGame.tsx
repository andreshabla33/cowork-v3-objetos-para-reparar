import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Clock, Users, Palette, X, CheckCircle2, Hammer, Box, Trash2, Send, Trophy, ThumbsUp } from 'lucide-react';

interface BuildingChallengeGameProps {
  onClose: () => void;
}

interface BuildingBlock {
  id: string;
  type: 'cube' | 'cylinder' | 'pyramid' | 'sphere';
  color: string;
  x: number;
  y: number;
  z: number;
}

interface TeamSubmission {
  teamName: string;
  blocks: BuildingBlock[];
  votes: number;
  description: string;
}

const BLOCK_TYPES = [
  { type: 'cube' as const, icon: '⬜', name: 'Cubo' },
  { type: 'cylinder' as const, icon: '🛢️', name: 'Cilindro' },
  { type: 'pyramid' as const, icon: '🔺', name: 'Pirámide' },
  { type: 'sphere' as const, icon: '🔵', name: 'Esfera' },
];

const COLORS = [
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Amarillo', value: '#eab308' },
  { name: 'Morado', value: '#a855f7' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
];

const CHALLENGES = [
  { title: 'Torre Colaborativa', description: 'Construye la torre más alta y estable que puedas imaginar.', criteria: 'Altura, estabilidad y creatividad' },
  { title: 'Logo de la Empresa', description: 'Recrea el logo de la empresa usando bloques de colores.', criteria: 'Precisión, uso del color y reconocibilidad' },
  { title: 'Ciudad del Futuro', description: 'Diseña cómo será nuestra oficina en el año 2050.', criteria: 'Innovación, funcionalidad y estética' },
  { title: 'Puente Ingenioso', description: 'Construye un puente que conecte dos puntos.', criteria: 'Estabilidad, longitud y diseño' },
];

const GAME_DURATION = 35 * 60;

export const BuildingChallengeGame: React.FC<BuildingChallengeGameProps> = ({ onClose }) => {
  const [gameState, setGameState] = useState<'lobby' | 'building' | 'voting' | 'finished'>('lobby');
  const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION);
  const [currentChallenge, setCurrentChallenge] = useState(CHALLENGES[0]);
  const [selectedBlockType, setSelectedBlockType] = useState(BLOCK_TYPES[0].type);
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [blocks, setBlocks] = useState<BuildingBlock[]>([]);
  const [submissions, setSubmissions] = useState<TeamSubmission[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (gameState === 'building' && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) { handleTimeUp(); return 0; }
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
    const randomChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    setCurrentChallenge(randomChallenge);
    setGameState('building');
    setTimeRemaining(GAME_DURATION);
    setBlocks([]);
    setHasSubmitted(false);
    setVotedFor(null);
    setDescription('');
  };

  const handleTimeUp = () => {
    if (!hasSubmitted) handleSubmit();
    setGameState('voting');
  };

  const handleAddBlock = () => {
    const newBlock: BuildingBlock = {
      id: `block-${Date.now()}`,
      type: selectedBlockType,
      color: selectedColor,
      x: Math.floor(Math.random() * 5) - 2,
      y: blocks.length * 0.5,
      z: Math.floor(Math.random() * 5) - 2,
    };
    setBlocks(prev => [...prev, newBlock]);
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const handleClearAll = () => { setBlocks([]); };

  const handleSubmit = () => {
    const submission: TeamSubmission = { teamName: 'Tu Equipo', blocks: blocks, votes: 0, description: description || 'Nuestra creación' };
    const mockSubmissions: TeamSubmission[] = [
      { teamName: 'Equipo Alpha', blocks: generateRandomBlocks(), votes: 0, description: 'Diseño innovador con enfoque en funcionalidad' },
      { teamName: 'Equipo Beta', blocks: generateRandomBlocks(), votes: 0, description: 'Creatividad sin límites' },
      { teamName: 'Equipo Gamma', blocks: generateRandomBlocks(), votes: 0, description: 'Estabilidad y elegancia' },
    ];
    setSubmissions([submission, ...mockSubmissions]);
    setHasSubmitted(true);
  };

  const generateRandomBlocks = (): BuildingBlock[] => {
    const numBlocks = 10 + Math.floor(Math.random() * 20);
    return Array.from({ length: numBlocks }, (_, i) => ({
      id: `mock-${i}`,
      type: BLOCK_TYPES[Math.floor(Math.random() * BLOCK_TYPES.length)].type,
      color: COLORS[Math.floor(Math.random() * COLORS.length)].value,
      x: Math.floor(Math.random() * 6) - 3,
      y: i * 0.5,
      z: Math.floor(Math.random() * 6) - 3,
    }));
  };

  const handleVote = (teamName: string) => {
    if (!votedFor) {
      setVotedFor(teamName);
      setSubmissions(prev => prev.map(s => s.teamName === teamName ? { ...s, votes: s.votes + 1 } : s));
    }
  };

  const handleFinishVoting = () => { setGameState('finished'); };

  if (gameState === 'lobby') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 lg:p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4 lg:gap-3">
            <div className="w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg bg-cyan-500/20 flex items-center justify-center"><Building2 className="w-6 h-6 lg:w-5 lg:h-5 text-cyan-400" /></div>
            <div><h2 className="text-2xl lg:text-xl font-bold text-white">Desafío de Construcción</h2><p className="text-sm lg:text-xs text-zinc-400">Construye, crea y colabora</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>

        <div className="flex-1 flex">
          <div className="flex-1 p-8 lg:p-5 space-y-6 lg:space-y-4">
            <div className="grid grid-cols-4 gap-4 lg:gap-3">
              {[{ icon: Clock, value: '35 min', label: 'Construcción' }, { icon: Users, value: '4', label: 'Equipos' }, { icon: Box, value: '∞', label: 'Bloques' }, { icon: Palette, value: '8', label: 'Colores' }].map((item, i) => (
                <div key={i} className="p-4 lg:p-3 bg-zinc-900 rounded-xl lg:rounded-lg border border-zinc-800">
                  <item.icon className="w-5 h-5 lg:w-4 lg:h-4 text-zinc-400 mb-2 lg:mb-1.5" />
                  <p className="text-2xl lg:text-xl font-bold text-white">{item.value}</p>
                  <p className="text-xs lg:text-[10px] text-zinc-500">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg lg:text-base font-semibold text-white">Desafíos Posibles</h3>
              <div className="grid grid-cols-2 gap-3">
                {CHALLENGES.map((challenge, idx) => (
                  <div key={idx} className="p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                    <h4 className="font-medium text-white mb-1">{challenge.title}</h4>
                    <p className="text-sm text-zinc-500">{challenge.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg lg:text-base font-semibold text-white">Cómo jugar</h3>
              <div className="space-y-3">
                {['Recibe un desafío aleatorio al inicio', 'Usa bloques de diferentes formas y colores', 'Construye siguiendo el criterio del desafío', 'Vota por la mejor creación al final'].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">{i + 1}</div>
                    <p className="text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleStartGame} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Hammer className="w-5 h-5" />Comenzar a Construir
            </button>
          </div>

          <div className="w-80 lg:w-64 p-6 lg:p-4 border-l border-zinc-800">
            <h3 className="text-lg lg:text-base font-semibold text-white mb-4 lg:mb-3">Tipos de Bloques</h3>
            <div className="grid grid-cols-2 gap-3">
              {BLOCK_TYPES.map((block) => (
                <div key={block.type} className="p-3 bg-zinc-900 rounded-xl text-center">
                  <span className="text-3xl lg:text-2xl">{block.icon}</span>
                  <p className="text-sm lg:text-xs text-zinc-400 mt-1">{block.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'voting') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center"><ThumbsUp className="w-5 h-5 text-cyan-400" /></div>
            <div><h2 className="font-bold text-white">Votación</h2><p className="text-sm text-zinc-500">Elige tu creación favorita</p></div>
          </div>
          <button onClick={handleFinishVoting} className="px-4 py-2 bg-cyan-600 text-white rounded-lg">Ver Resultados</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
            {submissions.map((submission, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} className={`p-6 rounded-2xl border-2 transition-all ${votedFor === submission.teamName ? 'bg-cyan-500/10 border-cyan-500' : 'bg-zinc-900 border-zinc-800'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white">{submission.teamName}</h3>
                  {votedFor === submission.teamName && <CheckCircle2 className="w-5 h-5 text-cyan-400" />}
                </div>
                <div className="aspect-video bg-zinc-950 rounded-xl mb-4 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative w-32 h-32">
                      {submission.blocks.slice(0, 15).map((block, bidx) => (
                        <div key={bidx} className="absolute w-4 h-4 rounded-sm" style={{ backgroundColor: block.color, left: `${50 + block.x * 10}%`, bottom: `${block.y * 15}%` }} />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 mb-4">{submission.description}</p>
                <button onClick={() => handleVote(submission.teamName)} disabled={votedFor !== null} className={`w-full py-3 rounded-xl font-semibold transition-colors ${votedFor === submission.teamName ? 'bg-cyan-600 text-white' : votedFor !== null ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-zinc-800 hover:bg-zinc-700 text-white'}`}>
                  {votedFor === submission.teamName ? '¡Votado!' : 'Votar'}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const winner = submissions.reduce((prev, current) => prev.votes > current.votes ? prev : current);
    const myRank = submissions.sort((a, b) => b.votes - a.votes).findIndex(s => s.teamName === 'Tu Equipo') + 1;

    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6 max-w-xl">
          <div className="w-24 h-24 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto"><Trophy className="w-12 h-12 text-yellow-400" /></div>

          <div><h2 className="text-4xl font-bold text-white">¡Desafío Completado!</h2><p className="text-zinc-400 mt-2">{myRank === 1 ? '¡Tu equipo ganó!' : `Tu equipo quedó en lugar #${myRank}`}</p></div>

          <div className="p-6 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-2xl border border-yellow-500/30">
            <p className="text-sm text-yellow-400 mb-2">Ganador</p>
            <h3 className="text-2xl font-bold text-white">{winner.teamName}</h3>
            <p className="text-4xl font-bold text-yellow-400 mt-2">{winner.votes} votos</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Clasificación Final</h3>
            <div className="space-y-2">
              {[...submissions].sort((a, b) => b.votes - a.votes).map((sub, idx) => (
                <div key={idx} className={`flex items-center justify-between p-3 rounded-xl ${sub.teamName === 'Tu Equipo' ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-zinc-900'}`}>
                  <div className="flex items-center gap-3"><span className="text-lg font-bold text-zinc-500 w-6">{idx + 1}</span><span className="font-medium text-white">{sub.teamName}</span></div>
                  <span className="font-bold text-cyan-400">{sub.votes} votos</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-colors">Nuevo Desafío</button>
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
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center"><Building2 className="w-5 h-5 text-cyan-400" /></div>
          <div><h2 className="font-bold text-white">{currentChallenge.title}</h2><p className="text-xs text-zinc-500">{currentChallenge.criteria}</p></div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${timeRemaining < 300 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-white'}`}><Clock className="w-4 h-4" />{formatTime(timeRemaining)}</div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 lg:w-60 border-r border-zinc-800 bg-zinc-950 p-4 lg:p-3 overflow-auto">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Box className="w-4 h-4" />Tipo de Bloque</h3>
            <div className="grid grid-cols-2 gap-2">
              {BLOCK_TYPES.map((block) => (
                <button key={block.type} onClick={() => setSelectedBlockType(block.type)} className={`p-3 lg:p-2 rounded-xl lg:rounded-lg border text-center transition-all ${selectedBlockType === block.type ? 'bg-cyan-500/20 border-cyan-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                  <span className="text-2xl lg:text-xl">{block.icon}</span>
                  <p className="text-xs lg:text-[10px] text-zinc-400 mt-1">{block.name}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Palette className="w-4 h-4" />Color</h3>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((color) => (
                <button key={color.value} onClick={() => setSelectedColor(color.value)} className={`aspect-square rounded-lg border-2 transition-all ${selectedColor === color.value ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: color.value }} title={color.name} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button onClick={handleAddBlock} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"><Box className="w-4 h-4" />Añadir Bloque</button>
            <button onClick={handleClearAll} className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"><Trash2 className="w-4 h-4" />Limpiar Todo</button>
          </div>

          <div className="mt-6 lg:mt-4 p-4 lg:p-3 bg-zinc-900 rounded-xl lg:rounded-lg"><p className="text-sm lg:text-xs text-zinc-500 mb-1">Bloques usados</p><p className="text-2xl lg:text-xl font-bold text-white">{blocks.length}</p></div>
        </div>

        <div className="flex-1 bg-gradient-to-b from-zinc-900 to-zinc-950 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-96 h-96">
              {blocks.map((block) => (
                <motion.div key={block.id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute cursor-pointer hover:scale-110 transition-transform" style={{ backgroundColor: block.color, width: '32px', height: '32px', left: `${50 + block.x * 15}%`, bottom: `${10 + block.y * 10}%`, borderRadius: block.type === 'sphere' ? '50%' : block.type === 'cylinder' ? '4px 4px 12px 12px' : '4px', clipPath: block.type === 'pyramid' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none' }} onClick={() => handleRemoveBlock(block.id)} title="Click para eliminar" />
              ))}
            </div>
          </div>

          {!hasSubmitted && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <div className="bg-zinc-900/90 backdrop-blur p-4 rounded-2xl border border-zinc-700">
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe tu creación..." className="w-64 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 mb-3 focus:outline-none focus:border-cyan-500" />
                <button onClick={handleSubmit} disabled={blocks.length === 0} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"><Send className="w-4 h-4" />Enviar Creación</button>
              </div>
            </div>
          )}

          {hasSubmitted && (
            <div className="absolute top-4 right-4 bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-2">
              <p className="text-green-400 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />¡Creación enviada!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
