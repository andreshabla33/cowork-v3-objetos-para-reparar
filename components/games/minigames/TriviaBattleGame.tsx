import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Trophy, X, CheckCircle2, XCircle, Zap, Star, TrendingUp, AlertCircle } from 'lucide-react';
import type { TriviaQuestion } from '../../../types/games';

interface TriviaBattleGameProps {
 onClose: () => void;
}

const TRIVIA_QUESTIONS: TriviaQuestion[] = [
 { id: 'q1', question: '¿Cuál es el valor principal de nuestra empresa?', options: ['Innovación', 'Colaboración', 'Integridad', 'Excelencia'], correctAnswer: 1, category: 'Cultura', difficulty: 'easy', points: 100, timeLimit: 15 },
 { id: 'q2', question: '¿En qué año fue fundada la empresa?', options: ['2015', '2018', '2020', '2022'], correctAnswer: 1, category: 'Historia', difficulty: 'medium', points: 150, timeLimit: 10 },
 { id: 'q3', question: '¿Cuántos empleados tenemos actualmente?', options: ['50-100', '100-200', '200-500', '500+'], correctAnswer: 2, category: 'Empresa', difficulty: 'medium', points: 150, timeLimit: 10 },
 { id: 'q4', question: '¿Cuál es el producto/servicio estrella de la empresa?', options: ['Consultoría', 'Software', 'Marketing', 'Diseño'], correctAnswer: 1, category: 'Producto', difficulty: 'easy', points: 100, timeLimit: 15 },
 { id: 'q5', question: '¿Qué significa "OKR"?', options: ['Objectives and Key Results', 'Operations and Key Resources', 'Objectives and Knowledge Resources', 'Operations and Key Results'], correctAnswer: 0, category: 'Metodología', difficulty: 'medium', points: 200, timeLimit: 12 },
 { id: 'q6', question: '¿Cuál es el nombre de nuestra plataforma interna?', options: ['WorkHub', 'TeamSpace', 'CoworkV2', 'UnityDesk'], correctAnswer: 2, category: 'Tecnología', difficulty: 'easy', points: 100, timeLimit: 10 },
 { id: 'q7', question: '¿Qué día se celebra el Team Building mensual?', options: ['Primer viernes', 'Último viernes', 'Segundo jueves', 'Tercer miércoles'], correctAnswer: 0, category: 'Cultura', difficulty: 'hard', points: 250, timeLimit: 8 },
 { id: 'q8', question: '¿Cuál es el color corporativo principal?', options: ['Azul', 'Verde', 'Morado', 'Naranja'], correctAnswer: 2, category: 'Identidad', difficulty: 'easy', points: 100, timeLimit: 5 },
 { id: 'q9', question: '¿Qué metodología ágil usamos?', options: ['Scrum', 'Kanban', 'Extreme Programming', 'Lean'], correctAnswer: 0, category: 'Metodología', difficulty: 'medium', points: 150, timeLimit: 10 },
 { id: 'q10', question: '¿Cuál es el lema de la empresa?', options: ['Trabajando juntos', 'Innovación sin límites', 'Conectando talento', 'Creciendo unidos'], correctAnswer: 2, category: 'Cultura', difficulty: 'hard', points: 300, timeLimit: 10 },
];

interface PlayerScore {
 id: string;
 name: string;
 avatar: string;
 score: number;
 correctAnswers: number;
 streak: number;
 answered: boolean;
}

