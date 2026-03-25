import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GameType,
  GameSession,
  GameStatus,
  Player,
  Achievement,
  LeaderboardEntry,
  GameInvitation,
  GameNotification,
  GameSettings,
  GameResults,
  GamePortal,
} from '../types/games';

interface GameState {
  currentSession: GameSession | null;
  currentPlayer: Player | null;
  gameStatus: GameStatus;
  
  availableGames: GamePortal[];
  activeSessions: GameSession[];
  myInvitations: GameInvitation[];
  notifications: GameNotification[];
  achievements: Achievement[];
  leaderboard: LeaderboardEntry[];
  
  gameHistory: GameSession[];
  playerStats: {
    totalGames: number;
    wins: number;
    totalScore: number;
    streak: number;
    favoriteGame: GameType | null;
    skillScores: {
      communication: number;
      collaboration: number;
      creativity: number;
      problemSolving: number;
      leadership: number;
    };
  };
  
  isGameModalOpen: boolean;
  selectedGameType: GameType | null;
  showLeaderboard: boolean;
  showAchievements: boolean;
  unreadNotifications: number;
  
  setCurrentSession: (session: GameSession | null) => void;
  setCurrentPlayer: (player: Player | null) => void;
  setGameStatus: (status: GameStatus) => void;
  
  createSession: (gameType: GameType, hostId: string, settings: GameSettings) => GameSession;
  joinSession: (sessionId: string, player: Player) => boolean;
  leaveSession: (sessionId: string, playerId: string) => void;
  startSession: (sessionId: string) => void;
  endSession: (sessionId: string, results: GameResults) => void;
  updateSession: (sessionId: string, updates: Partial<GameSession>) => void;
  
  setPlayerReady: (sessionId: string, playerId: string, ready: boolean) => void;
  updatePlayerScore: (sessionId: string, playerId: string, points: number) => void;
  assignTeam: (sessionId: string, playerId: string, teamId: string) => void;
  
  sendInvitation: (from: string, to: string, gameType: GameType, sessionId: string) => void;
  respondToInvitation: (invitationId: string, accept: boolean) => void;
  
  unlockAchievement: (playerId: string, achievement: Achievement) => void;
  checkAchievements: (playerId: string, context: any) => Achievement[];
  
  updateLeaderboard: () => void;
  getPlayerRank: (playerId: string) => number;
  
