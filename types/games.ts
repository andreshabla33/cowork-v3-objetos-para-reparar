// Tipos para el sistema de mini juegos de Team Building

export type GameType = 
  | 'escape-room'
  | 'trivia-battle'
  | 'scavenger-hunt'
  | 'speed-networking'
  | 'mystery-roleplay'
  | 'building-challenge'
  | 'chess';

export type GameStatus = 'waiting' | 'starting' | 'playing' | 'paused' | 'finished';

export type PlayerRole = 'host' | 'player' | 'spectator';

export type Team = {
  id: string;
  name: string;
  color: string;
  players: Player[];
  score: number;
  avatar?: string;
};

export type Player = {
  id: string;
  name: string;
  avatar: string;
  role: PlayerRole;
  teamId?: string;
  isReady: boolean;
  score: number;
  achievements: string[];
  joinedAt: Date;
};

export type GameSession = {
  id: string;
  gameType: GameType;
  status: GameStatus;
  hostId: string;
  players: Player[];
  teams: Team[];
  maxPlayers: number;
  minPlayers: number;
  duration: number;
  startedAt?: Date;
  endedAt?: Date;
  settings: GameSettings;
  results?: GameResults;
};

export type GameSettings = {
  timeLimit: number;
  allowLateJoin: boolean;
  teamsEnabled: boolean;
  maxTeams: number;
  playersPerTeam: number;
  difficulty: 'easy' | 'medium' | 'hard';
  customRules?: Record<string, any>;
};

export type GameResults = {
  winners: string[];
  scores: Record<string, number>;
  achievements: Achievement[];
  stats: GameStats;
  highlights: GameHighlight[];
};

export type GameStats = {
  totalTime: number;
  participationRate: number;
  collaborationScore: number;
  creativityScore: number;
  problemSolvingScore: number;
  communicationScore: number;
};

export type GameHighlight = {
  type: 'achievement' | 'milestone' | 'funny' | 'impressive';
  playerId: string;
  description: string;
  timestamp: Date;
  points?: number;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'communication' | 'leadership' | 'creativity' | 'collaboration' | 'problem-solving' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  points: number;
  unlockedAt: Date;
};

export type LeaderboardEntry = {
  playerId: string;
  playerName: string;
  avatar: string;
  totalScore: number;
  gamesPlayed: number;
  wins: number;
  achievements: number;
  streak: number;
  rank: number;
  trend: 'up' | 'down' | 'stable';
};

export type EscapeRoomState = {
  currentPuzzle: number;
  totalPuzzles: number;
  timeRemaining: number;
  hintsUsed: number;
  puzzlesSolved: string[];
  cluesFound: string[];
  teamProgress: Record<string, number>;
};

export type TriviaQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
  timeLimit: number;
  image?: string;
};

export type TriviaState = {
  currentQuestion: number;
  totalQuestions: number;
  questions: TriviaQuestion[];
  answers: Record<string, number>;
  scores: Record<string, number>;
  timeRemaining: number;
  questionStartTime: Date;
};

export type ScavengerItem = {
  id: string;
  name: string;
  description: string;
  hint: string;
  points: number;
  found: boolean;
  foundBy?: string;
  foundAt?: Date;
  location?: { x: number; y: number; z: number };
  icon: string;
};

export type ScavengerState = {
  items: ScavengerItem[];
  timeRemaining: number;
  teamProgress: Record<string, string[]>;
};

export type NetworkingSession = {
  id: string;
  playerA: string;
  playerB: string;
  startTime: Date;
  duration: number;
  prompt: string;
  completed: boolean;
  rating?: number;
};

export type SpeedNetworkingState = {
  currentRound: number;
  totalRounds: number;
  sessions: NetworkingSession[];
  timeRemaining: number;
  prompts: string[];
};

export type MysteryRole = {
  id: string;
  name: string;
  description: string;
  secretInfo: string;
  objectives: string[];
  playerId?: string;
};

export type MysteryState = {
  roles: MysteryRole[];
  clues: string[];
  revealedClues: string[];
  accusations: Record<string, string>;
  votingOpen: boolean;
  solution?: string;
};

export type BuildingPiece = {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color: string;
  placedBy: string;
  placedAt: Date;
};

export type BuildingChallengeState = {
  objective: string;
  pieces: BuildingPiece[];
  timeRemaining: number;
  teamSubmissions: Record<string, {
    pieces: BuildingPiece[];
    submittedAt: Date;
    votes: number;
  }>;
};

export type GamePortal = {
  id: string;
  gameType: GameType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  isActive: boolean;
  currentSession?: string;
  maxPlayers: number;
  playersInQueue: string[];
};

export type GameInvitation = {
  id: string;
  fromPlayer: string;
  toPlayer: string;
  gameType: GameType;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
};

export type GameNotification = {
  id: string;
  type: 'invitation' | 'game-starting' | 'achievement' | 'leaderboard' | 'system';
  title: string;
  message: string;
  data?: any;
  createdAt: Date;
  read: boolean;
};

export type GameAnalytics = {
  sessionId: string;
  gameType: GameType;
  startedAt: Date;
  endedAt: Date;
  totalPlayers: number;
  participationRate: number;
  averageEngagement: number;
  completionRate: number;
  skillScores: {
    communication: number;
    collaboration: number;
    creativity: number;
    problemSolving: number;
    leadership: number;
  };
  playerFeedback: PlayerFeedback[];
};

export type PlayerFeedback = {
  playerId: string;
  rating: number;
  wouldRecommend: boolean;
  comments?: string;
  learnedSomething: boolean;
  feltIncluded: boolean;
};

// Tipos específicos para el juego de Ajedrez
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ChessColor = 'w' | 'b';

export type ChessPiece = {
  type: ChessPieceType;
  color: ChessColor;
  square: string;
};

export type ChessMove = {
  from: string;
  to: string;
  piece: ChessPieceType;
  color: ChessColor;
  captured?: ChessPieceType;
  promotion?: ChessPieceType;
  san: string;
  timestamp: number;
};

export type ChessGameState = {
  fen: string;
  turn: ChessColor;
  moveHistory: ChessMove[];
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  whitePlayer: {
    id: string;
    name: string;
    avatar?: string;
    timeRemaining?: number;
  } | null;
  blackPlayer: {
    id: string;
    name: string;
    avatar?: string;
    timeRemaining?: number;
  } | null;
  capturedPieces: {
    white: ChessPieceType[];
    black: ChessPieceType[];
  };
  lastMove?: {
    from: string;
    to: string;
  };
  gameResult?: 'white-wins' | 'black-wins' | 'draw' | null;
  startedAt?: Date;
  endedAt?: Date;
};
