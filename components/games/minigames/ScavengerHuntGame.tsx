import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, MapPin, Trophy, X, CheckCircle2, Star, Compass, Lightbulb, Target } from 'lucide-react';
import type { ScavengerItem } from '../../../types/games';

interface ScavengerHuntGameProps {
  onClose: () => void;
}

const SCAVENGER_ITEMS: ScavengerItem[] = [
  { id: 'item1', name: 'Trofeo Dorado', description: 'Un símbolo de victoria escondido en la zona de descanso', hint: 'Busca donde los campeones dejan sus premios', points: 100, found: false, icon: '🏆', location: { x: 10, y: 0, z: 5 } },
  { id: 'item2', name: 'Libro Antiguo', description: 'Conocimiento ancestral esperando ser descubierto', hint: 'Donde se guardan las historias del pasado', points: 150, found: false, icon: '📚', location: { x: -8, y: 2, z: -3 } },
  { id: 'item3', name: 'Gema Misteriosa', description: 'Un cristal brillante que irradia energía', hint: 'Brilla más cerca de las ventanas', points: 200, found: false, icon: '💎', location: { x: 5, y: 1, z: 8 } },
  { id: 'item4', name: 'Llave Maestra', description: 'Abre las puertas del conocimiento', hint: 'Cerca de donde se toman las decisiones importantes', points: 250, found: false, icon: '🔑', location: { x: -5, y: 0, z: -8 } },
  { id: 'item5', name: 'Poción Mágica', description: 'Bebida que otorga sabiduría', hint: 'Donde la gente se reúne para conversar', points: 100, found: false, icon: '🧪', location: { x: 12, y: 0, z: -2 } },
  { id: 'item6', name: 'Mapa del Tesoro', description: 'Guía hacia riquezas ocultas', hint: 'En la pared donde se planean las estrategias', points: 300, found: false, icon: '🗺️', location: { x: -10, y: 3, z: 5 } },
  { id: 'item7', name: 'Reloj de Arena', description: 'Controla el tiempo de los participantes', hint: 'Donde el tiempo es más valioso', points: 150, found: false, icon: '⏳', location: { x: 3, y: 2, z: -5 } },
  { id: 'item8', name: 'Planta Mística', description: 'Crecimiento y prosperidad', hint: 'Donde la naturaleza encuentra su lugar', points: 100, found: false, icon: '🌿', location: { x: -3, y: 0, z: 10 } },
];

const GAME_DURATION = 25 * 60;

