/**
 * @module domain/ports/IJuegosRepository
 * @description Port para juegos (invitaciones + partidas ajedrez).
 *
 * Clean Architecture: Domain layer — sin deps externas.
 *
 * Tablas:
 * - `invitaciones_juegos` — solicitudes entre usuarios.
 * - `partidas_ajedrez` — estado online de partidas.
 *
 * Realtime canales:
 * - `invitaciones-{usuarioId}` — postgres_changes por invitado_id (INSERT + UPDATE).
 * - `invitacion-{invitacionId}` — postgres_changes para tracking de una específica.
 * - `chess-game-{sessionId}` — broadcast peer-to-peer in-game events.
 */

export interface InvitacionJuego {
  id: string;
  juego: string;
  invitador_id: string;
  invitado_id: string;
  espacio_id: string;
  estado: string;
  partida_id?: string;
  configuracion: {
    tiempo: number;
    invitador_nombre: string;
    invitador_color: 'w' | 'b';
  };
  creada_en: string;
  expira_en: string;
}

export interface PartidaAjedrezInput {
  jugador_blancas_id: string;
  jugador_negras_id: string;
  estado: string;
  turno: 'w' | 'b';
  fen_actual: string;
  tiempo_blancas: number;
  tiempo_negras: number;
  fecha_inicio: string;
  historial_movimientos: unknown[];
  piezas_capturadas_blancas: unknown[];
  piezas_capturadas_negras: unknown[];
}

export interface PartidaAjedrez extends PartidaAjedrezInput {
  id: string;
}

export interface CrearInvitacionAjedrezInput {
  invitador_id: string;
  invitado_id: string;
  espacio_id: string;
  tiempo: number;
  invitador_nombre: string;
  invitador_color: 'w' | 'b';
}

export interface MiembroOnline {
  id: string;
  nombre: string;
  avatar_url: string | null;
  estado_disponibilidad: string | null;
}

export interface CanalAjedrezCallbacks {
  onMove?: (payload: { playerId: string; move: unknown }) => void;
  onJoin?: (payload: { playerId: string; playerName: string }) => void;
  onChat?: (payload: { from: string; text: string; timestamp: number }) => void;
  onResign?: (payload: { playerId: string }) => void;
}

export interface CanalAjedrezController {
  send(event: 'move' | 'join' | 'chat' | 'resign', payload: unknown): void;
  close(): void;
}

export interface IJuegosRepository {
  /** Listar invitaciones pendientes vigentes para un usuario. */
  listarInvitacionesPendientes(usuarioId: string, espacioId: string): Promise<InvitacionJuego[]>;

  /** Crear invitación a ajedrez. Retorna invitación recién creada. */
  crearInvitacionAjedrez(input: CrearInvitacionAjedrezInput): Promise<InvitacionJuego>;

  /** Cancelar invitación (estado='cancelada'). */
  cancelarInvitacion(invitacionId: string): Promise<void>;

  /** Rechazar invitación (estado='rechazada'). */
  rechazarInvitacion(invitacionId: string): Promise<void>;

  /**
   * Flujo aceptación: crea partida_ajedrez + actualiza invitación con partida_id.
   * Retorna la partida creada.
   */
  aceptarInvitacionConPartida(
    invitacion: InvitacionJuego,
    invitadoId: string,
  ): Promise<PartidaAjedrez>;

  /** Suscribirse a INSERT/UPDATE en invitaciones_juegos para un usuario. */
  suscribirInvitacionesUsuario(
    usuarioId: string,
    callbacks: {
      onInsert?: (invitacion: InvitacionJuego) => void;
      onUpdate?: (invitacion: InvitacionJuego) => void;
    },
  ): () => void;

  /** Suscribirse a UPDATE de una invitación específica. */
  suscribirCambiosInvitacion(invitacionId: string, callback: (invitacion: InvitacionJuego) => void): () => void;

  /** Suscribirse a UPDATE de una partida ajedrez específica. */
  suscribirCambiosPartida(partidaId: string, callback: (partida: PartidaAjedrez & { ultimo_movimiento?: unknown }) => void): () => void;

  /** UPDATE estado de partida_ajedrez (FEN, turno, capturas, etc.). */
  actualizarPartidaAjedrez(partidaId: string, updates: Partial<PartidaAjedrez>): Promise<void>;

  /**
   * Crear canal broadcast peer-to-peer para una sesión de ajedrez.
   * Devuelve controller con send + close.
   */
  crearCanalAjedrez(sessionId: string, callbacks: CanalAjedrezCallbacks): CanalAjedrezController;

  /** Listar miembros online del espacio (excluyendo currentUserId si se provee). */
  listarMiembrosOnline(espacioId: string, excluirUsuarioId?: string): Promise<MiembroOnline[]>;
}
