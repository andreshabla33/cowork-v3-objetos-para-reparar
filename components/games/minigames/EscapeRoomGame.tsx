import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 Clock, 
 Users, 
 Lightbulb, 
 Lock, 
 Unlock, 
 ArrowRight,
 X,
 Trophy,
 AlertCircle,
 CheckCircle2,
 MessageSquare,
 Send
} from 'lucide-react';
import type { Player } from '../../../types/games';

interface EscapeRoomGameProps {
 onClose: () => void;
}

interface Puzzle {
 id: string;
 title: string;
 description: string;
 hint: string;
 answer: string;
 type: 'code' | 'riddle' | 'pattern' | 'sequence';
}

const PUZZLES: Puzzle[] = [
 {
 id: 'puzzle-1',
 title: 'El Código de Acceso',
 description: 'Encuentra el patrón en la secuencia: 2, 6, 12, 20, 30, ?',
 hint: 'Piensa en números consecutivos multiplicados...',
 answer: '42',
 type: 'sequence',
 },
 {
 id: 'puzzle-2',
 title: 'La Clave Secreta',
 description: 'Soy algo que puedes romper sin tocarme. ¿Qué soy?',
 hint: 'Se relaciona con el sonido y las promesas...',
 answer: 'silencio',
 type: 'riddle',
 },
 {
 id: 'puzzle-3',
 title: 'El Patrón Visual',
 description: 'Completa la serie: 🔴🔵🔴🔴🔵🔵🔴🔴🔴?',
 hint: 'Cuenta cuántos círculos de cada color hay...',
 answer: '🔵',
 type: 'pattern',
 },
 {
 id: 'puzzle-4',
 title: 'El Código Numérico',
 description: 'Si A=1, B=2, C=3... ¿Qué palabra es 20-5-1-13?',
 hint: 'Convierte cada número a su letra correspondiente...',
 answer: 'team',
 type: 'code',
 },
 {
 id: 'puzzle-5',
 title: 'La Última Cerradura',
 description: 'Tengo ciudades pero no casas, montañas pero no árboles, agua pero no peces. ¿Qué soy?',
 hint: 'Lo usas para navegar y encontrar ubicaciones...',
 answer: 'mapa',
 type: 'riddle',
 },
];

const GAME_DURATION = 30 * 60;
const LOOP_ANIMATIONS = ['idle', 'walk', 'run', 'dance'];

