'use client';
/**
 * @module components/space3d/spaceTypes
 * Tipos, constantes e interfaces compartidas entre subcomponentes de Space3D
 */

import { PresenceStatus } from '@/types';
import { ICE_SERVERS as ICE_SERVERS_COMPARTIDOS } from '@/lib/rtcConfig';

// Colores de estado
export const statusColors: Record<PresenceStatus, string> = {
  [PresenceStatus.AVAILABLE]: '#22c55e',
  [PresenceStatus.BUSY]: '#ef4444',
  [PresenceStatus.AWAY]: '#eab308',
  [PresenceStatus.DND]: '#2563eb',
};

// Labels de estado para mostrar al hacer clic
export const STATUS_LABELS: Record<PresenceStatus, string> = {
  [PresenceStatus.AVAILABLE]: 'Disponible',
  [PresenceStatus.BUSY]: 'Ocupado',
  [PresenceStatus.AWAY]: 'Ausente',
  [PresenceStatus.DND]: 'No molestar',
};

export interface VirtualSpace3DProps {
  theme?: string;
  isGameHubOpen?: boolean;
  isPlayingGame?: boolean;
  showroomMode?: boolean;
  showroomDuracionMin?: number;
  showroomNombreVisitante?: string;
  onToggleViben?: () => void;
  onOpenGameHub?: () => void;
  onOpenAvatarSettings?: () => void;
}

// ICE Servers para WebRTC - Servidores STUN/TURN actualizados
export const ICE_SERVERS = ICE_SERVERS_COMPARTIDOS;
