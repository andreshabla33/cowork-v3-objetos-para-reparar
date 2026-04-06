/**
 * @module types/workspace
 * @description Type definitions for workspace-related data structures.
 * Used by WorkspaceLayout and workspace hooks.
 */

import type { Role, PresenceStatus } from './index';

/**
 * Game invitation data structure
 */
export interface GameInvitationData {
  id: string;
  juego: string;
  invitador_id: string;
  configuracion: {
    tiempo: number;
    invitador_nombre: string;
    invitador_color?: 'w' | 'b';
  };
}

/**
 * Pending game invitation with associated match ID
 */
export interface PendingGameInvitation {
  invitacion: GameInvitationData;
  partidaId: string;
}

/**
 * Presence payload sent to Supabase Realtime
 * Contains user data synchronized across channels
 */
export interface PresencePayload {
  user_id: string;
  empresa_id: string | null;
  departamento_id: string | null;
  nivel_detalle: 'publico' | 'empresa';
  x: number;
  y: number;
  direction: 'front' | 'left' | 'right' | 'back';
  status: PresenceStatus;
  // Detailed presence (nivel_detalle === 'empresa')
  name?: string;
  role?: Role;
  avatarConfig?: {
    skinColor: string;
    clothingColor: string;
    hairColor: string;
    hairStyle?: 'default' | 'spiky' | 'long' | 'ponytail';
    eyeColor?: string;
    accessory?: 'none' | 'glasses' | 'hat' | 'headphones';
    modelUrl?: string;
  };
  profilePhoto?: string;
  isMicOn?: boolean;
  isCameraOn?: boolean;
  isPrivate?: boolean;
  avatar3DConfig?: {
    id: string;
    nombre: string;
    modelo_url: string;
    escala: number;
    textura_url?: string | null;
    animaciones?: {
      id: string;
      nombre: string;
      url: string;
      loop: boolean;
      orden: number;
      strip_root_motion?: boolean;
    }[];
  } | null;
}

/**
 * Sub-tab types for workspace navigation
 */
export type SubTabType =
  | 'space'
  | 'chat'
  | 'tasks'
  | 'grabaciones'
  | 'metricas'
  | 'miembros'
  | 'avatar'
  | 'calendar'
  | 'settings';