export const EscapeRoomGame: React.FC<EscapeRoomGameProps> = ({ onClose }) => {
 const [gameState, setGameState] = useState<'lobby' | 'playing' | 'paused' | 'finished'>('lobby');
 const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION);
 const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
 const [answer, setAnswer] = useState('');
 const [hintsUsed, setHintsUsed] = useState(0);
 const [solvedPuzzles, setSolvedPuzzles] = useState<string[]>([]);
 const [showHint, setShowHint] = useState(false);
 const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
 const [chatMessages, setChatMessages] = useState<{user: string; message: string; time: Date}[]>([]);
 const [chatInput, setChatInput] = useState('');
 const [players] = useState<Player[]>([
 { id: '1', name: 'Tú', avatar: '👤', role: 'player', isReady: true, score: 0, achievements: [], joinedAt: new Date() },
 { id: '2', name: 'Ana', avatar: '👩', role: 'player', isReady: true, score: 0, achievements: [], joinedAt: new Date() },
 { id: '3', name: 'Carlos', avatar: '👨', role: 'player', isReady: true, score: 0, achievements: [], joinedAt: new Date() },
 ]);

 const currentPuzzle = PUZZLES[currentPuzzleIndex];
 const progress = (solvedPuzzles.length / PUZZLES.length) * 100;

 useEffect(() => {
 if (gameState === 'playing' && timeRemaining > 0) {
 const timer = setInterval(() => {
 setTimeRemaining((prev) => {
 if (prev <= 1) {
 setGameState('finished');
 return 0;
 }
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
 setGameState('playing');
 setTimeRemaining(GAME_DURATION);
 addChatMessage('Sistema', '🎮 ¡El Escape Room ha comenzado! Trabajen juntos para resolver los puzzles.');
 };

 const handleSubmitAnswer = () => {
 const normalizedAnswer = answer.toLowerCase().trim();
 const normalizedCorrect = currentPuzzle.answer.toLowerCase().trim();

 if (normalizedAnswer === normalizedCorrect) {
 setFeedback('correct');
 setSolvedPuzzles([...solvedPuzzles, currentPuzzle.id]);
 addChatMessage('Sistema', `✅ ¡${players[0].name} resolvió "${currentPuzzle.title}"!`);

 setTimeout(() => {
 if (currentPuzzleIndex < PUZZLES.length - 1) {
 setCurrentPuzzleIndex(prev => prev + 1);
 setAnswer('');
 setFeedback(null);
 setShowHint(false);
 } else {
 setGameState('finished');
 }
 }, 1500);
 } else {
 setFeedback('incorrect');
 setTimeout(() => setFeedback(null), 2000);
 }
 };

 const handleUseHint = () => {
 if (hintsUsed < 3) {
 setHintsUsed(prev => prev + 1);
 setShowHint(true);
 }
 };

 const addChatMessage = (user: string, message: string) => {
 setChatMessages(prev => [...prev, { user, message, time: new Date() }]);
 };

 const handleSendChat = () => {
 if (chatInput.trim()) {
 addChatMessage('Tú', chatInput);
 setChatInput('');
 
 setTimeout(() => {
 const responses = ['¡Buena idea!', 'Probemos con eso', 'Yo creo que es otra cosa...', '¿Y si pensamos diferente?', '¡Eso tiene sentido!'];
 const randomResponse = responses[Math.floor(Math.random() * responses.length)];
 const randomPlayer = players[Math.floor(Math.random() * (players.length - 1)) + 1];
 addChatMessage(randomPlayer.name, randomResponse);
 }, 2000);
 }
 };

 const handleKeyPress = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter') {
 handleSubmitAnswer();
 }
 };

 if (gameState === 'lobby') {
 return (
 <div className="h-full flex flex-col">
 <div className="flex items-center justify-between p-6 lg:p-4 border-b border-[rgba(46,150,245,0.14)]">
 <div className="flex items-center gap-4 lg:gap-3">
 <div className="w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg bg-[#2E96F5]/20 flex items-center justify-center">
 <Lock className="w-6 h-6 lg:w-5 lg:h-5 text-[#1E86E5]" />
 </div>
 <div>
 <h2 className="text-2xl lg:text-xl font-bold text-[#0B2240]">Escape Room Virtual</h2>
 <p className="text-sm lg:text-xs text-[#4A6485]">Resuelve puzzles y escapa a tiempo</p>
 </div>
 </div>
 <button onClick={onClose} className="p-2 hover:bg-[rgba(46,150,245,0.08)]0 rounded-xl">
 <X className="w-5 h-5 text-[#4A6485]" />
 </button>
 </div>

 <div className="flex-1 flex">
 <div className="flex-1 p-8 lg:p-5 space-y-6 lg:space-y-4">
 <div className="grid grid-cols-3 gap-4 lg:gap-3">
 <div className="p-4 lg:p-3 bg-white/60 rounded-xl lg:rounded-lg border border-[rgba(46,150,245,0.14)]">
 <Clock className="w-5 h-5 lg:w-4 lg:h-4 text-[#4A6485] mb-2 lg:mb-1.5" />
 <p className="text-2xl lg:text-xl font-bold text-[#0B2240]">30 min</p>
 <p className="text-xs lg:text-[10px] text-[#4A6485]">Límite de tiempo</p>
 </div>
 <div className="p-4 lg:p-3 bg-white/60 rounded-xl lg:rounded-lg border border-[rgba(46,150,245,0.14)]">
 <Users className="w-5 h-5 lg:w-4 lg:h-4 text-[#4A6485] mb-2 lg:mb-1.5" />
 <p className="text-2xl lg:text-xl font-bold text-[#0B2240]">2-6</p>
 <p className="text-xs lg:text-[10px] text-[#4A6485]">Jugadores</p>
 </div>
 <div className="p-4 lg:p-3 bg-white/60 rounded-xl lg:rounded-lg border border-[rgba(46,150,245,0.14)]">
 <Lightbulb className="w-5 h-5 lg:w-4 lg:h-4 text-[#4A6485] mb-2 lg:mb-1.5" />
 <p className="text-2xl lg:text-xl font-bold text-[#0B2240]">{PUZZLES.length}</p>
 <p className="text-xs lg:text-[10px] text-[#4A6485]">Puzzles</p>
 </div>
 </div>

 <div className="space-y-4">
 <h3 className="text-lg lg:text-base font-semibold text-[#0B2240]">Cómo jugar</h3>
 <div className="space-y-3">
 {['Trabaja en equipo para resolver cada puzzle', 'Usa el chat para comunicarte con tus compañeros', 'Tienes 3 pistas disponibles durante el juego', '¡Escapa antes de que se acabe el tiempo!'].map((text, i) => (
 <div key={i} className="flex items-start gap-3">
 <div className="w-8 h-8 rounded-lg bg-[#2E96F5]/20 flex items-center justify-center text-[#1E86E5] font-bold text-sm">{i + 1}</div>
 <p className="text-[#4A6485]">{text}</p>
 </div>
 ))}
 </div>
 </div>

 <button onClick={handleStartGame} className="w-full py-4 bg-[#2E96F5] hover:bg-[#2E96F5] text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
 <Unlock className="w-5 h-5" />
 Iniciar Escape Room
 </button>
 </div>

 <div className="w-80 lg:w-64 p-6 lg:p-4 border-l border-[rgba(46,150,245,0.14)]">
 <h3 className="text-lg lg:text-base font-semibold text-[#0B2240] mb-4 lg:mb-3">Jugadores</h3>
 <div className="space-y-3">
 {players.map((player) => (
 <div key={player.id} className="flex items-center gap-3 p-3 bg-white/60 rounded-xl">
 <span className="text-2xl lg:text-xl">{player.avatar}</span>
 <div className="flex-1">
 <p className="font-medium text-[#0B2240]">{player.name}</p>
 <p className="text-xs text-green-400">● Listo</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 );
 }

 if (gameState === 'finished') {
 const escaped = solvedPuzzles.length === PUZZLES.length;
 const timeUsed = GAME_DURATION - timeRemaining;
 const bonusPoints = timeRemaining > 0 ? Math.floor(timeRemaining / 10) : 0;
 const totalScore = (solvedPuzzles.length * 100) + bonusPoints - (hintsUsed * 25);

 return (
 <div className="h-full flex flex-col items-center justify-center p-8">
 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6">
 <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ${escaped ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
 {escaped ? <Trophy className="w-12 h-12 text-green-400" /> : <Lock className="w-12 h-12 text-red-400" />}
 </div>

 <div>
 <h2 className={`text-4xl font-bold ${escaped ? 'text-green-400' : 'text-red-400'}`}>
 {escaped ? '¡Escapaste!' : 'Tiempo agotado'}
 </h2>
 <p className="text-[#4A6485] mt-2">{escaped ? 'Increíble trabajo en equipo. ¡Lo lograron!' : 'No te rindas, ¡inténtalo de nuevo!'}</p>
 </div>

 <div className="grid grid-cols-4 gap-4 max-w-2xl">
 <div className="p-4 bg-white/60 rounded-xl">
 <p className="text-3xl font-bold text-[#0B2240]">{solvedPuzzles.length}/{PUZZLES.length}</p>
 <p className="text-xs text-[#4A6485]">Puzzles resueltos</p>
 </div>
 <div className="p-4 bg-white/60 rounded-xl">
 <p className="text-3xl font-bold text-[#0B2240]">{formatTime(timeUsed)}</p>
 <p className="text-xs text-[#4A6485]">Tiempo usado</p>
 </div>
 <div className="p-4 bg-white/60 rounded-xl">
 <p className="text-3xl font-bold text-[#0B2240]">{hintsUsed}/3</p>
 <p className="text-xs text-[#4A6485]">Pistas usadas</p>
 </div>
 <div className="p-4 bg-white/60 rounded-xl">
 <p className="text-3xl font-bold text-[#1E86E5]">{totalScore}</p>
 <p className="text-xs text-[#4A6485]">Puntos totales</p>
 </div>
 </div>

 <div className="flex gap-4 justify-center">
 <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#2E96F5] hover:bg-[#2E96F5] text-white rounded-xl font-semibold transition-colors">Jugar de Nuevo</button>
 <button onClick={onClose} className="px-6 py-3 bg-white/50 hover:bg-[rgba(46,150,245,0.08)]0 text-[#0B2240] rounded-xl font-semibold transition-colors">Volver al Lobby</button>
 </div>
 </motion.div>
 </div>
 );
 }

 return (
 <div className="h-full flex flex-col">
 <div className="flex items-center justify-between p-4 border-b border-[rgba(46,150,245,0.14)] bg-white/60">
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 rounded-xl bg-[#2E96F5]/20 flex items-center justify-center">
 <Lock className="w-5 h-5 text-[#1E86E5]" />
 </div>
 <div>
 <h2 className="font-bold text-[#0B2240]">Escape Room</h2>
 <p className="text-xs text-[#4A6485]">Puzzle {currentPuzzleIndex + 1} de {PUZZLES.length}</p>
 </div>
 </div>

 <div className="flex items-center gap-6">
 <div className="w-48">
 <div className="flex justify-between text-xs text-[#4A6485] mb-1">
 <span>Progreso</span>
 <span>{Math.round(progress)}%</span>
 </div>
 <div className="h-2 bg-white/50 rounded-full overflow-hidden">
 <motion.div className="h-full bg-[#2E96F5]" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
 </div>
 </div>

 <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${timeRemaining < 300 ? 'bg-red-500/20 text-red-400' : 'bg-white/50 text-[#0B2240]'}`}>
 <Clock className="w-4 h-4" />
 {formatTime(timeRemaining)}
 </div>

 <div className="flex items-center gap-2 px-3 py-2 bg-white/50 rounded-xl">
 <Lightbulb className="w-4 h-4 text-[#1E86E5]" />
 <span className="text-sm text-[#0B2240]">{3 - hintsUsed}</span>
 </div>

 <button onClick={onClose} className="p-2 hover:bg-[rgba(46,150,245,0.08)]0 rounded-xl">
 <X className="w-5 h-5 text-[#4A6485]" />
 </button>
 </div>
 </div>

 <div className="flex-1 flex overflow-hidden">
 <div className="flex-1 p-8 overflow-auto">
 <AnimatePresence mode="wait">
 <motion.div key={currentPuzzle.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-2xl mx-auto space-y-6">
 <div className="text-center space-y-2">
 <span className="inline-block px-3 py-1 bg-[#2E96F5]/20 text-[#1E86E5] rounded-full text-xs font-medium">Puzzle {currentPuzzleIndex + 1}</span>
 <h3 className="text-2xl font-bold text-[#0B2240]">{currentPuzzle.title}</h3>
 </div>

 <div className="p-8 bg-white/60 rounded-2xl border border-[rgba(46,150,245,0.14)]">
 <p className="text-lg text-[#1B3A5C] text-center leading-relaxed">{currentPuzzle.description}</p>
 </div>

 {showHint && (
 <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4 bg-yellow-500/10 border border-[rgba(46,150,245,0.3)]/30 rounded-xl">
 <div className="flex items-start gap-3">
 <Lightbulb className="w-5 h-5 text-[#1E86E5] flex-shrink-0 mt-0.5" />
 <div>
 <p className="font-medium text-[#1E86E5] text-sm mb-1">Pista</p>
 <p className="text-[#1E86E5] text-sm">{currentPuzzle.hint}</p>
 </div>
 </div>
 </motion.div>
 )}

 <div className="space-y-4">
 <div className="flex gap-3">
 <input
 type="text"
 value={answer}
 onChange={(e) => setAnswer(e.target.value)}
 onKeyPress={handleKeyPress}
 placeholder="Escribe tu respuesta..."
 className={`flex-1 px-4 py-3 bg-white/60 border rounded-xl text-[#0B2240] placeholder-[#9CB0CA] focus:outline-none focus:ring-2 transition-all ${feedback === 'correct' ? 'border-green-500 focus:ring-green-500/50' : feedback === 'incorrect' ? 'border-red-500 focus:ring-red-500/50' : 'border-[rgba(46,150,245,0.16)] focus:ring-[#2E96F5]/50'}`}
 />
 <button onClick={handleSubmitAnswer} disabled={!answer.trim()} className="px-6 py-3 bg-[#2E96F5] hover:bg-[#2E96F5] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center gap-2 transition-colors">
 <ArrowRight className="w-5 h-5" />
 </button>
 </div>

 {feedback === 'correct' && (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-green-400">
 <CheckCircle2 className="w-5 h-5" />
 <span>¡Correcto! Avanzando al siguiente puzzle...</span>
 </motion.div>
 )}

 {feedback === 'incorrect' && (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-red-400">
 <AlertCircle className="w-5 h-5" />
 <span>Respuesta incorrecta. ¡Inténtalo de nuevo!</span>
 </motion.div>
 )}
 </div>

 {!showHint && hintsUsed < 3 && (
 <button onClick={handleUseHint} className="w-full py-3 border border-[rgba(46,150,245,0.16)] hover:border-[rgba(46,150,245,0.3)]/50 hover:bg-yellow-500/10 text-[#4A6485] hover:text-[#1E86E5] rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
 <Lightbulb className="w-4 h-4" />
 Usar Pista (-25 pts)
 </button>
 )}
 </motion.div>
 </AnimatePresence>
 </div>

 <div className="w-80 border-l border-[rgba(46,150,245,0.14)] flex flex-col bg-white/60">
 <div className="p-4 border-b border-[rgba(46,150,245,0.14)]">
 <h3 className="font-semibold text-[#0B2240] flex items-center gap-2">
 <MessageSquare className="w-4 h-4" />
 Chat del Equipo
 </h3>
 </div>

 <div className="flex-1 overflow-auto p-4 space-y-3">
 {chatMessages.map((msg, idx) => (
 <div key={idx} className={`${msg.user === 'Tú' ? 'ml-auto' : ''}`}>
 <div className={`inline-block max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.user === 'Sistema' ? 'bg-white/50 text-[#4A6485] w-full text-center' : msg.user === 'Tú' ? 'bg-[#2E96F5] text-white' : 'bg-white/50 text-[#1B3A5C]'}`}>
 {msg.user !== 'Sistema' && msg.user !== 'Tú' && <p className="text-xs text-[#4A6485] mb-1">{msg.user}</p>}
 <p>{msg.message}</p>
 </div>
 </div>
 ))}
 </div>

 <div className="p-4 border-t border-[rgba(46,150,245,0.14)]">
 <div className="flex gap-2">
 <input
 type="text"
 value={chatInput}
 onChange={(e) => setChatInput(e.target.value)}
 onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
 placeholder="Escribe un mensaje..."
 className="flex-1 px-3 py-2 bg-white/60 border border-[rgba(46,150,245,0.16)] rounded-lg text-[#0B2240] text-sm placeholder-[#9CB0CA] focus:outline-none focus:border-[rgba(46,150,245,0.3)]"
 />
 <button onClick={handleSendChat} className="p-2 bg-[#2E96F5] hover:bg-[#2E96F5] text-white rounded-lg transition-colors">
 <Send className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};