  addNotification: (notification: Omit<GameNotification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (notificationId: string) => void;
  clearNotifications: () => void;
  
  activatePortal: (portalId: string, sessionId: string) => void;
  deactivatePortal: (portalId: string) => void;
  joinPortalQueue: (portalId: string, playerId: string) => void;
  leavePortalQueue: (portalId: string, playerId: string) => void;
  
  openGameModal: (gameType: GameType) => void;
  closeGameModal: () => void;
  toggleLeaderboard: () => void;
  toggleAchievements: () => void;
  
  addToHistory: (session: GameSession) => void;
  updatePlayerStats: (results: GameResults) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      currentSession: null,
      currentPlayer: null,
      gameStatus: 'waiting',
      
      availableGames: [
        {
          id: 'portal-escape-room',
          gameType: 'escape-room',
          position: { x: 10, y: 0, z: -5 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 6,
          playersInQueue: [],
        },
        {
          id: 'portal-trivia',
          gameType: 'trivia-battle',
          position: { x: -10, y: 0, z: -5 },
          rotation: { x: 0, y: Math.PI / 2, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 12,
          playersInQueue: [],
        },
        {
          id: 'portal-scavenger',
          gameType: 'scavenger-hunt',
          position: { x: 0, y: 0, z: 10 },
          rotation: { x: 0, y: Math.PI, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 20,
          playersInQueue: [],
        },
        {
          id: 'portal-networking',
          gameType: 'speed-networking',
          position: { x: 15, y: 0, z: 10 },
          rotation: { x: 0, y: -Math.PI / 2, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 16,
          playersInQueue: [],
        },
        {
          id: 'portal-mystery',
          gameType: 'mystery-roleplay',
          position: { x: -15, y: 0, z: 10 },
          rotation: { x: 0, y: Math.PI / 4, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 8,
          playersInQueue: [],
        },
        {
          id: 'portal-building',
          gameType: 'building-challenge',
          position: { x: 0, y: 0, z: -15 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isActive: false,
          maxPlayers: 12,
          playersInQueue: [],
        },
      ],
      
      activeSessions: [],
      myInvitations: [],
      notifications: [],
      achievements: [],
      leaderboard: [],
      gameHistory: [],
      
      playerStats: {
        totalGames: 0,
        wins: 0,
        totalScore: 0,
        streak: 0,
        favoriteGame: null,
        skillScores: {
          communication: 0,
          collaboration: 0,
          creativity: 0,
          problemSolving: 0,
          leadership: 0,
        },
      },
      
      isGameModalOpen: false,
      selectedGameType: null,
      showLeaderboard: false,
      showAchievements: false,
      unreadNotifications: 0,
      
      setCurrentSession: (session) => set({ currentSession: session }),
      setCurrentPlayer: (player) => set({ currentPlayer: player }),
      setGameStatus: (status) => set({ gameStatus: status }),
      
      createSession: (gameType, hostId, settings) => {
        const session: GameSession = {
          id: `session-${Date.now()}`,
          gameType,
          status: 'waiting',
          hostId,
          players: [],
          teams: [],
          maxPlayers: settings.teamsEnabled 
            ? settings.maxTeams * settings.playersPerTeam 
            : settings.maxTeams * 2,
          minPlayers: gameType === 'escape-room' ? 2 : 1,
          duration: settings.timeLimit * 60,
          settings,
        };
        
        set((state) => ({
          activeSessions: [...state.activeSessions, session],
        }));
        
        return session;
      },
      
      joinSession: (sessionId, player) => {
        const { activeSessions } = get();
        const session = activeSessions.find(s => s.id === sessionId);
        
        if (!session || session.players.length >= session.maxPlayers) {
          return false;
        }
        
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? { ...s, players: [...s.players, player] }
              : s
          ),
        }));
        
        return true;
      },
      
      leaveSession: (sessionId, playerId) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? { ...s, players: s.players.filter(p => p.id !== playerId) }
              : s
          ),
        }));
      },
      
      startSession: (sessionId) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? { ...s, status: 'playing', startedAt: new Date() }
              : s
          ),
          gameStatus: 'playing',
        }));
      },
      
      endSession: (sessionId, results) => {
        set((state) => {
          const session = state.activeSessions.find(s => s.id === sessionId);
          if (session) {
            const completedSession = { 
              ...session, 
              status: 'finished' as GameStatus, 
              endedAt: new Date(),
              results 
            };
            return {
              activeSessions: state.activeSessions.filter(s => s.id !== sessionId),
              gameHistory: [...state.gameHistory, completedSession],
              gameStatus: 'finished',
            };
          }
          return state;
        });
      },
      
      updateSession: (sessionId, updates) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...updates } : s
          ),
        }));
      },
      
      setPlayerReady: (sessionId, playerId, ready) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  players: s.players.map(p =>
                    p.id === playerId ? { ...p, isReady: ready } : p
                  ),
                }
              : s
          ),
        }));
      },
      
      updatePlayerScore: (sessionId, playerId, points) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  players: s.players.map(p =>
                    p.id === playerId ? { ...p, score: p.score + points } : p
                  ),
                }
              : s
          ),
        }));
      },
      
      assignTeam: (sessionId, playerId, teamId) => {
        set((state) => ({
          activeSessions: state.activeSessions.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  players: s.players.map(p =>
                    p.id === playerId ? { ...p, teamId } : p
                  ),
                }
              : s
          ),
        }));
      },
      
      sendInvitation: (from, to, gameType, sessionId) => {
        const invitation: GameInvitation = {
          id: `inv-${Date.now()}`,
          fromPlayer: from,
          toPlayer: to,
          gameType,
          sessionId,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          status: 'pending',
        };
        
        set((state) => ({
          myInvitations: [...state.myInvitations, invitation],
        }));
      },
      
      respondToInvitation: (invitationId, accept) => {
        set((state) => ({
          myInvitations: state.myInvitations.map(i =>
            i.id === invitationId
              ? { ...i, status: accept ? 'accepted' : 'declined' }
              : i
          ),
        }));
      },
      
      unlockAchievement: (playerId, achievement) => {
        set((state) => ({
          achievements: [...state.achievements, achievement],
        }));
        
        get().addNotification({
          type: 'achievement',
          title: '¡Logro Desbloqueado!',
          message: `${achievement.name}: ${achievement.description}`,
          data: achievement,
          read: false,
        });
      },
      
      checkAchievements: (playerId, context) => {
        const newAchievements: Achievement[] = [];
        const { playerStats } = get();
        
        if (playerStats.totalGames === 1) {
          newAchievements.push({
            id: 'first-game',
            name: 'Primera Aventura',
            description: 'Completaste tu primer mini juego',
            icon: '🎮',
            category: 'special',
            rarity: 'common',
            points: 10,
            unlockedAt: new Date(),
          });
        }
        
        if (playerStats.streak >= 3) {
          newAchievements.push({
            id: 'win-streak',
            name: 'Racha Invencible',
            description: 'Ganaste 3 juegos consecutivos',
            icon: '🔥',
            category: 'special',
            rarity: 'rare',
            points: 50,
            unlockedAt: new Date(),
          });
        }
        
        return newAchievements;
      },
      
      updateLeaderboard: () => {
        const { gameHistory } = get();
        
        const playerScores: Record<string, LeaderboardEntry> = {};
        
        gameHistory.forEach(session => {
          session.players.forEach(player => {
            if (!playerScores[player.id]) {
              playerScores[player.id] = {
                playerId: player.id,
                playerName: player.name,
                avatar: player.avatar,
                totalScore: 0,
                gamesPlayed: 0,
                wins: 0,
                achievements: 0,
                streak: 0,
                rank: 0,
                trend: 'stable',
              };
            }
            
            playerScores[player.id].totalScore += player.score;
            playerScores[player.id].gamesPlayed += 1;
            
            if (session.results?.winners.includes(player.id)) {
              playerScores[player.id].wins += 1;
            }
          });
        });
        
        const sorted = Object.values(playerScores)
          .sort((a, b) => b.totalScore - a.totalScore)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
        
        set({ leaderboard: sorted });
      },
      
      getPlayerRank: (playerId) => {
        const { leaderboard } = get();
        const entry = leaderboard.find(e => e.playerId === playerId);
        return entry?.rank || 0;
      },
      
      addNotification: (notification) => {
        const newNotification: GameNotification = {
          ...notification,
          id: `notif-${Date.now()}`,
          createdAt: new Date(),
        };
        
        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadNotifications: state.unreadNotifications + 1,
        }));
      },
      
      markNotificationRead: (notificationId) => {
        set((state) => ({
          notifications: state.notifications.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadNotifications: Math.max(0, state.unreadNotifications - 1),
        }));
      },
      
      clearNotifications: () => {
        set({ notifications: [], unreadNotifications: 0 });
      },
      
      activatePortal: (portalId, sessionId) => {
        set((state) => ({
          availableGames: state.availableGames.map(g =>
            g.id === portalId
              ? { ...g, isActive: true, currentSession: sessionId }
              : g
          ),
        }));
      },
      
      deactivatePortal: (portalId) => {
        set((state) => ({
          availableGames: state.availableGames.map(g =>
            g.id === portalId
              ? { ...g, isActive: false, currentSession: undefined, playersInQueue: [] }
              : g
          ),
        }));
      },
      
      joinPortalQueue: (portalId, playerId) => {
        set((state) => ({
          availableGames: state.availableGames.map(g =>
            g.id === portalId && !g.playersInQueue.includes(playerId)
              ? { ...g, playersInQueue: [...g.playersInQueue, playerId] }
              : g
          ),
        }));
      },
      
      leavePortalQueue: (portalId, playerId) => {
        set((state) => ({
          availableGames: state.availableGames.map(g =>
            g.id === portalId
              ? { ...g, playersInQueue: g.playersInQueue.filter(id => id !== playerId) }
              : g
          ),
        }));
      },
      
      openGameModal: (gameType) => set({ 
        isGameModalOpen: true, 
        selectedGameType: gameType 
      }),
      
      closeGameModal: () => set({ 
        isGameModalOpen: false, 
        selectedGameType: null 
      }),
      
      toggleLeaderboard: () => set((state) => ({ 
        showLeaderboard: !state.showLeaderboard 
      })),
      
      toggleAchievements: () => set((state) => ({ 
        showAchievements: !state.showAchievements 
      })),
      
      addToHistory: (session) => {
        set((state) => ({
          gameHistory: [...state.gameHistory, session],
        }));
      },
      
      updatePlayerStats: (results) => {
        set((state) => ({
          playerStats: {
            ...state.playerStats,
            totalGames: state.playerStats.totalGames + 1,
            totalScore: state.playerStats.totalScore + 
              (results.scores[state.currentPlayer?.id || ''] || 0),
          },
        }));
      },
    }),
    {
      name: 'game-storage',
      partialize: (state) => ({
        achievements: state.achievements,
        gameHistory: state.gameHistory,
        playerStats: state.playerStats,
        leaderboard: state.leaderboard,
      }),
    }
  )
);
