'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chess, Square, Move, PieceSymbol, Color } from 'chess.js';
import { 
  Crown, Clock, Flag, RotateCcw, MessageCircle, Send, 
  Trophy, X, Users, Swords, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Cpu, User, Settings, Play,
  Sparkles, Timer, Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ChessGameProps {
  onClose: () => void;
  currentUserId?: string;
  currentUserName?: string;
  sessionId?: string;
  espacioId?: string;
  initialPartidaId?: string;
  initialOpponent?: { id: string; name: string };
  initialPlayerColor?: 'w' | 'b';
}

interface MiembroEspacio {
  id: string;
  nombre: string;
  avatar_url?: string;
  estado_disponibilidad?: string;
}

interface InvitacionJuego {
  id: string;
  invitador_id: string;
  invitado_id: string;
  estado: string;
  configuracion: any;
  partida_id?: string;
}

// Valores de piezas para IA y puntuación
const PIECE_VALUES: Record<PieceSymbol, number> = {
  'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000
};

// Tablas de posición para evaluación de IA (simplificadas)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

// Símbolos Unicode de piezas (fallback)
const PIECE_SYMBOLS: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟'
};

type GamePhase = 'setup' | 'playing' | 'finished';
type GameMode = 'local' | 'online' | 'computer';
type Difficulty = 'easy' | 'medium' | 'hard';

// Configuraciones de tiempo predefinidas
const TIME_OPTIONS = [
  { label: '1 min', value: 60, name: 'Bullet' },
  { label: '3 min', value: 180, name: 'Blitz' },
  { label: '5 min', value: 300, name: 'Blitz' },
  { label: '10 min', value: 600, name: 'Rápido' },
  { label: '15 min', value: 900, name: 'Rápido' },
  { label: '30 min', value: 1800, name: 'Clásico' },
  { label: 'Sin límite', value: 0, name: 'Casual' },
];

