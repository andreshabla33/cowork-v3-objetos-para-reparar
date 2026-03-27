import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gamepad2, X, Trophy, Medal, Star, Users, Clock, Zap, Lock, Search, 
  MessageCircle, Building2, TrendingUp, Crown
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { GameType } from '../../types/games';

import { EscapeRoomGame } from './minigames/EscapeRoomGame';
import { TriviaBattleGame } from './minigames/TriviaBattleGame';
import { ScavengerHuntGame } from './minigames/ScavengerHuntGame';
import { SpeedNetworkingGame } from './minigames/SpeedNetworkingGame';
import { MysteryRoleplayGame } from './minigames/MysteryRoleplayGame';
import { BuildingChallengeGame } from './minigames/BuildingChallengeGame';
import { ChessGame } from './minigames/ChessGame';

interface PendingGameInvitation {
  invitacion: {
    id: string;
    juego: string;
    invitador_id: string;
    configuracion: {
      tiempo: number;
      invitador_nombre: string;
      invitador_color: 'w' | 'b';
    };
  };
  partidaId: string;
}

interface GameHubProps {
  isOpen: boolean;
  onClose: () => void;
  espacioId?: string;
  currentUserId?: string;
  currentUserName?: string;
  pendingInvitation?: PendingGameInvitation | null;
  onPendingInvitationHandled?: () => void;
  onGamePlayingChange?: (isPlaying: boolean) => void;
}

interface GameInfo {
  type: GameType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  players: string;
  duration: string;
  difficulty: 'Fácil' | 'Medio' | 'Difícil';
  skills: string[];
  banner?: string;
}

// Configuración base de juegos (sin textos, se traducen dinámicamente)
const GAMES_CONFIG = [
  { type: 'escape-room', translationKey: 'escapeRoom', icon: <Lock className="w-6 h-6" />, color: 'violet', players: '2-6', duration: '30', difficultyKey: 'hard' },
  { type: 'trivia-battle', translationKey: 'triviaBattle', icon: <Zap className="w-6 h-6" />, color: 'amber', players: '2-12', duration: '15', difficultyKey: 'medium' },
  { type: 'scavenger-hunt', translationKey: 'scavengerHunt', icon: <Search className="w-6 h-6" />, color: 'emerald', players: '1-20', duration: '25', difficultyKey: 'easy' },
  { type: 'speed-networking', translationKey: 'speedNetworking', icon: <MessageCircle className="w-6 h-6" />, color: 'pink', players: '4-16', duration: '15', difficultyKey: 'easy' },
  { type: 'mystery-roleplay', translationKey: 'mysteryRolePlay', icon: <Star className="w-6 h-6" />, color: 'indigo', players: '4-8', duration: '40', difficultyKey: 'hard' },
  { type: 'building-challenge', translationKey: 'buildingChallenge', icon: <Building2 className="w-6 h-6" />, color: 'cyan', players: '2-12', duration: '35', difficultyKey: 'medium' },
  { type: 'chess', translationKey: 'chess', icon: <Crown className="w-6 h-6" />, color: 'orange', players: '2', duration: '10-30', difficultyKey: 'medium' },
] as const;

