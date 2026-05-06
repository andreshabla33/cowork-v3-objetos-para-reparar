/**
 * @module hooks/chat/useChatChannels
 * @description Sub-hook for chat channel/group management.
 * Handles loading groups, members, channel CRUD, and direct messaging.
 *
 * Clean Architecture: Presentation layer — delegates to Application use cases.
 * F4 refactor: extracted from useChatPanel monolith.
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { logger } from '@/lib/logger';
import { getSettingsSection } from '@/lib/userSettings';
import type { ChatGroup } from '@/types';
import type {
  MiembroChatData,
  MiembroCanal,
} from '@/src/core/domain/ports/IChatRepository';

import { chatRepository } from '@/src/core/infrastructure/adapters/ChatSupabaseRepository';
import { CargarGruposChatUseCase } from '@/src/core/application/usecases/CargarGruposChatUseCase';
import { GestionarCanalesChatUseCase } from '@/src/core/application/usecases/GestionarCanalesChatUseCase';
import { GestionarChatDirectoUseCase } from '@/src/core/application/usecases/GestionarChatDirectoUseCase';

const log = logger.child('chat-channels');

// Module-level singletons (Composition Root pattern)
const cargarGrupos = new CargarGruposChatUseCase(chatRepository);
const gestionarCanales = new GestionarCanalesChatUseCase(chatRepository);
const gestionarChatDirecto = new GestionarChatDirectoUseCase(chatRepository);

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseChatChannelsReturn {
  grupos: ChatGroup[];
  loading: boolean;
  showCreateModal: boolean;
  showAddMembers: boolean;
  miembrosEspacio: MiembroChatData[];
  showMeetingRooms: boolean;
  showMembersPanel: boolean;
  channelMembers: MiembroCanal[];
  grupoActivo: string | null;

  setShowCreateModal: (show: boolean) => void;
  setShowAddMembers: (show: boolean) => void;
  setShowMeetingRooms: (show: boolean) => void;
  setShowMembersPanel: (show: boolean) => void;

  refetchGrupos: () => Promise<ChatGroup[] | undefined>;
  handleChannelSelect: (id: string) => void;
  handleDeleteChannel: (grupoId: string, nombre: string) => Promise<void>;
  canDeleteChannel: (grupo: ChatGroup) => boolean;
  openDirectChat: (targetUser: MiembroChatData) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatChannels({
  onChannelSelect,
}: {
  onChannelSelect?: () => void;
}): UseChatChannelsReturn {
  const {
    activeWorkspace,
    currentUser,
    setActiveSubTab,
    userRoleInActiveWorkspace,
    activeChatGroupId,
    setActiveChatGroupId,
  } = useStore(useShallow(s => ({
    activeWorkspace: s.activeWorkspace,
    currentUser: s.currentUser,
    setActiveSubTab: s.setActiveSubTab,
    userRoleInActiveWorkspace: s.userRoleInActiveWorkspace,
    activeChatGroupId: s.activeChatGroupId,
    setActiveChatGroupId: s.setActiveChatGroupId,
  })));

  const [grupos, setGrupos] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [miembrosEspacio, setMiembrosEspacio] = useState<MiembroChatData[]>([]);
  const [showMeetingRooms, setShowMeetingRooms] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [channelMembers, setChannelMembers] = useState<MiembroCanal[]>([]);

  const grupoActivo = activeChatGroupId;
  const setGrupoActivo = setActiveChatGroupId;

  // ── Refetch groups ────────────────────────────────────────────────────────

  const refetchGrupos = useCallback(async (): Promise<ChatGroup[] | undefined> => {
    if (!activeWorkspace) {
      log.warn('No active workspace, skipping group fetch');
      return;
    }

    try {
      log.debug('Fetching groups', { espacioId: activeWorkspace.id });
      const data = await cargarGrupos.ejecutar(activeWorkspace.id);
      setGrupos(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to fetch groups', { error: message });
      return undefined;
    }
  }, [activeWorkspace]);

  // ── Load groups on workspace change ────────────────────────────────────────

  useEffect(() => {
    if (!activeWorkspace) return;

    const cargarYSeleccionar = async () => {
      setLoading(true);
      const data = await refetchGrupos();
      if (data && data.length > 0 && !grupoActivo) {
        const canales = data.filter((g) => g.tipo !== 'directo');
        const general = canales.find((g) => g.nombre.toLowerCase() === 'general');
        setGrupoActivo(general ? general.id : canales[0]?.id || data[0].id);
        log.debug('Selected default channel', {
          channelId: general?.id || canales[0]?.id,
        });
      }
      setLoading(false);
    };

    cargarYSeleccionar();
  }, [activeWorkspace, refetchGrupos, grupoActivo, setGrupoActivo]);

  // ── Load space members ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeWorkspace || !currentUser.id) return;

    const cargarMiembros = async () => {
      try {
        log.debug('Fetching space members', { espacioId: activeWorkspace.id });
        const miembros = await gestionarCanales.obtenerMiembrosEspacioDisponibles(
          activeWorkspace.id,
          currentUser.id,
        );
        setMiembrosEspacio(miembros);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to fetch space members', { error: message });
      }
    };

    cargarMiembros();
  }, [activeWorkspace, currentUser.id]);

  // ── Refetch when grupoActivo not in local state ───────────────────────────

  useEffect(() => {
    if (grupoActivo && activeWorkspace && !grupos.find((g) => g.id === grupoActivo)) {
      log.debug('Channel not in local state, refetching', { grupoActivo });
      refetchGrupos();
    }
  }, [grupoActivo, activeWorkspace, grupos, refetchGrupos]);

  // ── Load channel members ───────────────────────────────────────────────────

  useEffect(() => {
    if (!grupoActivo) return;

    const cargarMiembrosCanal = async () => {
      try {
        log.debug('Fetching channel members', { grupoId: grupoActivo });
        const miembros = await gestionarCanales.obtenerMiembrosCanal(grupoActivo);
        setChannelMembers(miembros);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to fetch channel members', { error: message });
      }
    };

    cargarMiembrosCanal();
  }, [grupoActivo]);

  // ── Channel selection ──────────────────────────────────────────────────────

  const handleChannelSelect = useCallback(
    (id: string) => {
      setGrupoActivo(id);
      setActiveSubTab('chat');
      if (onChannelSelect) onChannelSelect();
    },
    [setActiveSubTab, onChannelSelect, setGrupoActivo],
  );

  // ── Delete channel ─────────────────────────────────────────────────────────

  const handleDeleteChannel = useCallback(
    async (grupoId: string, nombre: string) => {
      const confirmado = window.confirm(
        `¿Estás seguro de eliminar el canal "${nombre}"? Se eliminarán todos los mensajes.`,
      );
      if (!confirmado) return;

      try {
        log.debug('Deleting channel', { grupoId });
        const success = await gestionarCanales.eliminarCanal(grupoId);

        if (success) {
          setGrupos((prev) => prev.filter((g) => g.id !== grupoId));

          if (grupoActivo === grupoId) {
            const restantes = grupos.filter(
              (g) => g.id !== grupoId && g.tipo !== 'directo',
            );
            if (restantes.length > 0) {
              setGrupoActivo(restantes[0].id);
            } else {
              setGrupoActivo('');
            }
          }

          log.info('Channel deleted successfully', { grupoId });
        } else {
          log.error('Channel deletion returned false');
          window.alert('Error al eliminar el canal');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to delete channel', { error: message });
        window.alert(`Error al eliminar el canal: ${message}`);
      }
    },
    [grupoActivo, grupos, setGrupoActivo],
  );

  // ── Permission check ──────────────────────────────────────────────────────

  const canDeleteChannel = useCallback(
    (grupo: ChatGroup): boolean => {
      if (!userRoleInActiveWorkspace) return false;
      const isAdmin = ['admin', 'super_admin'].includes(userRoleInActiveWorkspace);
      const isCreator = grupo.creado_por === currentUser.id;
      return isAdmin || isCreator;
    },
    [userRoleInActiveWorkspace, currentUser.id],
  );

  // ── Direct chat ────────────────────────────────────────────────────────────

  const openDirectChat = useCallback(
    async (targetUser: MiembroChatData) => {
      if (!activeWorkspace || !currentUser.id) {
        log.warn('Missing workspace or currentUser for DM');
        return;
      }

      if (targetUser.id === currentUser.id) {
        log.warn('Cannot DM yourself');
        return;
      }

      try {
        const privacyS = getSettingsSection('privacy');
        if (!privacyS.allowDirectMessages) {
          window.alert('Has desactivado los mensajes directos en tu configuración de privacidad.');
          return;
        }

        log.debug('Opening direct chat', { targetUserId: targetUser.id });

        const resultado = await gestionarChatDirecto.ejecutar(
          activeWorkspace.id,
          currentUser.id,
          targetUser.id,
        );

        if (resultado) {
          const gruposActualizados = await refetchGrupos();
          if (gruposActualizados) {
            setGrupos(gruposActualizados);
          }

          setGrupoActivo(resultado.grupoId);
          setActiveSubTab('chat');
          log.debug('Direct chat opened', { grupoId: resultado.grupoId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to open direct chat', { error: message });
      }
    },
    [activeWorkspace, currentUser.id, setGrupoActivo, setActiveSubTab, refetchGrupos],
  );

  return {
    grupos,
    loading,
    showCreateModal,
    showAddMembers,
    miembrosEspacio,
    showMeetingRooms,
    showMembersPanel,
    channelMembers,
    grupoActivo,

    setShowCreateModal,
    setShowAddMembers,
    setShowMeetingRooms,
    setShowMembersPanel,

    refetchGrupos,
    handleChannelSelect,
    handleDeleteChannel,
    canDeleteChannel,
    openDirectChat,
  };
}
