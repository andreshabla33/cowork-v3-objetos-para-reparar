/**
 * @module domain/ports/ISpaceRepository
 * @description Port interface for 3D space data operations.
 * Decouples 3D space logic (virtual avatars, build mode catalog) from Supabase infrastructure.
 *
 * Clean Architecture: Domain layer defines the contract,
 * Infrastructure implements it with Supabase.
 *
 * Ref: Supabase JS v2 — realtime channels, PostgREST API.
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

// CatalogoObjeto3D es el tipo canónico en types/objetos3d (capa compartida).
// Importamos para uso interno y re-exportamos para que los consumidores
// de este port usen el mismo tipo sin importar dos lugares.
import type { CatalogoObjeto3D } from '@/types/objetos3d';
export type { CatalogoObjeto3D };

/**
 * WebRTC signaling message structure.
 * Transmitted through Supabase realtime channel.
 */
export interface MensajeSeñalizacionWebRTC {
  type: 'broadcast';
  event: 'offer' | 'answer' | 'ice-candidate';
  payload: {
    from: string;
    to: string;
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
}

/**
 * Repository contract for 3D space operations.
 * All methods handle errors gracefully.
 */
export interface ISpaceRepository {
  /**
   * Fetch all active 3D objects from the catalog.
   * Filtered by activo=true, ordered by orden.
   */
  obtenerCatalogo3D(): Promise<CatalogoObjeto3D[]>;

  /**
   * Subscribe to WebRTC signaling channel for a workspace.
   * Listens for offer, answer, and ice-candidate events.
   * Returns unsubscribe function.
   */
  suscribirCanalWebRTC(
    espacioId: string,
    onOffer: (payload: any) => void,
    onAnswer: (payload: any) => void,
    onIceCandidate: (payload: any) => void
  ): Promise<() => void>;

  /**
   * Send WebRTC signaling message through the channel.
   */
  enviarMensajeWebRTC(
    espacioId: string,
    mensaje: MensajeSeñalizacionWebRTC
  ): Promise<void>;
}