export const GameHub: React.FC<GameHubProps> = ({ isOpen, onClose, espacioId, currentUserId, currentUserName, pendingInvitation, onPendingInvitationHandled, onGamePlayingChange }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'games' | 'leaderboard' | 'achievements'>('games');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [activePartidaId, setActivePartidaId] = useState<string | null>(null);
  const [activeOpponent, setActiveOpponent] = useState<{ id: string; name: string } | null>(null);
  const [activePlayerColor, setActivePlayerColor] = useState<'w' | 'b'>('w');
  const { leaderboard, achievements, playerStats, updateLeaderboard } = useGameStore();

  // Notificar al padre cuando se entra/sale de un juego específico
  React.useEffect(() => {
    onGamePlayingChange?.(selectedGame !== null);
  }, [selectedGame, onGamePlayingChange]);

  // Notificar false cuando se cierra el GameHub
  React.useEffect(() => {
    if (!isOpen) {
      onGamePlayingChange?.(false);
    }
  }, [isOpen, onGamePlayingChange]);

  // Manejar invitación pendiente cuando se abre el GameHub
  React.useEffect(() => {
    if (isOpen && pendingInvitation) {
      console.log('🎮 GameHub: Iniciando partida desde invitación:', pendingInvitation);
      const inv = pendingInvitation.invitacion;
      // El que acepta juega con el color opuesto al invitador
      const miColor = inv.configuracion.invitador_color === 'w' ? 'b' : 'w';
      setActivePartidaId(pendingInvitation.partidaId);
      setActiveOpponent({ id: inv.invitador_id, name: inv.configuracion.invitador_nombre });
      setActivePlayerColor(miColor);
      setSelectedGame('chess');
      onPendingInvitationHandled?.();
    }
  }, [isOpen, pendingInvitation, onPendingInvitationHandled]);

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      violet: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' },
      amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
      emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
      pink: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
      indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
      cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
      orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    };
    return colors[color] || colors.violet;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Fácil': return 'text-green-400 bg-green-500/20';
      case 'Medio': return 'text-amber-400 bg-amber-500/20';
      case 'Difícil': return 'text-red-400 bg-red-500/20';
      default: return 'text-zinc-400 bg-zinc-500/20';
    }
  };

  const handlePlayGame = (gameType: GameType) => {
    setSelectedGame(gameType);
  };

  const handleCloseGame = () => {
    setSelectedGame(null);
    setActivePartidaId(null);
    setActiveOpponent(null);
    setActivePlayerColor('w');
  };

  const renderGame = () => {
    switch (selectedGame) {
      case 'escape-room': return <EscapeRoomGame onClose={handleCloseGame} />;
      case 'trivia-battle': return <TriviaBattleGame onClose={handleCloseGame} />;
      case 'scavenger-hunt': return <ScavengerHuntGame onClose={handleCloseGame} />;
      case 'speed-networking': return <SpeedNetworkingGame onClose={handleCloseGame} />;
      case 'mystery-roleplay': return <MysteryRoleplayGame onClose={handleCloseGame} />;
      case 'building-challenge': return <BuildingChallengeGame onClose={handleCloseGame} />;
      case 'chess': return <ChessGame 
          onClose={handleCloseGame} 
          espacioId={espacioId} 
          currentUserId={currentUserId} 
          currentUserName={currentUserName}
          initialPartidaId={activePartidaId || undefined}
          initialOpponent={activeOpponent || undefined}
          initialPlayerColor={activePlayerColor}
        />;
      default: return null;
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-5xl lg:max-w-4xl md:max-w-3xl h-[75vh] lg:h-[70vh] bg-zinc-950 rounded-2xl lg:rounded-xl border border-zinc-800 overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {selectedGame ? (
            renderGame()
          ) : (
            <>
              {/* Header - Compacto */}
              <div className="flex items-center justify-between p-4 lg:p-3 border-b border-zinc-800">
                <div className="flex items-center gap-3 lg:gap-2">
                  <div className="w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                    <Gamepad2 className="w-5 h-5 lg:w-4 lg:h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl lg:text-lg font-bold text-white">{t('gameHub.title')}</h2>
                    <p className="text-xs lg:text-[10px] text-zinc-400">{t('gameHub.subtitle')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 lg:gap-2">
                  {/* Player Stats - Compacto */}
                  <div className="flex items-center gap-4 lg:gap-3 px-3 lg:px-2 py-1.5 bg-zinc-900 rounded-xl lg:rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-amber-400" />
                      <span className="text-xs lg:text-[10px] text-white font-medium">{playerStats.wins}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-violet-400" />
                      <span className="text-xs lg:text-[10px] text-white font-medium">{playerStats.totalScore.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-orange-400" />
                      <span className="text-xs lg:text-[10px] text-white font-medium">{playerStats.streak}</span>
                    </div>
                  </div>

                  <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
                    <X className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-zinc-400" />
                  </button>
                </div>
              </div>

              {/* Tabs - Compacto */}
              <div className="flex gap-1.5 px-4 lg:px-3 pt-3 lg:pt-2">
                {[
                  { id: 'games', label: t('gameHub.tabs.games'), icon: Gamepad2 },
                  { id: 'leaderboard', label: t('gameHub.tabs.leaderboard'), icon: TrendingUp },
                  { id: 'achievements', label: t('gameHub.tabs.achievements'), icon: Medal },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 lg:px-2 py-1.5 rounded-lg text-xs lg:text-[10px] font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content - Compacto */}
              <div className="flex-1 overflow-auto p-4 lg:p-3">
                {activeTab === 'games' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-2">
                    {GAMES_CONFIG.map((game) => {
                      const colors = getColorClasses(game.color);
                      const gameName = t(`gameHub.${game.translationKey}.title`);
                      const gameDesc = t(`gameHub.${game.translationKey}.description`);
                      const difficulty = t(`gameHub.difficulty.${game.difficultyKey}`);
                      return (
                        <motion.div
                          key={game.type}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          className={`p-4 lg:p-3 rounded-xl lg:rounded-lg border ${colors.border} bg-zinc-900/50 cursor-pointer transition-all hover:bg-zinc-900`}
                          onClick={() => handlePlayGame(game.type as GameType)}
                        >
                          <div className="flex items-start gap-3 lg:gap-2">
                            <div className={`w-10 h-10 lg:w-8 lg:h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center flex-shrink-0`}>
                              {game.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-white text-sm lg:text-xs">{gameName}</h3>
                              <p className="text-xs lg:text-[10px] text-zinc-400 mt-0.5 line-clamp-2">{gameDesc}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-3 lg:mt-2 text-[10px] lg:text-[9px]">
                            <span className="flex items-center gap-1 text-zinc-500">
                              <Users className="w-2.5 h-2.5" />{game.players}
                            </span>
                            <span className="flex items-center gap-1 text-zinc-500">
                              <Clock className="w-2.5 h-2.5" />{game.duration}m
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] lg:text-[8px] ${getDifficultyColor(difficulty)}`}>
                              {difficulty}
                            </span>
                          </div>

                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {activeTab === 'leaderboard' && (
                  <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-white">Clasificación Global</h3>
                      <button
                        onClick={updateLeaderboard}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
                      >
                        Actualizar
                      </button>
                    </div>

                    {leaderboard.length === 0 ? (
                      <div className="text-center py-12">
                        <Trophy className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                        <p className="text-zinc-500">Aún no hay datos de clasificación</p>
                        <p className="text-zinc-600 text-sm mt-2">¡Juega algunos juegos para aparecer aquí!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leaderboard.map((entry, idx) => (
                          <div
                            key={entry.playerId}
                            className={`flex items-center gap-4 p-4 rounded-xl ${
                              idx < 3 ? 'bg-gradient-to-r from-amber-500/10 to-transparent' : 'bg-zinc-900'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                              idx === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                              idx === 1 ? 'bg-zinc-400/20 text-zinc-300' :
                              idx === 2 ? 'bg-orange-600/20 text-orange-400' :
                              'bg-zinc-800 text-zinc-500'
                            }`}>
                              {idx + 1}
                            </div>
                            <span className="text-2xl">{entry.avatar}</span>
                            <div className="flex-1">
                              <p className="font-medium text-white">{entry.playerName}</p>
                              <p className="text-xs text-zinc-500">{entry.gamesPlayed} juegos • {entry.wins} victorias</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-amber-400">{entry.totalScore.toLocaleString()}</p>
                              <p className="text-xs text-zinc-500">puntos</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'achievements' && (
                  <div className="max-w-3xl mx-auto">
                    <h3 className="text-xl font-bold text-white mb-6">Tus Logros</h3>

                    {achievements.length === 0 ? (
                      <div className="text-center py-12">
                        <Medal className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                        <p className="text-zinc-500">Aún no tienes logros</p>
                        <p className="text-zinc-600 text-sm mt-2">¡Juega para desbloquear logros!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {achievements.map((achievement) => (
                          <div
                            key={achievement.id}
                            className={`p-4 rounded-xl border ${
                              achievement.rarity === 'legendary' ? 'border-amber-500/50 bg-amber-500/10' :
                              achievement.rarity === 'epic' ? 'border-purple-500/50 bg-purple-500/10' :
                              achievement.rarity === 'rare' ? 'border-blue-500/50 bg-blue-500/10' :
                              'border-zinc-700 bg-zinc-900'
                            }`}
                          >
                            <div className="text-3xl mb-2">{achievement.icon}</div>
                            <h4 className="font-bold text-white">{achievement.name}</h4>
                            <p className="text-xs text-zinc-400 mt-1">{achievement.description}</p>
                            <div className="flex items-center justify-between mt-3">
                              <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                                achievement.rarity === 'legendary' ? 'bg-amber-500/20 text-amber-400' :
                                achievement.rarity === 'epic' ? 'bg-purple-500/20 text-purple-400' :
                                achievement.rarity === 'rare' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-zinc-700 text-zinc-400'
                              }`}>
                                {achievement.rarity}
                              </span>
                              <span className="text-xs text-zinc-500">+{achievement.points} pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
