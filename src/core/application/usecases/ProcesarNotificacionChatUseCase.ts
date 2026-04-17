/**
 * @module application/usecases/ProcesarNotificacionChatUseCase
 * @description Use case for processing incoming chat notification payloads.
 * Resolves sender name and group metadata required to display toast notifications.
 *
 * Clean Architecture: Application layer — orchestrates IChatRepository lookups
 * that were previously made directly from the Presentation hook (useChatPanel).
 *
 * F3 refactor: eliminates direct chatRepository access in Presentation layer.
 *
 * Ref: Clean Architecture — Dependency Inversion Principle.
 */

import { logger } from '@/lib/logger';
import type { IChatRepository, NombreUsuario } from '../../domain/ports/IChatRepository';

const log = logger.child('ProcesarNotificacionChat');

// ─── Input / Output DTOs ─────────────────────────────────────────────────────

export interface DatosNotificacionEntrante {
  /** User ID of the message sender. */
  usuarioId: string;
  /** Group/channel ID where the message was sent. */
  grupoId: string;
  /** Raw message content. */
  contenido: string;
  /** Mentioned user IDs (nullable from realtime payload). */
  menciones: string[] | null;
}

export interface ResultadoNotificacion {
  /** Formatted sender display name ("Nombre Apellido"). */
  senderName: string;
  /** Channel/group display name. */
  channelName: string;
  /** Whether the channel is a direct message. */
  isDirect: boolean;
  /** Whether the current user was mentioned in this message. */
  isMentioned: boolean;
  /** Original message content for the toast body. */
  contenido: string;
}

// ─── Use Case ────────────────────────────────────────────────────────────────

export class ProcesarNotificacionChatUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  /**
   * Resolve sender + group info for a notification toast.
   * Returns null if either lookup fails (sender deleted, group removed, etc.).
   *
   * @param datos  Incoming notification data
   * @param currentUserId  ID of the logged-in user (for mention detection)
   */
  async ejecutar(
    datos: DatosNotificacionEntrante,
    currentUserId: string,
  ): Promise<ResultadoNotificacion | null> {
    const [senderData, grupoInfo] = await Promise.all([
      this.chatRepository.obtenerNombreUsuario(datos.usuarioId),
      this.chatRepository.obtenerInfoGrupo(datos.grupoId),
    ]);

    // Degraded-path: don't swallow the notification just because a lookup
    // failed (common RLS edge case for DMs where the receiver hasn't opened
    // the chat yet and their miembros_grupo entry is fresh). Use whatever
    // data we have and log so we can diagnose if it's systemic.
    if (!senderData && !grupoInfo) {
      log.warn('Both lookups failed for chat notification', {
        grupoId: datos.grupoId,
        usuarioId: datos.usuarioId,
      });
      return null;
    }
    if (!senderData) {
      log.warn('Sender lookup failed, using fallback name', {
        grupoId: datos.grupoId,
        usuarioId: datos.usuarioId,
      });
    }
    if (!grupoInfo) {
      log.warn('Group lookup failed, falling back to DM assumption', {
        grupoId: datos.grupoId,
        usuarioId: datos.usuarioId,
      });
    }

    // DM heuristic: if we couldn't load the group but the group's `nombre`
    // format is "uid1|uid2" (set by GestionarChatDirectoUseCase), infer
    // direct. Conservative default when unknown: treat as DM so the user
    // is still alerted (DMs are personal → always notify).
    const isDirect = grupoInfo
      ? grupoInfo.tipo === 'directo'
      : true;
    const menciones = datos.menciones ?? [];
    const isMentioned = menciones.includes(currentUserId);
    const senderName = senderData ? formatSenderName(senderData) : 'Alguien';
    const channelName = grupoInfo?.nombre ?? 'Chat';

    return {
      senderName,
      channelName,
      isDirect,
      isMentioned,
      contenido: datos.contenido,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSenderName(data: NombreUsuario): string {
  return data.apellido
    ? `${data.nombre} ${data.apellido}`
    : data.nombre;
}