// Componente de pieza SVG moderna estilo 2026
const ChessPieceSVG: React.FC<{ type: PieceSymbol; color: Color; size?: number }> = ({ type, color, size = 48 }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FAFAFA' : '#1a1a2e';
  const stroke = isWhite ? '#374151' : '#000000';
  const gradient = isWhite ? 'url(#whiteGrad)' : 'url(#blackGrad)';
  
  const paths: Record<PieceSymbol, string> = {
    'k': 'M22.5 11.63V6M20 8h5M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z',
    'q': 'M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z',
    'r': 'M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5M34 14l-3 3H14l-3-3M31 17v12.5H14V17M11 14h23',
    'b': 'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z',
    'n': 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z',
    'p': 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z',
  };

  return (
    <svg width={size} height={size} viewBox="0 0 45 45" className="drop-shadow-lg">
      <defs>
        <linearGradient id="whiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E5E7EB" />
        </linearGradient>
        <linearGradient id="blackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#374151" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.3"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path 
          d={paths[type]} 
          fill={gradient}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

export const ChessGame: React.FC<ChessGameProps> = ({ 
  onClose, 
  currentUserId = 'local-player',
  currentUserName = 'Jugador',
  sessionId,
  espacioId,
  initialPartidaId,
  initialOpponent,
  initialPlayerColor = 'w'
}) => {
  // Estado del juego
  const [chess] = useState(() => new Chess());
  const [board, setBoard] = useState(chess.board());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [validMoves, setValidMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup');
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  
  // Configuración
  const [gameMode, setGameMode] = useState<GameMode>('computer');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [selectedTime, setSelectedTime] = useState(600);
  
  // Estado de jugadores
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [opponent, setOpponent] = useState<{ id: string; name: string } | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  
  // Piezas capturadas
  const [capturedByWhite, setCapturedByWhite] = useState<PieceSymbol[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<PieceSymbol[]>([]);
  
  // Animaciones
  const [animatingPiece, setAnimatingPiece] = useState<{ from: Square; to: Square; piece: string } | null>(null);
  const [captureAnimation, setCaptureAnimation] = useState<{ square: Square; piece: string } | null>(null);
  const [checkAnimation, setCheckAnimation] = useState(false);
  
  // UI State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ from: string; text: string; timestamp: number }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [boardFlipped, setBoardFlipped] = useState(false);
  
  // Timers
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Supabase channel
  const channelRef = useRef<any>(null);
  
  // Online mode states
  const [miembrosEspacio, setMiembrosEspacio] = useState<MiembroEspacio[]>([]);
  const [loadingMiembros, setLoadingMiembros] = useState(false);
  const [selectedMiembro, setSelectedMiembro] = useState<MiembroEspacio | null>(null);
  const [invitacionEnviada, setInvitacionEnviada] = useState<InvitacionJuego | null>(null);
  const [esperandoRespuesta, setEsperandoRespuesta] = useState(false);
  const [partidaOnlineId, setPartidaOnlineId] = useState<string | null>(null);

  // ===================== INICIAR PARTIDA DESDE INVITACIÓN =====================
  
  // Si se proporcionan props iniciales, iniciar la partida directamente
  useEffect(() => {
    if (initialPartidaId && initialOpponent) {
      console.log('🎮 ChessGame: Iniciando partida desde invitación:', { initialPartidaId, initialOpponent, initialPlayerColor });
      setGameMode('online');
      setOpponent(initialOpponent);
      setPlayerColor(initialPlayerColor);
      setBoardFlipped(initialPlayerColor === 'b');
      iniciarPartidaOnline(initialPartidaId, initialPlayerColor);
    }
  }, [initialPartidaId, initialOpponent, initialPlayerColor]);

  // ===================== SISTEMA DE INVITACIONES ONLINE =====================

  // Cargar miembros del espacio
  const loadMiembrosEspacio = useCallback(async () => {
    if (!espacioId) {
      console.log('🎮 loadMiembrosEspacio: No espacioId provided');
      return;
    }
    console.log('🎮 loadMiembrosEspacio: Loading members for espacio:', espacioId, 'excluding user:', currentUserId);
    setLoadingMiembros(true);
    try {
      // Primero obtener los usuario_id de los miembros del espacio
      const { data: membersData, error: membersError } = await supabase
        .from('miembros_espacio')
        .select('usuario_id')
        .eq('espacio_id', espacioId)
        .eq('aceptado', true)
        .neq('usuario_id', currentUserId);
      
      console.log('🎮 loadMiembrosEspacio membersData:', { membersData, membersError });
      
      if (membersError) {
        console.error('🎮 Error consultando miembros_espacio:', membersError);
        throw membersError;
      }
      
      if (!membersData || membersData.length === 0) {
        console.log('🎮 No hay otros miembros en el espacio');
        setMiembrosEspacio([]);
        setLoadingMiembros(false);
        return;
      }

      // Obtener los datos de los usuarios
      const userIds = membersData.map(m => m.usuario_id);
      console.log('🎮 loadMiembrosEspacio userIds:', userIds);
      
      const { data: usersData, error: usersError } = await supabase
        .from('usuarios')
        .select('id, nombre, avatar_url, estado_disponibilidad')
        .in('id', userIds);

      console.log('🎮 loadMiembrosEspacio usersData:', { usersData, usersError });

      if (usersError) {
        console.error('🎮 Error consultando usuarios:', usersError);
        throw usersError;
      }

      const miembros: MiembroEspacio[] = (usersData || []).map((u: any) => ({
        id: u.id,
        nombre: u.nombre,
        avatar_url: u.avatar_url,
        estado_disponibilidad: u.estado_disponibilidad
      }));

      console.log('🎮 loadMiembrosEspacio final miembros:', miembros);
      setMiembrosEspacio(miembros);
    } catch (error) {
      console.error('🎮 Error cargando miembros:', error);
      setMiembrosEspacio([]);
    } finally {
      setLoadingMiembros(false);
    }
  }, [espacioId, currentUserId]);

  // Cargar miembros del espacio cuando se selecciona modo online
  useEffect(() => {
    console.log('🎮 ChessGame Online Mode Check:', { gameMode, espacioId, currentUserId });
    if (gameMode === 'online' && espacioId && currentUserId) {
      loadMiembrosEspacio();
    }
  }, [gameMode, espacioId, currentUserId, loadMiembrosEspacio]);

  // Enviar invitación a jugar
  const enviarInvitacion = async (miembro: MiembroEspacio) => {
    if (!espacioId || !currentUserId) return;
    
    setSelectedMiembro(miembro);
    setEsperandoRespuesta(true);

    try {
      // Crear la invitación
      const { data: invitacion, error } = await supabase
        .from('invitaciones_juegos')
        .insert({
          juego: 'ajedrez',
          invitador_id: currentUserId,
          invitado_id: miembro.id,
          espacio_id: espacioId,
          configuracion: {
            tiempo: selectedTime,
            invitador_nombre: currentUserName,
            invitador_color: playerColor
          }
        })
        .select()
        .single();

      if (error) throw error;

      setInvitacionEnviada(invitacion);
      console.log('🎮 Invitación creada:', invitacion.id);

      // Suscribirse a cambios en esta invitación
      const channel = supabase
        .channel(`invitacion-${invitacion.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'invitaciones_juegos',
          filter: `id=eq.${invitacion.id}`
        }, (payload) => {
          console.log('🎮 Invitación UPDATE recibido:', payload);
          const updated = payload.new as InvitacionJuego;
          if (updated.estado === 'aceptada' && updated.partida_id) {
            console.log('🎮 Invitación ACEPTADA! Iniciando partida:', updated.partida_id);
            // Invitación aceptada - iniciar partida
            setPartidaOnlineId(updated.partida_id);
            setOpponent({ id: miembro.id, name: miembro.nombre });
            setEsperandoRespuesta(false);
            iniciarPartidaOnline(updated.partida_id, playerColor);
          } else if (updated.estado === 'rechazada') {
            console.log('🎮 Invitación RECHAZADA');
            // Invitación rechazada
            setEsperandoRespuesta(false);
            setSelectedMiembro(null);
            setInvitacionEnviada(null);
            alert(`${miembro.nombre} rechazó la invitación`);
          }
        })
        .subscribe((status) => {
          console.log('🎮 Canal invitación status:', status);
        });

      // Timeout de 5 minutos
      setTimeout(() => {
        if (esperandoRespuesta) {
          supabase.removeChannel(channel);
          cancelarInvitacion();
        }
      }, 300000);

    } catch (error) {
      console.error('Error enviando invitación:', error);
      setEsperandoRespuesta(false);
      setSelectedMiembro(null);
    }
  };

  // Cancelar invitación
  const cancelarInvitacion = async () => {
    if (!invitacionEnviada) return;

    try {
      await supabase
        .from('invitaciones_juegos')
        .update({ estado: 'cancelada' })
        .eq('id', invitacionEnviada.id);
    } catch (error) {
      console.error('Error cancelando invitación:', error);
    }

    setEsperandoRespuesta(false);
    setSelectedMiembro(null);
    setInvitacionEnviada(null);
  };

  // Iniciar partida online
  const iniciarPartidaOnline = async (partidaId: string, miColor: 'w' | 'b') => {
    console.log('🎮 iniciarPartidaOnline:', { partidaId, miColor });
    setPlayerColor(miColor);
    setBoardFlipped(miColor === 'b');
    setPartidaOnlineId(partidaId);
    setGameMode('online');
    
    // Suscribirse a cambios en la partida
    const channel = supabase
      .channel(`partida-ajedrez-${partidaId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'partidas_ajedrez',
        filter: `id=eq.${partidaId}`
      }, (payload) => {
        console.log('🎮 Partida UPDATE recibido:', payload);
        const partida = payload.new as any;
        // Procesar si ahora es MI turno (el oponente acaba de mover)
        if (partida.turno === miColor && partida.fen_actual !== chess.fen()) {
          console.log('🎮 Procesando movimiento del oponente:', partida.ultimo_movimiento);
          chess.load(partida.fen_actual);
          setBoard(chess.board());
          if (partida.ultimo_movimiento) {
            setLastMove(partida.ultimo_movimiento);
          }
          setWhiteTime(partida.tiempo_blancas);
          setBlackTime(partida.tiempo_negras);
          setIsMyTurn(true);
          
          if (partida.estado === 'jaque_mate' || partida.estado === 'tablas' || partida.estado === 'abandono') {
            setGamePhase('finished');
          }
        }
      })
      .subscribe((status) => {
        console.log('🎮 Canal partida status:', status);
      });

    channelRef.current = channel;
    
    // Iniciar el juego directamente (sin depender del estado opponent)
    chess.reset();
    setBoard(chess.board());
    setGamePhase('playing');
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setWhiteTime(selectedTime || 999999);
    setBlackTime(selectedTime || 999999);
    setLastMove(null);
    setIsMyTurn(miColor === 'w');
    console.log('🎮 Partida iniciada! gamePhase: playing, miColor:', miColor);
  };

  // Sincronizar movimiento con Supabase
  const sincronizarMovimiento = async (move: Move) => {
    console.log('🎮 sincronizarMovimiento llamado:', { partidaOnlineId, move: move.san });
    if (!partidaOnlineId) {
      console.log('🎮 sincronizarMovimiento: No hay partidaOnlineId, abortando');
      return;
    }

    try {
      const nuevoTurno = chess.turn();
      const updateData = {
        fen_actual: chess.fen(),
        turno: nuevoTurno,
        ultimo_movimiento: { from: move.from, to: move.to },
        tiempo_blancas: whiteTime,
        tiempo_negras: blackTime,
        estado: chess.isCheckmate() ? 'jaque_mate' : 
                chess.isCheck() ? 'jaque' : 
                chess.isDraw() ? 'tablas' : 'jugando',
        historial_movimientos: chess.history({ verbose: true })
      };
      console.log('🎮 Enviando UPDATE a partida:', partidaOnlineId, updateData);
      
      const { error } = await supabase
        .from('partidas_ajedrez')
        .update(updateData)
        .eq('id', partidaOnlineId);
      
      if (error) {
        console.error('🎮 Error en UPDATE:', error);
      } else {
        console.log('🎮 UPDATE exitoso');
      }
    } catch (error) {
      console.error('🎮 Error sincronizando movimiento:', error);
    }
  };

  // ===================== IA DEL AJEDREZ =====================
  
  // Evaluación de posición
  const evaluateBoard = useCallback((game: Chess): number => {
    if (game.isCheckmate()) {
      return game.turn() === 'w' ? -100000 : 100000;
    }
    if (game.isDraw()) return 0;

    let score = 0;
    const board = game.board();
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          const value = PIECE_VALUES[piece.type];
          const positionBonus = piece.type === 'p' ? PAWN_TABLE[i * 8 + j] :
                               piece.type === 'n' ? KNIGHT_TABLE[i * 8 + j] : 0;
          
          if (piece.color === 'w') {
            score += value + positionBonus;
          } else {
            score -= value + positionBonus;
          }
        }
      }
    }
    return score;
  }, []);

  // Minimax con alpha-beta pruning
  const minimax = useCallback((game: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number => {
    if (depth === 0 || game.isGameOver()) {
      return evaluateBoard(game);
    }

    const moves = game.moves();
    
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        game.move(move);
        const evalScore = minimax(game, depth - 1, alpha, beta, false);
        game.undo();
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        game.move(move);
        const evalScore = minimax(game, depth - 1, alpha, beta, true);
        game.undo();
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }, [evaluateBoard]);

  // Encontrar mejor movimiento
  const findBestMove = useCallback((game: Chess): string | null => {
    const moves = game.moves();
    if (moves.length === 0) return null;

    const depthMap: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
    const depth = depthMap[difficulty];
    
    let bestMove = moves[0];
    let bestValue = game.turn() === 'w' ? -Infinity : Infinity;

    // Para easy, agregar aleatoriedad
    if (difficulty === 'easy' && Math.random() < 0.3) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    for (const move of moves) {
      game.move(move);
      const value = minimax(game, depth - 1, -Infinity, Infinity, game.turn() === 'w');
      game.undo();

      if (game.turn() === 'b') {
        if (value < bestValue) {
          bestValue = value;
          bestMove = move;
        }
      } else {
        if (value > bestValue) {
          bestValue = value;
          bestMove = move;
        }
      }
    }

    return bestMove;
  }, [difficulty, minimax]);

  // Movimiento de la IA
  const makeAIMove = useCallback(() => {
    if (gameMode !== 'computer' || chess.turn() === playerColor || chess.isGameOver()) return;
    
    setIsThinking(true);
    
    setTimeout(() => {
      const bestMove = findBestMove(chess);
      if (bestMove) {
        const move = chess.move(bestMove);
        if (move) {
          animateMove(move.from as Square, move.to as Square, move);
        }
      }
      setIsThinking(false);
    }, 500 + Math.random() * 500);
  }, [chess, gameMode, playerColor, findBestMove]);

  // Sonidos
  const playSound = useCallback((type: 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'gameEnd') => {
    if (!soundEnabled) return;
    const frequencies: Record<string, number> = {
      move: 400, capture: 200, check: 600, castle: 300, promote: 800, gameEnd: 500
    };
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = frequencies[type];
      oscillator.type = type === 'capture' ? 'sawtooth' : 'sine';
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
  }, [soundEnabled]);

  // Inicializar conexión multiplayer
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`chess-game-${sessionId}`)
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        if (payload.playerId !== currentUserId) {
          handleRemoteMove(payload.move);
        }
      })
      .on('broadcast', { event: 'join' }, ({ payload }) => {
        if (payload.playerId !== currentUserId) {
          setOpponent({ id: payload.playerId, name: payload.playerName });
          if (!playerColor) {
            setPlayerColor('b');
            setBoardFlipped(true);
          }
        }
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (payload.from !== currentUserId) {
          setChatMessages(prev => [...prev, payload]);
        }
      })
      .on('broadcast', { event: 'resign' }, ({ payload }) => {
        if (payload.playerId !== currentUserId) {
          handleGameEnd(playerColor === 'w' ? 'white' : 'black');
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Anunciar entrada al juego
    channel.send({
      type: 'broadcast',
      event: 'join',
      payload: { playerId: currentUserId, playerName: currentUserName }
    });

    // Si soy el primero, soy blancas
    if (!playerColor) {
      setPlayerColor('w');
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, currentUserId, currentUserName, playerColor]);

  // Actualizar turno
  useEffect(() => {
    setIsMyTurn(chess.turn() === playerColor);
  }, [chess, playerColor, board]);

  // Timer
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    timerRef.current = setInterval(() => {
      if (chess.turn() === 'w') {
        setWhiteTime(prev => {
          if (prev <= 1) {
            handleGameEnd('black');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime(prev => {
          if (prev <= 1) {
            handleGameEnd('white');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gamePhase, chess]);

  // Manejar movimiento remoto
  const handleRemoteMove = useCallback((moveData: { from: string; to: string; promotion?: string }) => {
    const move = chess.move(moveData);
    if (move) {
      animateMove(moveData.from as Square, moveData.to as Square, move);
    }
  }, [chess]);

  // Animación de movimiento
  const animateMove = useCallback((from: Square, to: Square, move: Move) => {
    const piece = `${move.color}${move.piece}`;
    
    // Animación de captura
    if (move.captured) {
      setCaptureAnimation({ square: to, piece: `${move.color === 'w' ? 'b' : 'w'}${move.captured}` });
      setTimeout(() => setCaptureAnimation(null), 500);
      
      if (move.color === 'w') {
        setCapturedByWhite(prev => [...prev, move.captured!]);
      } else {
        setCapturedByBlack(prev => [...prev, move.captured!]);
      }
      playSound('capture');
    } else if (move.san.includes('O-O')) {
      playSound('castle');
    } else {
      playSound('move');
    }

    // Animación de movimiento
    setAnimatingPiece({ from, to, piece });
    setTimeout(() => {
      setAnimatingPiece(null);
      setBoard(chess.board());
      setLastMove({ from, to });
      setMoveHistory(chess.history({ verbose: true }));
      setCurrentMoveIndex(chess.history().length - 1);

      // Check animation
      if (chess.isCheck()) {
        setCheckAnimation(true);
        playSound('check');
        setTimeout(() => setCheckAnimation(false), 1000);
      }

      // Game end
      if (chess.isGameOver()) {
        handleGameEnd(
          chess.isCheckmate() 
            ? (chess.turn() === 'w' ? 'black' : 'white')
            : 'draw'
        );
      }
    }, 300);
  }, [chess, playSound]);

  // Manejar click en casilla
  const handleSquareClick = useCallback((square: Square) => {
    if (gamePhase !== 'playing' || !isMyTurn) return;

    const piece = chess.get(square);

    // Si hay una pieza seleccionada
    if (selectedSquare) {
      // Intentar mover
      if (validMoves.includes(square)) {
        const moveData = { from: selectedSquare, to: square, promotion: 'q' as const };
        const move = chess.move(moveData);
        
        if (move) {
          animateMove(selectedSquare, square, move);
          
          // Sincronizar con Supabase si es partida online
          if (partidaOnlineId && gameMode === 'online') {
            sincronizarMovimiento(move);
          }
          
          // Enviar movimiento al oponente via broadcast (para modo sesión)
          if (channelRef.current && !partidaOnlineId) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'move',
              payload: { playerId: currentUserId, move: moveData }
            });
          }
        }
      }
      
      setSelectedSquare(null);
      setValidMoves([]);
    } else if (piece && piece.color === playerColor) {
      // Seleccionar pieza propia
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setValidMoves(moves.map(m => m.to as Square));
    }
  }, [selectedSquare, validMoves, chess, gamePhase, isMyTurn, playerColor, currentUserId, animateMove]);

  // Iniciar juego
  const startGame = useCallback(() => {
    if (gameMode === 'online' && !opponent) {
      return;
    }
    chess.reset();
    setBoard(chess.board());
    setGamePhase('playing');
    setMoveHistory([]);
    setCurrentMoveIndex(-1);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    // Usar el tiempo seleccionado (0 = sin límite)
    setWhiteTime(selectedTime || 999999);
    setBlackTime(selectedTime || 999999);
    setLastMove(null);
    setIsMyTurn(playerColor === 'w');
    
    // Si juega con negras vs IA, la IA hace el primer movimiento
    if (gameMode === 'computer' && playerColor === 'b') {
      setTimeout(() => makeAIMove(), 500);
    }
  }, [chess, gameMode, opponent, selectedTime, playerColor, makeAIMove]);

  // Efecto para que la IA juegue después del movimiento del jugador
  useEffect(() => {
    if (gamePhase === 'playing' && gameMode === 'computer' && chess.turn() !== playerColor && !chess.isGameOver()) {
      const timer = setTimeout(() => makeAIMove(), 300);
      return () => clearTimeout(timer);
    }
  }, [board, gamePhase, gameMode, chess, playerColor, makeAIMove]);

  // Manejar fin del juego
  const handleGameEnd = useCallback((winner: 'white' | 'black' | 'draw') => {
    setGamePhase('finished');
    if (timerRef.current) clearInterval(timerRef.current);
    playSound('gameEnd');
  }, [playSound]);

  // Rendirse
  const handleResign = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'resign',
        payload: { playerId: currentUserId }
      });
    }
    handleGameEnd(playerColor === 'w' ? 'black' : 'white');
  }, [currentUserId, playerColor, handleGameEnd]);

  // Enviar mensaje de chat
  const sendChatMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    
    const message = { from: currentUserName, text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, message]);
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'chat',
        payload: { ...message, from: currentUserId }
      });
    }
    
    setChatInput('');
  }, [chatInput, currentUserName, currentUserId]);

  // Formatear tiempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calcular ventaja material
  const calculateMaterialAdvantage = () => {
    let whiteScore = 0, blackScore = 0;
    capturedByWhite.forEach(p => whiteScore += PIECE_VALUES[p]);
    capturedByBlack.forEach(p => blackScore += PIECE_VALUES[p]);
    return whiteScore - blackScore;
  };

  // Obtener coordenadas de casilla
  const getSquareCoords = (square: Square) => {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    return boardFlipped 
      ? { x: 7 - file, y: rank }
      : { x: file, y: 7 - rank };
  };

  // Renderizar pieza con SVG moderno
  const renderPiece = (piece: { type: PieceSymbol; color: Color } | null, square: Square) => {
    if (!piece) return null;
    
    const isAnimating = animatingPiece?.from === square;
    if (isAnimating) return null;
    
    return (
      <motion.div
        key={`piece-${square}`}
        className="absolute inset-0 flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
        initial={{ scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
      >
        <ChessPieceSVG type={piece.type} color={piece.color} size={52} />
      </motion.div>
    );
  };

  // Renderizar casilla
  const renderSquare = (rowIndex: number, colIndex: number) => {
    const file = boardFlipped ? 7 - colIndex : colIndex;
    const rank = boardFlipped ? rowIndex : 7 - rowIndex;
    const square = `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
    const piece = board[7 - rank]?.[file];
    
    const isLight = (file + rank) % 2 === 1;
    const isSelected = selectedSquare === square;
    const isValidMove = validMoves.includes(square);
    const isLastMove = lastMove?.from === square || lastMove?.to === square;
    const isKingInCheck = checkAnimation && piece?.type === 'k' && piece?.color === chess.turn();

    return (
      <motion.div
        key={square}
        className={`
          relative w-full aspect-square flex items-center justify-center
          transition-colors duration-200
          ${isLight ? 'bg-amber-100' : 'bg-amber-700'}
          ${isSelected ? 'ring-4 ring-cyan-400 ring-inset z-10' : ''}
          ${isLastMove ? 'bg-yellow-300/50' : ''}
          ${isKingInCheck ? 'bg-red-500 animate-pulse' : ''}
        `}
        onClick={() => handleSquareClick(square)}
        whileHover={{ scale: 1.02 }}
        animate={isKingInCheck ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        {/* Coordenadas */}
        {colIndex === 0 && (
          <span className={`absolute left-1 top-0 text-[10px] font-bold ${isLight ? 'text-amber-700' : 'text-amber-100'}`}>
            {rank + 1}
          </span>
        )}
        {rowIndex === 7 && (
          <span className={`absolute right-1 bottom-0 text-[10px] font-bold ${isLight ? 'text-amber-700' : 'text-amber-100'}`}>
            {String.fromCharCode(97 + file)}
          </span>
        )}

        {/* Indicador de movimiento válido */}
        {isValidMove && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`absolute ${piece ? 'inset-0 border-4 border-cyan-400 rounded-sm' : 'w-4 h-4 rounded-full bg-cyan-400/50'}`}
          />
        )}

        {/* Pieza */}
        {renderPiece(piece, square)}

        {/* Animación de captura */}
        <AnimatePresence>
          {captureAnimation?.square === square && (
            <motion.div
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: 2, opacity: 0, rotate: 180 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center text-5xl pointer-events-none z-20"
              style={{ color: captureAnimation.piece.startsWith('w') ? '#ffffff' : '#1a1a2e' }}
            >
              {PIECE_SYMBOLS[captureAnimation.piece]}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // Renderizar pieza animada
  const renderAnimatingPiece = () => {
    if (!animatingPiece) return null;

    const fromCoords = getSquareCoords(animatingPiece.from);
    const toCoords = getSquareCoords(animatingPiece.to);
    const squareSize = 100 / 8;

    return (
      <motion.div
        className="absolute text-5xl pointer-events-none z-30"
        initial={{
          left: `${fromCoords.x * squareSize}%`,
          top: `${fromCoords.y * squareSize}%`,
          width: `${squareSize}%`,
          height: `${squareSize}%`,
        }}
        animate={{
          left: `${toCoords.x * squareSize}%`,
          top: `${toCoords.y * squareSize}%`,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          color: animatingPiece.piece.startsWith('w') ? '#ffffff' : '#1a1a2e',
          textShadow: animatingPiece.piece.startsWith('w')
            ? '0 2px 4px rgba(0,0,0,0.5)'
            : '0 2px 4px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {PIECE_SYMBOLS[animatingPiece.piece]}
      </motion.div>
    );
  };

  // Renderizar piezas capturadas
  const renderCapturedPieces = (pieces: PieceSymbol[], color: Color) => {
    const advantage = calculateMaterialAdvantage();
    const showAdvantage = color === 'w' ? advantage > 0 : advantage < 0;
    
    return (
      <div className="flex flex-wrap items-center gap-0.5 min-h-[24px]">
        {pieces.map((piece, idx) => (
          <motion.span
            key={`${piece}-${idx}`}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            className="text-lg opacity-70"
            style={{ color: color === 'w' ? '#1a1a2e' : '#ffffff' }}
          >
            {PIECE_SYMBOLS[`${color === 'w' ? 'b' : 'w'}${piece}`]}
          </motion.span>
        ))}
        {showAdvantage && Math.abs(advantage) > 0 && (
          <span className="text-xs text-emerald-400 font-bold ml-1">
            +{Math.abs(advantage)}
          </span>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 lg:p-3 bg-black/80 backdrop-blur-xl"
    >
      <div className="relative w-full max-w-4xl lg:max-w-3xl md:max-w-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl lg:rounded-xl overflow-hidden border border-white/10 shadow-2xl max-h-[90vh] lg:max-h-[85vh] flex flex-col">
        {/* Header - Compacto */}
        <div className="flex items-center justify-between px-4 lg:px-3 py-3 lg:py-2 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2.5 lg:gap-2">
            <div className="w-9 h-9 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Crown className="w-5 h-5 lg:w-4 lg:h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg lg:text-base font-bold text-white">Ajedrez</h2>
              <p className="text-xs lg:text-[10px] text-white/60">
                {gamePhase === 'setup' ? 'Esperando...' : 
                 gamePhase === 'playing' ? (isMyTurn ? 'Tu turno' : 'Turno oponente') :
                 'Partida terminada'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 lg:gap-1">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 lg:p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" /> : <VolumeX className="w-4 h-4 lg:w-3.5 lg:h-3.5" />}
            </button>
            <button
              onClick={() => setShowChat(!showChat)}
              className="p-1.5 lg:p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors relative"
            >
              <MessageCircle className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 lg:p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Panel izquierdo - Tablero */}
          <div className="flex-1 p-4 lg:p-3 overflow-auto">
            {/* Jugador negro (arriba) */}
            <div className="flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl">
                  {boardFlipped ? '♔' : '♚'}
                </div>
                <div>
                  <p className="text-white font-medium">
                    {boardFlipped 
                      ? currentUserName 
                      : (gameMode === 'computer' ? 'Mónica' : (opponent?.name || 'Esperando...'))}
                  </p>
                  {renderCapturedPieces(boardFlipped ? capturedByWhite : capturedByBlack, boardFlipped ? 'w' : 'b')}
                </div>
              </div>
              <div className={`px-4 py-2 rounded-xl font-mono text-lg font-bold ${
                chess.turn() === (boardFlipped ? 'w' : 'b') ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white/70'
              }`}>
                {formatTime(boardFlipped ? whiteTime : blackTime)}
              </div>
            </div>

            {/* Tablero */}
            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl border-4 border-amber-900">
              <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                {Array.from({ length: 8 }).map((_, rowIndex) =>
                  Array.from({ length: 8 }).map((_, colIndex) =>
                    renderSquare(rowIndex, colIndex)
                  )
                )}
              </div>
              {renderAnimatingPiece()}
              
              {/* Pantalla de Configuración - UI Glassmorphism 2026 */}
              {gamePhase === 'setup' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 overflow-y-auto"
                >
                  <div className="w-full max-w-md space-y-6">
                    {/* Header */}
                    <div className="text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 10 }}
                        className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl mb-4"
                      >
                        <Crown className="w-10 h-10 text-white" />
                      </motion.div>
                      <h3 className="text-3xl font-bold text-white mb-2">Ajedrez</h3>
                      <p className="text-white/60">Configura tu partida</p>
                    </div>

                    {/* Modo de juego */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Modo de juego
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { mode: 'computer' as GameMode, icon: Cpu, label: 'vs Mónica' },
                          { mode: 'local' as GameMode, icon: Users, label: 'Local' },
                          { mode: 'online' as GameMode, icon: Zap, label: 'Online' },
                        ].map(({ mode, icon: Icon, label }) => (
                          <button
                            key={mode}
                            onClick={() => setGameMode(mode)}
                            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                              gameMode === mode
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
                            }`}
                          >
                            <Icon className="w-6 h-6" />
                            <span className="text-sm font-medium">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dificultad (solo para vs IA) */}
                    {gameMode === 'computer' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3"
                      >
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" /> Dificultad
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { diff: 'easy' as Difficulty, label: 'Fácil', color: 'emerald' },
                            { diff: 'medium' as Difficulty, label: 'Medio', color: 'amber' },
                            { diff: 'hard' as Difficulty, label: 'Difícil', color: 'red' },
                          ].map(({ diff, label, color }) => (
                            <button
                              key={diff}
                              onClick={() => setDifficulty(diff)}
                              className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                                difficulty === diff
                                  ? `bg-${color}-500/20 border-${color}-500 text-${color}-400`
                                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Selector de oponente online */}
                    {gameMode === 'online' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3"
                      >
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                          <Users className="w-4 h-4" /> Invitar a jugar
                        </label>
                        
                        {!espacioId ? (
                          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            Debes estar en un espacio de trabajo para jugar online
                          </div>
                        ) : esperandoRespuesta ? (
                          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                >
                                  <Zap className="w-5 h-5 text-amber-400" />
                                </motion.div>
                              </div>
                              <div className="flex-1">
                                <p className="text-white font-medium">Esperando a {selectedMiembro?.nombre}...</p>
                                <p className="text-white/50 text-xs">La invitación expira en 5 minutos</p>
                              </div>
                              <button
                                onClick={cancelarInvitacion}
                                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : loadingMiembros ? (
                          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-center">
                            Cargando miembros...
                          </div>
                        ) : miembrosEspacio.length === 0 ? (
                          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-center text-sm">
                            No hay otros miembros en el espacio
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {miembrosEspacio.map((miembro) => (
                              <button
                                key={miembro.id}
                                onClick={() => enviarInvitacion(miembro)}
                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-amber-500/30 transition-all flex items-center gap-3"
                              >
                                <div className="relative">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                                    {miembro.nombre?.charAt(0).toUpperCase()}
                                  </div>
                                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${
                                    miembro.estado_disponibilidad === 'available' ? 'bg-emerald-500' :
                                    miembro.estado_disponibilidad === 'busy' ? 'bg-red-500' :
                                    miembro.estado_disponibilidad === 'away' ? 'bg-amber-500' : 'bg-slate-500'
                                  }`} />
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="text-white font-medium">{miembro.nombre}</p>
                                  <p className="text-white/40 text-xs capitalize">
                                    {miembro.estado_disponibilidad === 'available' ? 'Disponible' :
                                     miembro.estado_disponibilidad === 'busy' ? 'Ocupado' :
                                     miembro.estado_disponibilidad === 'away' ? 'Ausente' : 'Desconectado'}
                                  </p>
                                </div>
                                <Swords className="w-5 h-5 text-amber-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Tiempo de partida */}
                    {gameMode !== 'online' && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Timer className="w-4 h-4" /> Tiempo de partida
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {TIME_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSelectedTime(option.value)}
                            className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center ${
                              selectedTime === option.value
                                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-sm font-bold">{option.label}</span>
                            <span className="text-[10px] opacity-60">{option.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Color del jugador (solo para modos no online) */}
                    {gameMode !== 'online' && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <User className="w-4 h-4" /> Jugar con
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setPlayerColor('w')}
                          className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 ${
                            playerColor === 'w'
                              ? 'bg-white/20 border-white text-white'
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-white shadow-lg" />
                          <span className="font-medium">Blancas</span>
                        </button>
                        <button
                          onClick={() => { setPlayerColor('b'); setBoardFlipped(true); }}
                          className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 ${
                            playerColor === 'b'
                              ? 'bg-slate-700/50 border-slate-500 text-white'
                              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 shadow-lg" />
                          <span className="font-medium">Negras</span>
                        </button>
                      </div>
                    </div>
                    )}

                    {/* Botón de inicio (no visible en modo online - la partida inicia cuando aceptan) */}
                    {gameMode !== 'online' && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={startGame}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-2xl hover:from-amber-400 hover:to-orange-500 transition-all flex items-center justify-center gap-3 shadow-xl"
                      >
                        <Play className="w-6 h-6" />
                        {gameMode === 'computer' ? 'Jugar vs Mónica' : 'Jugar Local'}
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Overlay de fin de juego */}
              {gamePhase === 'finished' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 10 }}
                  >
                    <Trophy className="w-20 h-20 text-amber-400 mb-4" />
                  </motion.div>
                  <h3 className="text-3xl font-bold text-white mb-2">
                    {chess.isCheckmate() 
                      ? `¡${chess.turn() === 'w' ? 'Negras' : 'Blancas'} ganan!`
                      : chess.isStalemate() 
                        ? 'Tablas por ahogado'
                        : chess.isDraw()
                          ? 'Empate'
                          : 'Partida terminada'}
                  </h3>
                  <p className="text-white/60 mb-6">
                    {chess.isCheckmate() && 'Jaque mate'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        chess.reset();
                        setBoard(chess.board());
                        setGamePhase('setup');
                        setMoveHistory([]);
                        setCapturedByWhite([]);
                        setCapturedByBlack([]);
                        setLastMove(null);
                      }}
                      className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-400 hover:to-orange-500 transition-all flex items-center gap-2"
                    >
                      <RotateCcw className="w-5 h-5" />
                      Nueva Partida
                    </button>
                    <button
                      onClick={onClose}
                      className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition-all"
                    >
                      Salir
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Jugador blanco (abajo) */}
            <div className="flex items-center justify-between mt-3 px-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl">
                  {boardFlipped ? '♚' : '♔'}
                </div>
                <div>
                  <p className="text-white font-medium">
                    {boardFlipped 
                      ? (gameMode === 'computer' ? 'Mónica' : (opponent?.name || 'Esperando...')) 
                      : currentUserName}
                  </p>
                  {renderCapturedPieces(boardFlipped ? capturedByBlack : capturedByWhite, boardFlipped ? 'b' : 'w')}
                </div>
              </div>
              <div className={`px-4 py-2 rounded-xl font-mono text-lg font-bold ${
                chess.turn() === (boardFlipped ? 'b' : 'w') ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white/70'
              }`}>
                {formatTime(boardFlipped ? blackTime : whiteTime)}
              </div>
            </div>

            {/* Controles */}
            {gamePhase === 'playing' && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => setBoardFlipped(!boardFlipped)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Girar tablero
                </button>
                <button
                  onClick={handleResign}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  Rendirse
                </button>
              </div>
            )}
          </div>

          {/* Panel derecho - Historial y Chat */}
          <div className="w-80 border-l border-white/10 bg-black/20 flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setShowChat(false)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  !showChat ? 'text-white bg-white/10' : 'text-white/50 hover:text-white'
                }`}
              >
                Movimientos
              </button>
              <button
                onClick={() => setShowChat(true)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  showChat ? 'text-white bg-white/10' : 'text-white/50 hover:text-white'
                }`}
              >
                Chat
              </button>
            </div>

            {!showChat ? (
              /* Historial de movimientos */
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-1">
                  {Array.from({ length: Math.ceil(moveHistory.length / 2) }).map((_, idx) => {
                    const whiteMove = moveHistory[idx * 2];
                    const blackMove = moveHistory[idx * 2 + 1];
                    return (
                      <div key={idx} className="flex items-center text-sm">
                        <span className="w-8 text-white/40">{idx + 1}.</span>
                        <button
                          onClick={() => setCurrentMoveIndex(idx * 2)}
                          className={`px-2 py-1 rounded ${
                            currentMoveIndex === idx * 2 ? 'bg-amber-500/30 text-amber-300' : 'text-white hover:bg-white/10'
                          }`}
                        >
                          {whiteMove?.san}
                        </button>
                        {blackMove && (
                          <button
                            onClick={() => setCurrentMoveIndex(idx * 2 + 1)}
                            className={`px-2 py-1 rounded ml-2 ${
                              currentMoveIndex === idx * 2 + 1 ? 'bg-amber-500/30 text-amber-300' : 'text-white hover:bg-white/10'
                            }`}
                          >
                            {blackMove.san}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {moveHistory.length === 0 && (
                  <p className="text-white/40 text-center mt-8">
                    Los movimientos aparecerán aquí
                  </p>
                )}
              </div>
            ) : (
              /* Chat */
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`${msg.from === currentUserName ? 'text-right' : ''}`}>
                      <div className={`inline-block px-3 py-2 rounded-xl max-w-[90%] ${
                        msg.from === currentUserName 
                          ? 'bg-amber-500/30 text-white' 
                          : 'bg-white/10 text-white'
                      }`}>
                        <p className="text-xs text-white/50 mb-1">{msg.from}</p>
                        <p className="text-sm">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                  {chatMessages.length === 0 && (
                    <p className="text-white/40 text-center mt-8">
                      Envía un mensaje a tu oponente
                    </p>
                  )}
                </div>
                <div className="p-3 border-t border-white/10">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={sendChatMessage}
                      className="p-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Navegación de movimientos */}
            {!showChat && moveHistory.length > 0 && (
              <div className="flex items-center justify-center gap-2 p-3 border-t border-white/10">
                <button
                  onClick={() => setCurrentMoveIndex(0)}
                  disabled={currentMoveIndex <= 0}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <ChevronLeft className="w-4 h-4 -ml-2" />
                </button>
                <button
                  onClick={() => setCurrentMoveIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentMoveIndex <= 0}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentMoveIndex(prev => Math.min(moveHistory.length - 1, prev + 1))}
                  disabled={currentMoveIndex >= moveHistory.length - 1}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentMoveIndex(moveHistory.length - 1)}
                  disabled={currentMoveIndex >= moveHistory.length - 1}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                  <ChevronRight className="w-4 h-4 -ml-2" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChessGame;
