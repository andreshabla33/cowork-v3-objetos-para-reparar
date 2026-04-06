/**
 * @module domain/ports/IMediaTransportService
 * Port para el servicio de transporte de media en tiempo real (LiveKit).
 *
 * Clean Architecture:
 *  - El dominio define el contrato de conexión, tracks y suscripción.
 *  - La implementación concreta (LiveKitTransportAdapter) vive en infrastructure.
 *  - Los use cases orquestan este port sin conocer LiveKit.
 */

// ─── Value Objects ────────────────────────────────────────────────────────────

export type EstadoConexionTransport =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export type TipoTrack = 'audio' | 'video' | 'screen';

export interface ConfiguracionConexion {
  espacioId: string;
  token: string;
  iceServers?: RTCIceServer[];
}

export interface EstadisticasTransport {
  participantes: number;
  tracksPublicados: number;
  tracksRecibidos: number;
  latenciaMs?: number;
}

// ─── Port ─────────────────────────────────────────────────────────────────────

/**
 * Contrato para transporte de media WebRTC en tiempo real.
 * @see LiveKitTransportAdapter — implementación en infrastructure/adapters/
 */
export interface IMediaTransportService {
  /** Estado actual de la conexión */
  readonly estado: EstadoConexionTransport;

  /** Conecta a una sala de media */
  conectar(config: ConfiguracionConexion): Promise<void>;

  /** Desconecta de la sala actual */
  desconectar(): Promise<void>;

  /** Publica un track local (audio/video/pantalla) */
  publicarTrack(tipo: TipoTrack, stream: MediaStreamTrack): Promise<void>;

  /** Despublica un track local */
  despublicarTrack(tipo: TipoTrack): Promise<void>;

  /** Obtiene estadísticas del transporte */
  obtenerEstadisticas(): EstadisticasTransport;

  /** Suscribe a eventos de estado de conexión */
  onEstadoCambia(callback: (estado: EstadoConexionTransport) => void): () => void;

  /** Suscribe a eventos de participantes remotos */
  onParticipanteUnido(callback: (participanteId: string) => void): () => void;

  /** Suscribe a eventos de desconexión de participantes */
  onParticipanteSale(callback: (participanteId: string) => void): () => void;
}
