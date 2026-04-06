/**
 * @module ConnectionQualityMonitor
 * Monitorea la calidad de conexión de los participantes de LiveKit.
 *
 * Según docs.livekit.io/transport/:
 * - ConnectionQualityChanged se emite cuando cambia la calidad de un participante
 * - Valores: 'excellent' | 'good' | 'poor' | 'lost'
 * - Usado para degradar calidad de video proactivamente y ajustar política de suscripción
 *
 * Clean Architecture: Application layer service.
 * - No depende de LiveKit directamente (recibe datos via métodos públicos)
 * - El hook/adapter se encarga de escuchar RoomEvent.ConnectionQualityChanged
 */

import { logger } from '@/lib/logger';

export type ConnectionQualityLevel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export interface ConnectionQualityEntry {
  participantId: string;
  quality: ConnectionQualityLevel;
  updatedAt: number;
}

export interface ConnectionQualitySnapshot {
  /** Calidad de conexión del participante local */
  localQuality: ConnectionQualityLevel;
  /** Mapa de participante → calidad */
  remoteQualities: Map<string, ConnectionQualityLevel>;
  /** Cantidad de participantes con conexión pobre */
  poorConnectionCount: number;
  /** Cantidad de participantes con conexión perdida */
  lostConnectionCount: number;
  /** Si la red general está degradada (≥2 poor o ≥1 lost) */
  isNetworkDegraded: boolean;
  /** Modo de calidad sugerido basado en la salud de la red */
  suggestedQualityMode: 'high' | 'medium' | 'low';
}

export interface ConnectionQualityMonitorOptions {
  /**
   * Umbral de conexiones pobres para considerar red degradada.
   * Default: 2
   */
  poorThreshold?: number;
  /**
   * Tiempo (ms) para considerar una entrada como stale y removerla.
   * Default: 30_000 (30s)
   */
  staleEntryMs?: number;
}

export class ConnectionQualityMonitor {
  private readonly log = logger.child('connection-quality-monitor');
  private readonly poorThreshold: number;
  private readonly staleEntryMs: number;

  private localQuality: ConnectionQualityLevel = 'unknown';
  private remoteEntries = new Map<string, ConnectionQualityEntry>();

  constructor(options: ConnectionQualityMonitorOptions = {}) {
    this.poorThreshold = options.poorThreshold ?? 2;
    this.staleEntryMs = options.staleEntryMs ?? 30_000;
  }

  /**
   * Actualiza la calidad de conexión del participante local.
   */
  updateLocalQuality(quality: ConnectionQualityLevel): void {
    if (this.localQuality !== quality) {
      this.log.info('Local connection quality changed', {
        from: this.localQuality,
        to: quality,
      });
      this.localQuality = quality;
    }
  }

  /**
   * Actualiza la calidad de conexión de un participante remoto.
   */
  updateRemoteQuality(participantId: string, quality: ConnectionQualityLevel): void {
    const previous = this.remoteEntries.get(participantId);
    if (previous?.quality !== quality) {
      this.log.debug('Remote connection quality changed', {
        participantId,
        from: previous?.quality ?? 'unknown',
        to: quality,
      });
    }

    this.remoteEntries.set(participantId, {
      participantId,
      quality,
      updatedAt: Date.now(),
    });
  }

  /**
   * Remueve un participante del monitoreo (ej: al desconectarse).
   */
  removeParticipant(participantId: string): void {
    this.remoteEntries.delete(participantId);
  }

  /**
   * Limpia entradas stale (participantes sin actualización reciente).
   */
  pruneStaleEntries(): void {
    const now = Date.now();
    const cutoff = now - this.staleEntryMs;

    for (const [id, entry] of this.remoteEntries) {
      if (entry.updatedAt < cutoff) {
        this.remoteEntries.delete(id);
      }
    }
  }

  /**
   * Obtiene la calidad de un participante específico.
   */
  getParticipantQuality(participantId: string): ConnectionQualityLevel {
    return this.remoteEntries.get(participantId)?.quality ?? 'unknown';
  }

  /**
   * Genera un snapshot inmutable de la calidad de conexión actual.
   */
  buildSnapshot(): ConnectionQualitySnapshot {
    this.pruneStaleEntries();

    const remoteQualities = new Map<string, ConnectionQualityLevel>();
    let poorCount = 0;
    let lostCount = 0;

    for (const [id, entry] of this.remoteEntries) {
      remoteQualities.set(id, entry.quality);
      if (entry.quality === 'poor') poorCount++;
      if (entry.quality === 'lost') lostCount++;
    }

    const localIsPoor = this.localQuality === 'poor' || this.localQuality === 'lost';
    const isNetworkDegraded = localIsPoor || poorCount >= this.poorThreshold || lostCount >= 1;

    let suggestedQualityMode: 'high' | 'medium' | 'low' = 'high';
    if (this.localQuality === 'lost' || lostCount >= 2) {
      suggestedQualityMode = 'low';
    } else if (isNetworkDegraded) {
      suggestedQualityMode = 'medium';
    }

    return {
      localQuality: this.localQuality,
      remoteQualities,
      poorConnectionCount: poorCount,
      lostConnectionCount: lostCount,
      isNetworkDegraded,
      suggestedQualityMode,
    };
  }

  /**
   * Resetea todo el estado del monitor.
   */
  reset(): void {
    this.localQuality = 'unknown';
    this.remoteEntries.clear();
  }
}
