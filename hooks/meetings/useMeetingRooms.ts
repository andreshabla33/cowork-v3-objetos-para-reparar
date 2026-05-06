/**
 * @module hooks/meetings/useMeetingRooms
 * @description Custom React hook for managing meeting room operations.
 * Extracts ALL business logic from MeetingRooms component into a reusable hook.
 *
 * Clean Architecture pattern:
 * - Uses singleton usecase instance at module scope
 * - Depends on IMeetingRepository & IMeetingRealtimeService via dependency injection
 * - No supabase imports — all database access through repositories
 * - No console.log — uses logger.child('module-name')
 * - Strict TypeScript: zero any types
 *
 * Responsibilities:
 * 1. State management for rooms, modals, loading, form inputs
 * 2. Action handlers: loadRooms, createRoom, joinRoom, leaveRoom, endRoom
 * 3. Computed helpers: isInRoom, isCreator
 * 4. Realtime subscriptions with proper cleanup
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { GestionarSalasReunionUseCase } from '@/src/core/application/usecases/GestionarSalasReunionUseCase';
import { meetingRepository } from '@/src/core/infrastructure/adapters/MeetingSupabaseRepository';
import { meetingRealtimeService } from '@/src/core/infrastructure/adapters/MeetingRealtimeSupabaseService';
import type { SalaReunionData } from '@/src/core/domain/ports/IMeetingRepository';

const log = logger.child('use-meeting-rooms');

// Singleton instance at module scope (Clean Architecture pattern)
const gestionarSalasUseCase = new GestionarSalasReunionUseCase(meetingRepository);

/**
 * Form state for creating a new room
 */
interface NewRoomFormState {
  nombre: string;
  descripcion: string;
  es_privada: boolean;
  password: string;
  max_participantes: number;
}

/**
 * Return type for the useMeetingRooms hook
 */
export interface UseMeetingRoomsReturn {
  // State
  rooms: SalaReunionData[];
  showCreateModal: boolean;
  showJoinModal: string | null;
  password: string;
  newRoom: NewRoomFormState;
  loading: boolean;

  // Modal handlers
  setShowCreateModal: (show: boolean) => void;
  setShowJoinModal: (roomId: string | null) => void;

  // Form handlers
  setPassword: (pwd: string) => void;
  setNewRoom: (room: NewRoomFormState) => void;

