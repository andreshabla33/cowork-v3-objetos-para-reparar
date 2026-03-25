import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gamepad2, Users, Trophy, Star, Bell, X, Lock, Zap, Search, MessageCircle, Building2
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { GameType, GamePortal } from '../../types/games';

interface GamePortalUIProps {
  onOpenGameHub: () => void;
}

const GAME_INFO: Record<GameType, { name: string; icon: React.ReactNode; color: string }> = {
  'escape-room': { name: 'Escape Room', icon: <Lock className="w-5 h-5" />, color: 'violet' },
  'trivia-battle': { name: 'Trivia Battle', icon: <Zap className="w-5 h-5" />, color: 'amber' },
  'scavenger-hunt': { name: 'Scavenger Hunt', icon: <Search className="w-5 h-5" />, color: 'emerald' },
  'speed-networking': { name: 'Speed Networking', icon: <MessageCircle className="w-5 h-5" />, color: 'pink' },
  'mystery-roleplay': { name: 'Mystery Roleplay', icon: <Star className="w-5 h-5" />, color: 'indigo' },
  'building-challenge': { name: 'Building Challenge', icon: <Building2 className="w-5 h-5" />, color: 'cyan' },
  chess: { name: 'Ajedrez', icon: <Gamepad2 className="w-5 h-5" />, color: 'emerald' },
};

export const GamePortalUI: React.FC<GamePortalUIProps> = ({ onOpenGameHub }) => {
  const { 
    notifications, 
    unreadNotifications, 
    markNotificationRead, 
    playerStats,
    availableGames
  } = useGameStore();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [nearbyPortal, setNearbyPortal] = useState<GamePortal | null>(null);

  // Simulate player proximity detection (in real implementation, this would use player position)
  useEffect(() => {
    const checkProximity = () => {
      // Randomly simulate being near a portal for demo purposes
      const randomPortal = availableGames[Math.floor(Math.random() * availableGames.length)];
      if (Math.random() > 0.95) {
        setNearbyPortal(randomPortal);
        setTimeout(() => setNearbyPortal(null), 5000);
      }
    };

    const interval = setInterval(checkProximity, 10000);
    return () => clearInterval(interval);
  }, [availableGames]);

  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
      amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
    return colors[color] || colors.violet;
  };

  return (
    <>
      {/* Floating Game Stats Panel */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-24 right-4 z-40"
      >
        <div className="bg-zinc-900/90 backdrop-blur-lg rounded-2xl border border-zinc-800 p-4 shadow-xl w-72">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white">Mini Juegos</span>
            </div>
            
            {/* Notifications button */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Bell className="w-4 h-4 text-zinc-400" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                  {unreadNotifications}
                </span>
              )}
            </button>
          </div>

          {/* Player Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2 bg-zinc-800/50 rounded-lg text-center">
              <Trophy className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-white">{playerStats.wins}</p>
              <p className="text-xs text-zinc-500">Victorias</p>
            </div>
            <div className="p-2 bg-zinc-800/50 rounded-lg text-center">
              <Star className="w-4 h-4 text-violet-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-white">{playerStats.totalScore}</p>
              <p className="text-xs text-zinc-500">Puntos</p>
            </div>
            <div className="p-2 bg-zinc-800/50 rounded-lg text-center">
              <Gamepad2 className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <p className="text-sm font-bold text-white">{playerStats.totalGames}</p>
              <p className="text-xs text-zinc-500">Juegos</p>
            </div>
          </div>

          {/* Open Game Hub Button */}
          <button
            onClick={onOpenGameHub}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
          >
            <Gamepad2 className="w-4 h-4" />
            Abrir Game Hub
          </button>

          {/* Active Sessions */}
          {availableGames.filter(g => g.isActive).length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-2">Sesiones activas</p>
              <div className="space-y-2">
                {availableGames.filter(g => g.isActive).map((portal) => {
                  const gameInfo = GAME_INFO[portal.gameType];
                  return (
                    <div 
                      key={portal.id}
                      className={`p-2 rounded-lg border ${getColorClasses(gameInfo.color)}`}
                    >
                      <div className="flex items-center gap-2">
                        {gameInfo.icon}
                        <span className="text-sm font-medium">{gameInfo.name}</span>
                        <span className="ml-auto text-xs flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {portal.playersInQueue.length}/{portal.maxPlayers}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full right-0 mt-2 w-80 bg-zinc-900/95 backdrop-blur-lg rounded-xl border border-zinc-800 shadow-xl overflow-hidden"
            >
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-semibold text-white">Notificaciones</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-1 hover:bg-zinc-800 rounded"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              
              <div className="max-h-80 overflow-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">Sin notificaciones</p>
                  </div>
                ) : (
                  notifications.slice(0, 5).map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markNotificationRead(notif.id)}
                      className={`p-3 border-b border-zinc-800 cursor-pointer hover:bg-zinc-800/50 ${
                        !notif.read ? 'bg-violet-500/5' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{notif.title}</p>
                      <p className="text-xs text-zinc-400 mt-1">{notif.message}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Nearby Portal Notification */}
      <AnimatePresence>
        {nearbyPortal && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className={`px-6 py-4 rounded-2xl border shadow-xl ${getColorClasses(GAME_INFO[nearbyPortal.gameType].color)} bg-zinc-900/95 backdrop-blur-lg`}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-current/20 flex items-center justify-center">
                  {GAME_INFO[nearbyPortal.gameType].icon}
                </div>
                <div>
                  <p className="font-semibold text-white">¡Portal cercano!</p>
                  <p className="text-sm opacity-80">{GAME_INFO[nearbyPortal.gameType].name}</p>
                </div>
                <button
                  onClick={onOpenGameHub}
                  className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Unirse
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GamePortalUI;