export const TriviaBattleGame: React.FC<TriviaBattleGameProps> = ({ onClose }) => {
 const [gameState, setGameState] = useState<'lobby' | 'countdown' | 'playing' | 'finished'>('lobby');
 const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
 const [timeRemaining, setTimeRemaining] = useState(0);
 const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
 const [showResult, setShowResult] = useState(false);
 const [players, setPlayers] = useState<PlayerScore[]>([
 { id: '1', name: 'Tú', avatar: '👤', score: 0, correctAnswers: 0, streak: 0, answered: false },
 { id: '2', name: 'Ana', avatar: '👩', score: 0, correctAnswers: 0, streak: 0, answered: false },
 { id: '3', name: 'Carlos', avatar: '👨', score: 0, correctAnswers: 0, streak: 0, answered: false },
 { id: '4', name: 'María', avatar: '👩‍🦰', score: 0, correctAnswers: 0, streak: 0, answered: false },
 ]);
 const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);

 const currentQuestion = TRIVIA_QUESTIONS[currentQuestionIndex];
 const isLastQuestion = currentQuestionIndex === TRIVIA_QUESTIONS.length - 1;

 useEffect(() => {
 if (gameState === 'playing' && timeRemaining > 0 && !showResult) {
 const timer = setInterval(() => {
 setTimeRemaining((prev) => {
 if (prev <= 1) {
 handleTimeUp();
 return 0;
 }
 return prev - 1;
 });
 }, 1000);
 return () => clearInterval(timer);
 }
 }, [gameState, timeRemaining, showResult]);

 const handleStartGame = () => {
 setGameState('countdown');
 setTimeout(() => {
 setGameState('playing');
 startQuestion();
 }, 3000);
 };

 const startQuestion = () => {
 const question = TRIVIA_QUESTIONS[currentQuestionIndex];
 setTimeRemaining(question.timeLimit);
 setSelectedAnswer(null);
 setShowResult(false);
 setQuestionStartTime(new Date());
 setPlayers(prev => prev.map(p => ({ ...p, answered: false })));
 simulateOtherPlayers(question);
 };

 const simulateOtherPlayers = (question: TriviaQuestion) => {
 const otherPlayers = players.filter(p => p.id !== '1');
 otherPlayers.forEach((player) => {
 const delay = 2000 + Math.random() * 5000;
 setTimeout(() => {
 const isCorrect = Math.random() > 0.3;
 setPlayers(prev => prev.map(p => {
 if (p.id === player.id) {
 const newStreak = isCorrect ? p.streak + 1 : 0;
 const timeBonus = Math.floor(timeRemaining * 10);
 const streakBonus = newStreak * 50;
 const points = isCorrect ? question.points + timeBonus + streakBonus : 0;
 return { ...p, answered: true, score: p.score + points, correctAnswers: isCorrect ? p.correctAnswers + 1 : p.correctAnswers, streak: newStreak };
 }
 return p;
 }));
 }, delay);
 });
 };

 const handleAnswerSelect = (index: number) => {
 if (selectedAnswer !== null || showResult) return;
 setSelectedAnswer(index);
 const isCorrect = index === currentQuestion.correctAnswer;
 
 setPlayers(prev => prev.map(p => {
 if (p.id === '1') {
 const newStreak = isCorrect ? p.streak + 1 : 0;
 const timeBonus = Math.floor(timeRemaining * 10);
 const streakBonus = newStreak * 50;
 const points = isCorrect ? currentQuestion.points + timeBonus + streakBonus : 0;
 return { ...p, answered: true, score: p.score + points, correctAnswers: isCorrect ? p.correctAnswers + 1 : p.correctAnswers, streak: newStreak };
 }
 return p;
 }));

 setShowResult(true);
 setTimeout(() => {
 if (isLastQuestion) {
 setGameState('finished');
 } else {
 setCurrentQuestionIndex(prev => prev + 1);
 startQuestion();
 }
 }, 3000);
 };

 const handleTimeUp = () => {
 setShowResult(true);
 setPlayers(prev => prev.map(p => p.id === '1' ? { ...p, streak: 0, answered: true } : p));
 setTimeout(() => {
 if (isLastQuestion) {
 setGameState('finished');
 } else {
 setCurrentQuestionIndex(prev => prev + 1);
 startQuestion();
 }
 }, 3000);
 };

 const getAnswerStyle = (index: number) => {
 if (!showResult) return selectedAnswer === index ? 'bg-[#2E96F5] border-[rgba(46,150,245,0.3)]' : 'bg-white/50 border-[rgba(46,150,245,0.16)] hover:border-[rgba(46,150,245,0.16)] hover:bg-[rgba(46,150,245,0.08)]';
 if (index === currentQuestion.correctAnswer) return 'bg-green-500 border-green-400';
 if (selectedAnswer === index && index !== currentQuestion.correctAnswer) return 'bg-red-500 border-red-400';
 return 'bg-white/50 border-[rgba(46,150,245,0.16)] opacity-50';
 };

 const getCategoryColor = (category: string) => {
 const colors: Record<string, string> = { 'Cultura': 'bg-pink-500/20 text-pink-400', 'Historia': 'bg-[rgba(46,150,245,0.12)] text-[#1E86E5]', 'Empresa': 'bg-blue-500/20 text-blue-400', 'Producto': 'bg-green-500/20 text-green-400', 'Metodología': 'bg-[#2E96F5]/20 text-[#1E86E5]', 'Tecnología': 'bg-[#2E96F5]/20 text-[#1E86E5]', 'Identidad': 'bg-orange-500/20 text-orange-400' };
 return colors[category] || 'bg-[rgba(46,150,245,0.08)] text-[#4A6485]';
 };

 if (gameState === 'lobby') {
 return (
 <div className="h-full flex flex-col">
 <div className="flex items-center justify-between p-4 lg:p-3 border-b border-[rgba(46,150,245,0.14)]">
 <div className="flex items-center gap-3 lg:gap-2">
 <div className="w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg bg-[rgba(46,150,245,0.12)] flex items-center justify-center">
 <Zap className="w-5 h-5 lg:w-4 lg:h-4 text-[#1E86E5]" />
 </div>
 <div>
 <h2 className="text-xl lg:text-lg font-bold text-[#0B2240]">Trivia Battle</h2>
 <p className="text-xs lg:text-[10px] text-[#4A6485]">Demuestra tus conocimientos</p>
 </div>
 </div>
 <button onClick={onClose} className="p-1.5 hover:bg-[rgba(46,150,245,0.08)]0 rounded-lg"><X className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#4A6485]" /></button>
 </div>

 <div className="flex-1 flex overflow-hidden">
 <div className="flex-1 p-5 lg:p-4 space-y-4 lg:space-y-3 overflow-auto">
 <div className="grid grid-cols-4 gap-3 lg:gap-2">
 {[{ icon: Clock, value: TRIVIA_QUESTIONS.length, label: 'Preguntas' }, { icon: Users, value: '4', label: 'Jugadores' }, { icon: Trophy, value: '2.5k', label: 'Puntos máx' }, { icon: TrendingUp, value: '+50', label: 'Bonus racha' }].map((item, i) => (
 <div key={i} className="p-3 lg:p-2 bg-white/60 rounded-xl lg:rounded-lg border border-[rgba(46,150,245,0.14)]">
 <item.icon className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#4A6485] mb-1.5" />
 <p className="text-xl lg:text-lg font-bold text-[#0B2240]">{item.value}</p>
 <p className="text-[10px] lg:text-[9px] text-[#4A6485]">{item.label}</p>
 </div>
 ))}
 </div>

 <div className="space-y-3 lg:space-y-2">
 <h3 className="text-base lg:text-sm font-semibold text-[#0B2240]">Cómo jugar</h3>
 <div className="space-y-2 lg:space-y-1.5">
 {['Responde antes de que se acabe el tiempo', 'Más rápido = más puntos', 'Racha de aciertos = bonus extra', '¡Compite por el primer lugar!'].map((text, i) => (
 <div key={i} className="flex items-start gap-2">
 <div className="w-6 h-6 lg:w-5 lg:h-5 rounded-md bg-[rgba(46,150,245,0.12)] flex items-center justify-center text-[#1E86E5] font-bold text-xs lg:text-[10px]">{i + 1}</div>
 <p className="text-[#4A6485] text-sm lg:text-xs">{text}</p>
 </div>
 ))}
 </div>
 </div>

 <button onClick={handleStartGame} className="w-full py-3 lg:py-2.5 bg-[#2E96F5] hover:bg-[#4FB0FF] text-[#0B2240] rounded-xl lg:rounded-lg font-semibold text-sm lg:text-xs flex items-center justify-center gap-2 transition-colors">
 <Zap className="w-4 h-4 lg:w-3.5 lg:h-3.5" />¡Comenzar Trivia!
 </button>
 </div>

 <div className="w-64 lg:w-56 p-4 lg:p-3 border-l border-[rgba(46,150,245,0.14)] overflow-auto">
 <h3 className="text-base lg:text-sm font-semibold text-[#0B2240] mb-3 lg:mb-2">Jugadores</h3>
 <div className="space-y-2 lg:space-y-1.5">
 {players.map((player, idx) => (
 <div key={player.id} className="flex items-center gap-2 p-2.5 lg:p-2 bg-white/60 rounded-xl lg:rounded-lg">
 <span className="text-xl lg:text-lg">{player.avatar}</span>
 <div className="flex-1 min-w-0">
 <p className="font-medium text-[#0B2240] text-sm lg:text-xs truncate">{player.name}</p>
 <p className="text-[10px] lg:text-[9px] text-green-400">● En línea</p>
 </div>
 {idx === 0 && <span className="px-1.5 py-0.5 bg-[rgba(46,150,245,0.12)] text-[#1E86E5] text-[9px] lg:text-[8px] rounded-md">Tú</span>}
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
 <p className="text-[#4A6485] mb-4">El juego comienza en...</p>
 <CountdownNumber />
 </motion.div>
 </div>
 );
 }

 if (gameState === 'finished') {
 const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
 const myRank = sortedPlayers.findIndex(p => p.id === '1') + 1;

 return (
 <div className="h-full flex flex-col items-center justify-center p-8">
 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6 max-w-2xl w-full">
 <div className="w-24 h-24 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto">
 <Trophy className="w-12 h-12 text-[#1E86E5]" />
 </div>

 <div>
 <h2 className="text-4xl font-bold text-[#0B2240]">¡Trivia Finalizada!</h2>
 <p className="text-[#4A6485] mt-2">{myRank === 1 ? '¡Eres el campeón! 🎉' : `Terminaste en el lugar #${myRank}`}</p>
 </div>

 <div className="space-y-2">
 {sortedPlayers.map((player, idx) => (
 <motion.div key={player.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }} className={`flex items-center gap-4 p-4 rounded-xl border ${player.id === '1' ? 'bg-[rgba(46,150,245,0.1)] border-[rgba(46,150,245,0.3)]/30' : 'bg-white/60 border-[rgba(46,150,245,0.14)]'}`}>
 <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${idx === 0 ? 'bg-yellow-500/20 text-[#1E86E5]' : idx === 1 ? 'bg-[rgba(46,150,245,0.08)] text-[#1B3A5C]' : idx === 2 ? 'bg-orange-600/20 text-orange-400' : 'bg-white/50 text-[#4A6485]'}`}>{idx + 1}</div>
 <span className="text-2xl">{player.avatar}</span>
 <div className="flex-1 text-left">
 <p className="font-medium text-[#0B2240]">{player.name}</p>
 <p className="text-xs text-[#4A6485]">{player.correctAnswers}/{TRIVIA_QUESTIONS.length} correctas</p>
 </div>
 <div className="text-right">
 <p className="text-xl font-bold text-[#1E86E5]">{player.score.toLocaleString()}</p>
 <p className="text-xs text-[#4A6485]">puntos</p>
 </div>
 </motion.div>
 ))}
 </div>

 <div className="flex gap-4 justify-center">
 <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#2E96F5] hover:bg-[#4FB0FF] text-[#0B2240] rounded-xl font-semibold transition-colors">Jugar de Nuevo</button>
 <button onClick={onClose} className="px-6 py-3 bg-white/50 hover:bg-[rgba(46,150,245,0.08)]0 text-[#0B2240] rounded-xl font-semibold transition-colors">Volver al Lobby</button>
 </div>
 </motion.div>
 </div>
 );
 }

 return (
 <div className="h-full flex flex-col">
 <div className="flex items-center justify-between p-3 lg:p-2 border-b border-[rgba(46,150,245,0.14)] bg-white/60">
 <div className="flex items-center gap-3 lg:gap-2">
 <div className="w-8 h-8 lg:w-7 lg:h-7 rounded-lg bg-[rgba(46,150,245,0.12)] flex items-center justify-center">
 <Zap className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E86E5]" />
 </div>
 <div className="flex items-center gap-2">
 <span className={`px-1.5 py-0.5 rounded text-[10px] lg:text-[9px] font-medium ${getCategoryColor(currentQuestion.category)}`}>{currentQuestion.category}</span>
 <span className="text-[10px] lg:text-[9px] text-[#4A6485]">Pregunta {currentQuestionIndex + 1}/{TRIVIA_QUESTIONS.length}</span>
 </div>
 </div>

 <div className="flex items-center gap-3 lg:gap-2">
 <div className={`flex items-center gap-1.5 px-3 lg:px-2 py-1.5 rounded-lg font-mono text-sm lg:text-xs font-bold ${timeRemaining < 5 ? 'bg-red-500/20 text-red-400' : 'bg-white/50 text-[#0B2240]'}`}>
 <Clock className="w-3.5 h-3.5 lg:w-3 lg:h-3" />{timeRemaining}s
 </div>
 <button onClick={onClose} className="p-1.5 hover:bg-[rgba(46,150,245,0.08)]0 rounded-lg"><X className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#4A6485]" /></button>
 </div>
 </div>

 <div className="flex-1 flex overflow-hidden">
 <div className="flex-1 p-5 lg:p-4 overflow-auto">
 <AnimatePresence mode="wait">
 <motion.div key={currentQuestion.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-xl lg:max-w-lg mx-auto space-y-4 lg:space-y-3">
 <div className="text-center">
 <h3 className="text-xl lg:text-lg font-bold text-[#0B2240] leading-relaxed">{currentQuestion.question}</h3>
 <p className="text-[#4A6485] mt-1.5 text-sm lg:text-xs">Valor: <span className="text-[#1E86E5] font-semibold">{currentQuestion.points} pts</span>{timeRemaining > 0 && <span className="ml-2">+ Bonus</span>}</p>
 </div>

 <div className="grid grid-cols-1 gap-2.5 lg:gap-2">
 {currentQuestion.options.map((option, idx) => (
 <motion.button key={idx} onClick={() => handleAnswerSelect(idx)} disabled={selectedAnswer !== null || showResult} whileHover={selectedAnswer === null ? { scale: 1.01 } : {}} whileTap={selectedAnswer === null ? { scale: 0.99 } : {}} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg border-2 text-left transition-all ${getAnswerStyle(idx)}`}>
 <div className="flex items-center gap-2.5 lg:gap-2">
 <span className="w-7 h-7 lg:w-6 lg:h-6 rounded-md bg-white/50 flex items-center justify-center font-bold text-xs lg:text-[10px]">{String.fromCharCode(65 + idx)}</span>
 <span className={`font-medium text-sm lg:text-xs ${showResult && idx === currentQuestion.correctAnswer ? 'text-[#0B2240]' : showResult && idx === selectedAnswer ? 'text-[#0B2240]' : selectedAnswer === idx ? 'text-[#0B2240]' : 'text-[#1B3A5C]'}`}>{option}</span>
 {showResult && idx === currentQuestion.correctAnswer && <CheckCircle2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#0B2240] ml-auto" />}
 {showResult && selectedAnswer === idx && idx !== currentQuestion.correctAnswer && <XCircle className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#0B2240] ml-auto" />}
 </div>
 </motion.button>
 ))}
 </div>

 {showResult && (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-3 lg:p-2.5 rounded-xl lg:rounded-lg text-center text-sm lg:text-xs ${selectedAnswer === currentQuestion.correctAnswer ? 'bg-green-500/20 text-green-400' : selectedAnswer === null ? 'bg-white/50/50 text-[#4A6485]' : 'bg-red-500/20 text-red-400'}`}>
 {selectedAnswer === currentQuestion.correctAnswer ? (
 <div className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /><span>¡Correcto!</span></div>
 ) : selectedAnswer === null ? (
 <div className="flex items-center justify-center gap-2"><AlertCircle className="w-4 h-4 lg:w-3.5 lg:h-3.5" /><span>Se acabó el tiempo</span></div>
 ) : (
 <div className="flex items-center justify-center gap-2"><XCircle className="w-4 h-4 lg:w-3.5 lg:h-3.5" /><span>Incorrecto: {currentQuestion.options[currentQuestion.correctAnswer]}</span></div>
 )}
 </motion.div>
 )}
 </motion.div>
 </AnimatePresence>
 </div>

 <div className="w-56 lg:w-48 border-l border-[rgba(46,150,245,0.14)] bg-white/60 p-3 lg:p-2 overflow-auto">
 <h3 className="font-semibold text-[#0B2240] mb-3 lg:mb-2 text-sm lg:text-xs flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 lg:w-3 lg:h-3" />Clasificación</h3>
 <div className="space-y-1.5 lg:space-y-1">
 {[...players].sort((a, b) => b.score - a.score).map((player, idx) => (
 <div key={player.id} className={`p-2 lg:p-1.5 rounded-lg ${player.id === '1' ? 'bg-[rgba(46,150,245,0.1)]' : 'bg-white/60'}`}>
 <div className="flex items-center gap-1.5">
 <span className="text-xs lg:text-[10px] font-bold text-[#4A6485] w-3">{idx + 1}</span>
 <span className="text-base lg:text-sm">{player.avatar}</span>
 <div className="flex-1 min-w-0">
 <p className="font-medium text-[#0B2240] text-xs lg:text-[10px] truncate">{player.name}</p>
 <div className="flex items-center gap-1">
 {player.streak > 1 && <span className="text-[9px] lg:text-[8px] text-orange-400">🔥{player.streak}</span>}
 {player.answered && <span className="text-[9px] lg:text-[8px] text-green-400">✓</span>}
 </div>
 </div>
 <span className="font-bold text-[#1E86E5] text-xs lg:text-[10px]">{player.score.toLocaleString()}</span>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 );
};

function CountdownNumber() {
 const [count, setCount] = useState(3);
 useEffect(() => {
 if (count > 1) {
 const timer = setTimeout(() => setCount(count - 1), 1000);
 return () => clearTimeout(timer);
 }
 }, [count]);
 return <motion.span key={count} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-8xl font-bold text-[#1E86E5] inline-block">{count}</motion.span>;
}
