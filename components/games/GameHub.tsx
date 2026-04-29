import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gamepad2, X, Trophy, Medal, Star, Users, Clock, Zap, Lock, Search, 
  MessageCircle, Building2, TrendingUp, Crown
} from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import type { GameType } from '../../types/games';
// El contrato `PendingGameInvitation` vive en Domain (`types/workspace`).
// Se elimina la interfaz local duplicada para mantener Single Source of Truth.
import type { PendingGameInvitation } from '../../types/workspace';

import { EscapeRoomGame } from './minigames/EscapeRoomGame';
import { TriviaBattleGame } from './minigames/TriviaBattleGame';
import { ScavengerHuntGame } from './minigames/ScavengerHuntGame';
import { SpeedNetworkingGame } from './minigames/SpeedNetworkingGame';
import { MysteryRoleplayGame } from './minigames/MysteryRoleplayGame';
import { BuildingChallengeGame } from './minigames/BuildingChallengeGame';
import { ChessGame } from './minigames/ChessGame';

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
      violet: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
      amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
      emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
      pink: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
      indigo: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
      cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200' },
      orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    };
    return colors[color] || colors.violet;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Fácil': return 'text-emerald-700 bg-emerald-100';
      case 'Medio': return 'text-amber-700 bg-amber-100';
      case 'Difícil': return 'text-red-700 bg-red-100';
      default: return 'text-slate-500 bg-slate-100';
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
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-5xl lg:max-w-4xl md:max-w-3xl h-[75vh] lg:h-[70vh] bg-white rounded-2xl lg:rounded-xl border border-[#E3EAF2] overflow-hidden shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {selectedGame ? (
            renderGame()
          ) : (
            <>
              {/* Header - Compacto */}
              <div className="flex items-center justify-between p-4 lg:p-3 border-b border-[#E3EAF2]">
                <div className="flex items-center gap-3 lg:gap-2">
                  <div className="w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
                    <Gamepad2 className="w-5 h-5 lg:w-4 lg:h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl lg:text-lg font-bold text-slate-800">{t('gameHub.title')}</h2>
                    <p className="text-xs lg:text-[10px] text-slate-500">{t('gameHub.subtitle')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 lg:gap-2">
                  {/* Player Stats - Compacto */}
                  <div className="flex items-center gap-4 lg:gap-3 px-3 lg:px-2 py-1.5 bg-slate-50 border border-[#E3EAF2] rounded-xl lg:rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-amber-500" />
                      <span className="text-xs lg:text-[10px] text-slate-700 font-medium">{playerStats.wins}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-sky-500" />
                      <span className="text-xs lg:text-[10px] text-slate-700 font-medium">{playerStats.totalScore.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-orange-500" />
                      <span className="text-xs lg:text-[10px] text-slate-700 font-medium">{playerStats.streak}</span>
                    </div>
                  </div>

                  <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700">
                    <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
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
                        ? 'bg-sky-50 text-sky-600 border border-sky-200'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent'
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
                          className={`p-4 lg:p-3 rounded-xl lg:rounded-lg border ${colors.border} bg-white cursor-pointer transition-all hover:bg-slate-50 hover:shadow-md`}
                          onClick={() => handlePlayGame(game.type as GameType)}
                        >
                          <div className="flex items-start gap-3 lg:gap-2">
                            <div className={`w-10 h-10 lg:w-8 lg:h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center flex-shrink-0`}>
                              {game.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-slate-800 text-sm lg:text-xs">{gameName}</h3>
                              <p className="text-xs lg:text-[10px] text-slate-500 mt-0.5 line-clamp-2">{gameDesc}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-3 lg:mt-2 text-[10px] lg:text-[9px]">
                            <span className="flex items-center gap-1 text-slate-500">
                              <Users className="w-2.5 h-2.5" />{game.players}
                            </span>
                            <span className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-2.5 h-2.5" />{game.duration}m
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] lg:text-[8px] font-medium ${getDifficultyColor(difficulty)}`}>
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
                      <h3 className="text-xl font-bold text-slate-800">Clasificación Global</h3>
                      <button
                        onClick={updateLeaderboard}
                        className="px-4 py-2 bg-white border border-[#E3EAF2] hover:border-sky-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors"
                      >
                        Actualizar
                      </button>
                    </div>

                    {leaderboard.length === 0 ? (
                      <div className="text-center py-12">
                        <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500">Aún no hay datos de clasificación</p>
                        <p className="text-slate-400 text-sm mt-2">¡Juega algunos juegos para aparecer aquí!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leaderboard.map((entry, idx) => (
                          <div
                            key={entry.playerId}
                            className={`flex items-center gap-4 p-4 rounded-xl border ${
                              idx < 3
                                ? 'bg-gradient-to-r from-amber-50 to-transparent border-amber-200'
                                : 'bg-slate-50 border-[#E3EAF2]'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                              idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                              idx === 1 ? 'bg-slate-200 text-slate-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-white border border-[#E3EAF2] text-slate-500'
                            }`}>
                              {idx + 1}
                            </div>
                            <span className="text-2xl">{entry.avatar}</span>
                            <div className="flex-1">
                              <p className="font-medium text-slate-800">{entry.playerName}</p>
                              <p className="text-xs text-slate-500">{entry.gamesPlayed} juegos • {entry.wins} victorias</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-amber-600">{entry.totalScore.toLocaleString()}</p>
                              <p className="text-xs text-slate-500">puntos</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'achievements' && (
                  <div className="max-w-3xl mx-auto">
                    <h3 className="text-xl font-bold text-slate-800 mb-6">Tus Logros</h3>

                    {achievements.length === 0 ? (
                      <div className="text-center py-12">
                        <Medal className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500">Aún no tienes logros</p>
                        <p className="text-slate-400 text-sm mt-2">¡Juega para desbloquear logros!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {achievements.map((achievement) => (
                          <div
                            key={achievement.id}
                            className={`p-4 rounded-xl border ${
                              achievement.rarity === 'legendary' ? 'border-amber-300 bg-amber-50' :
                              achievement.rarity === 'epic' ? 'border-blue-300 bg-blue-50' :
                              achievement.rarity === 'rare' ? 'border-sky-300 bg-sky-50' :
                              'border-[#E3EAF2] bg-white'
                            }`}
                          >
                            <div className="text-3xl mb-2">{achievement.icon}</div>
                            <h4 className="font-bold text-slate-800">{achievement.name}</h4>
                            <p className="text-xs text-slate-500 mt-1">{achievement.description}</p>
                            <div className="flex items-center justify-between mt-3">
                              <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${
                                achievement.rarity === 'legendary' ? 'bg-amber-100 text-amber-700' :
                                achievement.rarity === 'epic' ? 'bg-blue-100 text-blue-700' :
                                achievement.rarity === 'rare' ? 'bg-sky-100 text-sky-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {achievement.rarity}
                              </span>
                              <span className="text-xs text-slate-500">+{achievement.points} pts</span>
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