  // Action handlers
  loadRooms: () => Promise<void>;
  createRoom: () => Promise<void>;
  joinRoom: (roomId: string, roomPassword?: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  endRoom: (roomId: string) => Promise<void>;

  // Computed helpers
  isInRoom: (room: SalaReunionData) => boolean;
  isCreator: (room: SalaReunionData) => boolean;
}

/**
 * Custom hook for managing meeting room operations.
 * Handles state, actions, realtime subscriptions, and cleanup.
 *
 * @param onJoinRoom Optional callback when user joins a room
 * @returns Hook state and action handlers
 */
export function useMeetingRooms(
  onJoinRoom?: (roomId: string) => void
): UseMeetingRoomsReturn {
  const { currentUser, activeWorkspace } = useStore(
    useShallow(s => ({ currentUser: s.currentUser, activeWorkspace: s.activeWorkspace }))
  );

  // State
  const [rooms, setRooms] = useState<SalaReunionData[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [newRoom, setNewRoom] = useState<NewRoomFormState>({
    nombre: '',
    descripcion: '',
    es_privada: false,
    password: '',
    max_participantes: 10,
  });
  const [loading, setLoading] = useState(false);

  /**
   * Load all rooms for the current workspace
   */
  const loadRooms = useCallback(async () => {
    if (!activeWorkspace?.id) {
      log.warn('loadRooms: No active workspace', {
        workspaceId: activeWorkspace?.id,
      });
      return;
    }

    try {
      log.info('Loading meeting rooms', { espacioId: activeWorkspace.id });

      const output = await gestionarSalasUseCase.cargarSalas({
        espacioId: activeWorkspace.id,
      });

      if (output.salas && output.salas.length > 0) {
        log.info('Meeting rooms loaded successfully', {
          count: output.salas.length,
          espacioId: activeWorkspace.id,
        });
        // Filter to only active rooms
        const activeRooms = output.salas.filter((sala) => sala.activa);
        setRooms(activeRooms);
      } else {
        log.info('No meeting rooms found', { espacioId: activeWorkspace.id });
        setRooms([]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading meeting rooms', {
        error: message,
        espacioId: activeWorkspace.id,
      });
      setRooms([]);
    }
  }, [activeWorkspace?.id]);

  /**
   * Create a new meeting room
   */
  const createRoom = useCallback(async () => {
    if (!newRoom.nombre.trim() || !activeWorkspace?.id || !currentUser.id) {
      log.warn('createRoom: Invalid input', {
        hasNombre: newRoom.nombre.length > 0,
        hasWorkspace: !!activeWorkspace?.id,
        hasUser: !!currentUser.id,
      });
      return;
    }

    setLoading(true);

    try {
      log.info('Creating meeting room', {
        nombre: newRoom.nombre,
        espacioId: activeWorkspace.id,
      });

      const output = await gestionarSalasUseCase.crearSala({
        espacioId: activeWorkspace.id,
        nombre: newRoom.nombre.trim(),
        tipo: 'general', // Default type; can be extended
        creadorId: currentUser.id,
        descripcion: newRoom.descripcion.trim() || null,
        maxParticipantes: newRoom.max_participantes,
        esPrivada: newRoom.es_privada,
        password: newRoom.es_privada && newRoom.password ? newRoom.password : null,
      });

      if (!output.success || !output.sala) {
        log.warn('Failed to create meeting room', {
          error: output.error,
          nombre: newRoom.nombre,
        });
        setLoading(false);
        return;
      }

      log.info('Meeting room created successfully', {
        salaId: output.sala.id,
        nombre: output.sala.nombre,
      });

      // Reset form and modals
      setShowCreateModal(false);
      setNewRoom({
        nombre: '',
        descripcion: '',
        es_privada: false,
        password: '',
        max_participantes: 10,
      });

      // Callback for parent component
      onJoinRoom?.(output.sala.id);

      // Reload rooms list
      await loadRooms();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception creating meeting room', {
        error: message,
        nombre: newRoom.nombre,
      });
    } finally {
      setLoading(false);
    }
  }, [newRoom, activeWorkspace?.id, currentUser.id, onJoinRoom, loadRooms]);