export const ScavengerHuntGame: React.FC<ScavengerHuntGameProps> = ({ onClose }) => {
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION);
  const [items, setItems] = useState<ScavengerItem[]>(SCAVENGER_ITEMS);
  const [selectedItem, setSelectedItem] = useState<ScavengerItem | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [foundItems, setFoundItems] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });
  const [nearbyItems, setNearbyItems] = useState<string[]>([]);

  const foundCount = foundItems.length;
  const totalItems = items.length;
  const progress = (foundCount / totalItems) * 100;

  useEffect(() => {
    if (gameState === 'playing' && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) { setGameState('finished'); return 0; }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState, timeRemaining]);

  useEffect(() => {
    if (gameState === 'playing') {
      const nearby = items.filter(item => !item.found).filter(item => {
        const distance = Math.sqrt(Math.pow(item.location!.x - playerPosition.x, 2) + Math.pow(item.location!.z - playerPosition.z, 2));
        return distance < 5;
      }).map(item => item.id);
      setNearbyItems(nearby);
    }
  }, [playerPosition, items, gameState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartGame = () => {
    setGameState('playing');
    setTimeRemaining(GAME_DURATION);
    setFoundItems([]);
    setScore(0);
  };

  const handleFindItem = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item || item.found) return;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, found: true, foundAt: new Date() } : i));
    setFoundItems(prev => [...prev, itemId]);
    setScore(prev => prev + item.points);
    setSelectedItem(null);
  };

  const handleMove = (direction: 'forward' | 'backward' | 'left' | 'right') => {
    const step = 2;
    setPlayerPosition(prev => {
      switch (direction) {
        case 'forward': return { ...prev, z: prev.z + step };
        case 'backward': return { ...prev, z: prev.z - step };
        case 'left': return { ...prev, x: prev.x - step };
        case 'right': return { ...prev, x: prev.x + step };
        default: return prev;
      }
    });
  };

  if (gameState === 'lobby') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 lg:p-4 border-b border-zinc-800">
          <div className="flex items-center gap-4 lg:gap-3">
            <div className="w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Search className="w-6 h-6 lg:w-5 lg:h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl lg:text-xl font-bold text-white">Scavenger Hunt 3D</h2>
              <p className="text-sm lg:text-xs text-zinc-400">Explora y encuentra objetos ocultos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>

        <div className="flex-1 flex">
          <div className="flex-1 p-8 lg:p-5 space-y-6 lg:space-y-4">
            <div className="grid grid-cols-4 gap-4 lg:gap-3">
              {[{ icon: Clock, value: '25 min', label: 'Límite de tiempo' }, { icon: Target, value: totalItems.toString(), label: 'Objetos' }, { icon: Star, value: '1.4k', label: 'Puntos máx' }, { icon: Compass, value: '3D', label: 'Exploración' }].map((item, i) => (
                <div key={i} className="p-4 lg:p-3 bg-zinc-900 rounded-xl lg:rounded-lg border border-zinc-800">
                  <item.icon className="w-5 h-5 lg:w-4 lg:h-4 text-zinc-400 mb-2 lg:mb-1.5" />
                  <p className="text-2xl lg:text-xl font-bold text-white">{item.value}</p>
                  <p className="text-xs lg:text-[10px] text-zinc-500">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-lg lg:text-base font-semibold text-white">Cómo jugar</h3>
              <div className="space-y-3">
                {['Explora el espacio 3D usando los controles de movimiento', 'Acércate a los objetos para poder recolectarlos', 'Usa las pistas si necesitas ayuda (costo: -25 pts)', '¡Encuentra todos los objetos antes de que se acabe el tiempo!'].map((text, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">{i + 1}</div>
                    <p className="text-zinc-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleStartGame} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
              <Compass className="w-5 h-5" />Comenzar Exploración
            </button>
          </div>

          <div className="w-80 lg:w-64 p-6 lg:p-4 border-l border-zinc-800">
            <h3 className="text-lg lg:text-base font-semibold text-white mb-4 lg:mb-3">Objetos a encontrar</h3>
            <div className="grid grid-cols-4 gap-2">
              {items.map((item) => (
                <div key={item.id} className="aspect-square bg-zinc-900 rounded-xl lg:rounded-lg flex items-center justify-center text-2xl lg:text-xl border border-zinc-800 opacity-50">{item.icon}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    const allFound = foundCount === totalItems;
    const timeUsed = GAME_DURATION - timeRemaining;
    const timeBonus = timeRemaining > 0 ? Math.floor(timeRemaining / 5) : 0;
    const totalScore = score + timeBonus;

    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto ${allFound ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
            {allFound ? <Trophy className="w-12 h-12 text-green-400" /> : <Search className="w-12 h-12 text-amber-400" />}
          </div>

          <div>
            <h2 className={`text-4xl font-bold ${allFound ? 'text-green-400' : 'text-amber-400'}`}>{allFound ? '¡Todos encontrados!' : '¡Tiempo agotado!'}</h2>
            <p className="text-zinc-400 mt-2">{allFound ? 'Increíble trabajo de exploración' : `Encontraste ${foundCount} de ${totalItems} objetos`}</p>
          </div>

          <div className="grid grid-cols-4 gap-4 max-w-2xl">
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-white">{foundCount}/{totalItems}</p><p className="text-xs text-zinc-500">Objetos</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-white">{formatTime(timeUsed)}</p><p className="text-xs text-zinc-500">Tiempo</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-emerald-400">{score}</p><p className="text-xs text-zinc-500">Puntos base</p></div>
            <div className="p-4 bg-zinc-900 rounded-xl"><p className="text-3xl font-bold text-violet-400">{totalScore}</p><p className="text-xs text-zinc-500">Total</p></div>
          </div>

          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors">Jugar de Nuevo</button>
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
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Search className="w-5 h-5 text-emerald-400" /></div>
          <div>
            <div className="flex items-center gap-2"><span className="text-sm text-zinc-400">Objetos:</span><span className="font-bold text-white">{foundCount}/{totalItems}</span></div>
            <div className="w-32 h-2 bg-zinc-800 rounded-full mt-1 overflow-hidden"><motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-xl"><Star className="w-4 h-4 text-amber-400" /><span className="font-bold text-white">{score}</span></div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${timeRemaining < 300 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-white'}`}><Clock className="w-4 h-4" />{formatTime(timeRemaining)}</div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl"><X className="w-5 h-5 text-zinc-400" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-gradient-to-b from-zinc-900 to-zinc-950">
          <div className="absolute top-4 left-4 w-48 h-48 bg-zinc-900/90 rounded-xl border border-zinc-700 p-4">
            <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> Mini Mapa</p>
            <div className="relative w-full h-full">
              <motion.div className="absolute w-3 h-3 bg-emerald-500 rounded-full" style={{ left: `${50 + (playerPosition.x / 20) * 50}%`, top: `${50 - (playerPosition.z / 20) * 50}%` }} />
              {items.filter(i => !i.found).map((item) => (
                <div key={item.id} className="absolute w-2 h-2 bg-amber-500 rounded-full animate-pulse" style={{ left: `${50 + (item.location!.x / 20) * 50}%`, top: `${50 - (item.location!.z / 20) * 50}%` }} />
              ))}
            </div>
          </div>

          {nearbyItems.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="absolute top-4 right-4 bg-amber-500/20 border border-amber-500/40 rounded-xl px-4 py-3">
              <p className="text-amber-400 font-medium flex items-center gap-2"><Search className="w-4 h-4" />¡Objeto cercano detectado!</p>
            </motion.div>
          )}

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div className="flex flex-col items-center gap-2">
              <button onClick={() => handleMove('forward')} className="w-14 h-14 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">↑</button>
              <div className="flex gap-2">
                <button onClick={() => handleMove('left')} className="w-14 h-14 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">←</button>
                <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center"><MapPin className="w-6 h-6 text-emerald-400" /></div>
                <button onClick={() => handleMove('right')} className="w-14 h-14 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">→</button>
              </div>
              <button onClick={() => handleMove('backward')} className="w-14 h-14 bg-zinc-800/80 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors">↓</button>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 text-xs text-zinc-500 font-mono">X: {playerPosition.x.toFixed(1)} | Z: {playerPosition.z.toFixed(1)}</div>
        </div>

        <div className="w-80 border-l border-zinc-800 bg-zinc-950 overflow-auto">
          <div className="p-4">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Target className="w-4 h-4" />Lista de Objetos</h3>
            <div className="space-y-2">
              {items.map((item) => {
                const isNearby = nearbyItems.includes(item.id);
                const isFound = item.found;
                return (
                  <motion.div key={item.id} onClick={() => !isFound && setSelectedItem(item)} whileHover={!isFound ? { scale: 1.02 } : {}} className={`p-3 rounded-xl border cursor-pointer transition-all ${isFound ? 'bg-green-500/10 border-green-500/30 opacity-60' : isNearby ? 'bg-amber-500/10 border-amber-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${isFound ? 'line-through text-zinc-500' : 'text-white'}`}>{item.name}</p>
                        <p className="text-xs text-zinc-500">{item.points} pts</p>
                      </div>
                      {isFound && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                      {isNearby && !isFound && <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">Cerca</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedItem(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()} className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-zinc-700">
              <div className="text-center space-y-4">
                <span className="text-6xl">{selectedItem.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedItem.name}</h3>
                  <p className="text-zinc-400 text-sm mt-1">{selectedItem.description}</p>
                </div>

                {showHint && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400 text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4" />{selectedItem.hint}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  {!showHint && <button onClick={() => setShowHint(true)} className="flex-1 py-3 border border-zinc-700 hover:border-amber-500/50 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 rounded-xl text-sm font-medium transition-all">Ver Pista (-25 pts)</button>}
                  {nearbyItems.includes(selectedItem.id) && <button onClick={() => handleFindItem(selectedItem.id)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors">Recolectar</button>}
                </div>

                <button onClick={() => setSelectedItem(null)} className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm">Cerrar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