  /**
   * Join an existing room
   * @param roomId Room ID to join
   * @param roomPassword Optional password for private rooms
   */
  const joinRoom = useCallback(
    async (roomId: string, roomPassword?: string) => {
      if (!currentUser.id || !roomId) {
        log.warn('joinRoom: Invalid input', {
          hasUser: !!currentUser.id,
          hasRoomId: !!roomId,
        });
        return;
      }

      try {
        const room = rooms.find((r) => r.id === roomId);

        if (!room) {
          log.warn('joinRoom: Room not found', { roomId });
          return;
        }

        // Validate password for private rooms
        if (
          room.es_privada &&
          room.password_hash &&
          room.password_hash !== roomPassword
        ) {
          log.warn('joinRoom: Incorrect password', { roomId });
          return;
        }

        log.info('Joining meeting room', {
          roomId,
          userId: currentUser.id,
        });

        const output = await gestionarSalasUseCase.agregarParticipante({
          salaId: roomId,
          usuarioId: currentUser.id,
          esExterno: false,
        });

        if (!output.success) {
          log.warn('Failed to join meeting room', {
            error: output.error,
            roomId,
          });
          return;
        }

        log.info('Joined meeting room successfully', {
          roomId,
          participanteId: output.participante?.id,
        });

        // Clear modals and password
        setShowJoinModal(null);
        setPassword('');

        // Callback for parent component
        onJoinRoom?.(roomId);

        // Reload rooms list
        await loadRooms();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Exception joining meeting room', {
          error: message,
          roomId,
        });
      }
    },
    [rooms, currentUser.id, onJoinRoom, loadRooms]
  );

  /**
   * Leave a meeting room
   * @param roomId Room ID to leave
   */
  const leaveRoom = useCallback(
    async (roomId: string) => {
      if (!currentUser.id || !roomId) {
        log.warn('leaveRoom: Invalid input', {
          hasUser: !!currentUser.id,
          hasRoomId: !!roomId,
        });
        return;
      }

      try {
        log.info('Leaving meeting room', {
          roomId,
          userId: currentUser.id,
        });

        const output = await gestionarSalasUseCase.eliminarParticipante({
          salaId: roomId,
          usuarioId: currentUser.id,
        });

        if (!output.success) {
          log.warn('Failed to leave meeting room', {
            error: output.error,
            roomId,
          });
          return;
        }

        log.info('Left meeting room successfully', { roomId });

        // Reload rooms list
        await loadRooms();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Exception leaving meeting room', {
          error: message,
          roomId,
        });
      }
    },
    [currentUser.id, loadRooms]
  );

  /**
   * End/terminate a meeting room (only for creator)
   * @param roomId Room ID to end
   */
  const endRoom = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        log.warn('endRoom: Invalid input', { hasRoomId: !!roomId });
        return;
      }

      try {
        log.info('Ending meeting room', { roomId });

        const output = await gestionarSalasUseCase.terminarSala({ salaId: roomId });

        if (!output.success) {
          log.warn('Failed to end meeting room', {
            error: output.error,
            roomId,
          });
          return;
        }

        log.info('Meeting room ended successfully', { roomId });

        // Reload rooms list
        await loadRooms();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Exception ending meeting room', {
          error: message,
          roomId,
        });
      }
    },
    [loadRooms]
  );

  /**
   * Helper: Check if current user is in the room
   */
  const isInRoom = useCallback(
    (room: SalaReunionData): boolean => {
      return (
        room.participantes?.some(
          (p) => p.usuario_id === currentUser.id && !p.es_externo
        ) ?? false
      );
    },
    [currentUser.id]
  );

  /**
   * Helper: Check if current user is the room creator
   */
  const isCreator = useCallback(
    (room: SalaReunionData): boolean => {
      return room.creador_id === currentUser.id;
    },
    [currentUser.id]
  );

  /**
   * Load initial rooms and set up realtime subscriptions
   */
  useEffect(() => {
    if (!activeWorkspace?.id) {
      log.debug('useEffect: No active workspace', {
        workspaceId: activeWorkspace?.id,
      });
      return;
    }

    // Initial load
    loadRooms();

    // Set up realtime subscriptions
    const salasSub = meetingRealtimeService.suscribirSalas(
      activeWorkspace.id,
      () => {
        log.debug('Realtime event: Room change detected', {
          espacioId: activeWorkspace.id,
        });
        loadRooms();
      }
    );

    const participantesSub = meetingRealtimeService.suscribirParticipantesSala(
      activeWorkspace.id,
      () => {
        log.debug('Realtime event: Participant change detected', {
          espacioId: activeWorkspace.id,
        });
        loadRooms();
      }
    );

    // Cleanup subscriptions on unmount or workspace change
    return () => {
      log.debug('Cleaning up realtime subscriptions', {
        espacioId: activeWorkspace.id,
      });
      salasSub.unsubscribe();
      participantesSub.unsubscribe();
    };
  }, [activeWorkspace?.id, loadRooms]);

  return {
    // State
    rooms,
    showCreateModal,
    showJoinModal,
    password,
    newRoom,
    loading,

    // Setters
    setShowCreateModal,
    setShowJoinModal,
    setPassword,
    setNewRoom,

    // Actions
    loadRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,

    // Computed
    isInRoom,
    isCreator,
  };
}
