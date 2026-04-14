/**
 * @module hooks/space3d/useBroadcast
 * Hook para broadcast de movimiento, eventos instantáneos (chat, reactions,
 * wave, nudge, invite, lock), y gestión de UI de chat/emojis.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { User, Workspace } from '@/types';
import type { Session } from '@supabase/supabase-js';
import type { UserSettings } from '@/lib/userSettings';
import { obtenerChunk } from '@/lib/chunkSystem';
import type { AccionXP } from '@/lib/gamificacion';
import { actualizarEstadoUsuarioEcs, type EstadoEcsEspacio } from '@/lib/ecs/espacioEcs';
import { getSettingsSection, sendDesktopNotification } from '@/lib/userSettings';
import { audioManager } from '@/services/audioManager';
import { ChatService } from '@/services/chatService';
import {
  createChatDataPacket,
  createLockConversationDataPacket,
  createMovementDataPacket,
  createRaiseHandDataPacket,
  createReactionDataPacket,
  type DataPacketContract,
  RaiseHandUseCase,
  type RealtimeEventBus,
} from '@/modules/realtime-room';
import { MOVEMENT_BROADCAST_MS, type RealtimePositionEntry, type UseBroadcastReturn } from './types';

// Sonidos (importados como funciones puras — se definen en VirtualSpace3D)
let playWaveSound: () => void = () => {};
let playNudgeSound: () => void = () => {};
let playInviteSound: () => void = () => {};

/** Permite al componente padre inyectar las funciones de sonido */
export function setBroadcastSoundFunctions(wave: () => void, nudge: () => void, invite: () => void) {
  playWaveSound = wave;
  playNudgeSound = nudge;
  playInviteSound = invite;
}

export function useBroadcast(params: {
  session: Session | null;
  currentUser: User;
  currentUserEcs: User;
  activeWorkspace: Workspace | null;
  usersInCall: User[];
  enviarDataLivekit: (mensaje: DataPacketContract, reliable?: boolean) => boolean;
  ecsStateRef: React.MutableRefObject<EstadoEcsEspacio>;
  usuariosVisiblesRef: React.MutableRefObject<Set<string>>;
  realtimePositionsRef: React.MutableRefObject<Map<string, RealtimePositionEntry>>;
  realtimeEventBusRef: React.MutableRefObject<RealtimeEventBus | null>;
  livekitConnected: boolean;
  raisedHandParticipantIds: Set<string>;
  setRaisedHandParticipantIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  conversacionBloqueada: boolean;
  setConversacionBloqueada: React.Dispatch<React.SetStateAction<boolean>>;
  setConversacionesBloqueadasRemoto: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  grantXP: (accion: AccionXP, cooldownMs?: number) => void;
  notifSettings: UserSettings['notifications'];
  setPrivacy: (value: boolean) => void;
  hasActiveCall: boolean;
  proximidadNotificadaRef: React.MutableRefObject<boolean>;
  /**
   * Setters de notificaciones entrantes de nudge / invite. Se pasan desde
   * `useSpace3D` porque el state vive allí (compartido con el handler
   * `handleAcceptInvite`). Sin ellos el toast nunca aparece en el receptor.
   */
  setIncomingNudge: React.Dispatch<React.SetStateAction<{ from: string; fromName: string } | null>>;
  setIncomingInvite: React.Dispatch<React.SetStateAction<{ from: string; fromName: string; x: number; y: number } | null>>;
}): UseBroadcastReturn {
  const {
    session, currentUser, currentUserEcs, activeWorkspace, usersInCall,
    enviarDataLivekit, ecsStateRef,
    usuariosVisiblesRef, realtimePositionsRef,
    realtimeEventBusRef, livekitConnected,
    raisedHandParticipantIds, setRaisedHandParticipantIds,
    conversacionBloqueada, setConversacionBloqueada,
    setConversacionesBloqueadasRemoto, grantXP, notifSettings,
    setPrivacy, hasActiveCall, proximidadNotificadaRef,
    setIncomingNudge, setIncomingInvite,
  } = params;

  // ========== UI State ==========
  const [showEmojis, setShowEmojis] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [remoteMessages, setRemoteMessages] = useState<Map<string, string>>(new Map());
  const [localReactions, setLocalReactions] = useState<Array<{ id: string; emoji: string }>>([]);
  const [remoteReaction, setRemoteReaction] = useState<{ emoji: string; from: string; fromName: string } | null>(null);
  const [incomingWave, setIncomingWave] = useState<{ from: string; fromName: string } | null>(null);
  const lastInteractionRef = useRef<Map<string, number>>(new Map());
  const raiseHandUseCaseRef = useRef(new RaiseHandUseCase());

  // ========== Escape global ==========
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') { setShowChat(false); setShowEmojis(false); setShowStatusPicker(false); }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showChat, showEmojis, showStatusPicker]);

  // ========== manejarEventoInstantaneo ==========
  const manejarEventoInstantaneo = useCallback((mensaje: DataPacketContract) => {
    if (!mensaje?.type || !mensaje.payload || !session?.user?.id) return;

    if (mensaje.type === 'reaction') {
      if (!mensaje.payload.from || !mensaje.payload.fromName) return;
      if (mensaje.payload.from === session.user.id) return;
      setRemoteReaction({ emoji: mensaje.payload.emoji, from: mensaje.payload.from, fromName: mensaje.payload.fromName });
      setTimeout(() => setRemoteReaction(null), 2000);
      return;
    }

    if (mensaje.type === 'raise_hand') {
      setRaisedHandParticipantIds((current) => raiseHandUseCaseRef.current.apply({
        participantId: mensaje.payload.participantId,
        participantName: mensaje.payload.by,
        raised: mensaje.payload.raised,
        raisedHandParticipantIds: current,
      }).raisedHandParticipantIds);
      return;
    }

    if (mensaje.type === 'wave') {
      if (mensaje.payload.from === session.user.id) return;
      if (mensaje.payload.to && mensaje.payload.to !== session.user.id) return;
      const dedupKey = `wave_${mensaje.payload.from}`;
      const now = Date.now();
      if (now - (lastInteractionRef.current.get(dedupKey) || 0) < 500) return;
      lastInteractionRef.current.set(dedupKey, now);
      playWaveSound();
      setIncomingWave({ from: mensaje.payload.from, fromName: mensaje.payload.fromName });
      setTimeout(() => setIncomingWave(null), 4000);
      sendDesktopNotification(`👋 ${mensaje.payload.fromName}`, 'te está saludando');
      return;
    }

    if (mensaje.type === 'chat') {
      if (mensaje.payload.from === session.user.id) return;
      setRemoteMessages(prev => new Map(prev).set(mensaje.payload.from, mensaje.payload.message));
      const ns = getSettingsSection('notifications');
      if (ns.newMessageSound) {
        audioManager.playChatNotification().catch(() => {});
      }
      if (ns.desktopNotifications) sendDesktopNotification(`💬 ${mensaje.payload.fromName}`, mensaje.payload.message);
      if (ns.mentionNotifications && mensaje.payload.message?.includes(`@${currentUser.name}`)) {
        sendDesktopNotification(`📢 Mención de ${mensaje.payload.fromName}`, mensaje.payload.message);
      }
      setTimeout(() => {
        setRemoteMessages(prev => { const m = new Map(prev); m.delete(mensaje.payload.from); return m; });
      }, 5000);
      return;
    }

    if (mensaje.type === 'nudge') {
      if (mensaje.payload.from === session.user.id) return;
      if (mensaje.payload.to && mensaje.payload.to !== session.user.id) return;
      const dedupKey = `nudge_${mensaje.payload.from}`;
      const now = Date.now();
      if (now - (lastInteractionRef.current.get(dedupKey) || 0) < 500) return;
      lastInteractionRef.current.set(dedupKey, now);
      playNudgeSound();
      // Muestra el toast al receptor (auto-dismiss a los 4s, mismo patrón que wave).
      setIncomingNudge({ from: mensaje.payload.from, fromName: mensaje.payload.fromName });
      setTimeout(() => setIncomingNudge(null), 4000);
      sendDesktopNotification(`🔔 ${mensaje.payload.fromName}`, 'quiere tu atención');
      return;
    }

    if (mensaje.type === 'invite') {
      if (mensaje.payload.from === session.user.id) return;
      if (mensaje.payload.to && mensaje.payload.to !== session.user.id) return;
      const dedupKey = `invite_${mensaje.payload.from}`;
      const now = Date.now();
      if (now - (lastInteractionRef.current.get(dedupKey) || 0) < 500) return;
      lastInteractionRef.current.set(dedupKey, now);
      playInviteSound();
      // Muestra el toast con botón 'Ir' que usa handleAcceptInvite para
      // teleportar al invitante. No usamos timeout aquí: el toast invite
      // persiste hasta que el receptor decide aceptar o cerrar.
      setIncomingInvite({
        from: mensaje.payload.from,
        fromName: mensaje.payload.fromName,
        x: mensaje.payload.x,
        y: mensaje.payload.y,
      });
      sendDesktopNotification(`📍 ${mensaje.payload.fromName}`, 'te invita a unirte');
      return;
    }

    if (mensaje.type === 'lock_conversation') {
      if (mensaje.payload.by === session.user.id) return;
      const soyParticipante = mensaje.payload.participants?.includes(session.user.id);
      if (mensaje.payload.locked) {
        if (soyParticipante) setConversacionBloqueada(true);
        setConversacionesBloqueadasRemoto(prev => new Map(prev).set(mensaje.payload.by, mensaje.payload.participants || []));
      } else {
        if (soyParticipante) setConversacionBloqueada(false);
        setConversacionesBloqueadasRemoto(prev => { const n = new Map(prev); n.delete(mensaje.payload.by); return n; });
      }
      return;
    }

    if (mensaje.type === 'movement') {
      if (mensaje.payload.id === session.user.id) return;
      if (!usuariosVisiblesRef.current.has(mensaje.payload.id)) return;
      realtimePositionsRef.current.set(mensaje.payload.id, {
        x: mensaje.payload.x, y: mensaje.payload.y,
        direction: mensaje.payload.direction, isMoving: mensaje.payload.isMoving,
        animState: mensaje.payload.animState || (mensaje.payload.isMoving ? 'walk' : 'idle'),
        timestamp: Date.now(),
      });
      actualizarEstadoUsuarioEcs(
        ecsStateRef.current, mensaje.payload.id,
        mensaje.payload.x / 16, mensaje.payload.y / 16,
        mensaje.payload.direction, mensaje.payload.isMoving
      );
    }
  }, [currentUser.name, session?.user?.id, setRaisedHandParticipantIds]);

  // ========== LiveKit DataChannel listener ==========
  useEffect(() => {
    if (!livekitConnected) return;
    const eventBus = realtimeEventBusRef.current;
    if (!eventBus) return;
    return eventBus.onAny(({ packet }: { packet: DataPacketContract }) => {
      manejarEventoInstantaneo(packet);
    });
  }, [livekitConnected, realtimeEventBusRef, manejarEventoInstantaneo]);

  // ========== broadcastMovement ==========
  const lastMovementSentRef = useRef(0);

  const broadcastMovement = useCallback((x: number, y: number, direction: string, isMoving: boolean, animState?: string, reliable: boolean = false) => {
    const now = Date.now();
    if (!reliable && now - lastMovementSentRef.current < MOVEMENT_BROADCAST_MS) return;
    lastMovementSentRef.current = now;
    const currentUserId = session?.user?.id;
    if (!currentUserId) return;
    // Always update local ECS state regardless of LiveKit connection
    actualizarEstadoUsuarioEcs(ecsStateRef.current, currentUserId, x / 16, y / 16, direction, isMoving);
    // Skip LiveKit publish if room not connected — avoids 60fps warn spam.
    // Ref: LiveKit JS SDK docs — Room.state must be 'connected' before
    //      publishData(). The guard in RealtimeDataPublisher catches this too,
    //      but checking here avoids serialization overhead + console pollution.
    //      Per R3F pitfalls: "useFrame should not trigger side-effects" —
    //      the less work per frame, the better.
    if (!livekitConnected) return;
    if (enviarDataLivekit(createMovementDataPacket({
      id: currentUserId,
      x,
      y,
      direction,
      isMoving,
      animState: animState || (isMoving ? 'walk' : 'idle'),
      chunk: obtenerChunk(x, y).clave,
      timestamp: Date.now(),
    }), reliable)) return;
  }, [enviarDataLivekit, session?.user?.id, livekitConnected]);

  // ========== bloquearConversacion ==========
  const bloquearConversacion = useCallback(() => {
    const currentUserId = session?.user?.id;
    if (!currentUserId) return;
    const newLocked = !conversacionBloqueada;
    setConversacionBloqueada(newLocked);
    const participantIds = [currentUserId, ...usersInCall.map(u => u.id)].filter(Boolean) as string[];
    enviarDataLivekit(createLockConversationDataPacket({ locked: newLocked, by: currentUserId, participants: participantIds }));
  }, [conversacionBloqueada, session?.user?.id, usersInCall, enviarDataLivekit]);

  // ========== handleSendMessage ==========
  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || !session?.user?.id) return;
    const content = chatInput.trim();
    setLocalMessage(content);
    setTimeout(() => setLocalMessage(null), 5000);
    enviarDataLivekit(createChatDataPacket({ message: content, from: session.user.id, fromName: currentUser.name }));
    if (usersInCall.length > 0) {
      const recipientIds = usersInCall.map(u => u.id);
      await ChatService.sendMessage(content, session.user.id, activeWorkspace?.id || '', recipientIds);
    }
    grantXP('mensaje_chat', 5000);
    setChatInput('');
    setShowChat(false);
  }, [chatInput, session?.user?.id, currentUser.name, usersInCall, activeWorkspace?.id, enviarDataLivekit, grantXP]);

  // ========== handleTriggerReaction ==========
  const handleTriggerReaction = useCallback((emoji: string) => {
    const reactionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setLocalReactions(prev => [...prev, { id: reactionId, emoji }]);
    setTimeout(() => { setLocalReactions(prev => prev.filter(r => r.id !== reactionId)); }, 1500);
    enviarDataLivekit(createReactionDataPacket({ emoji, from: session?.user?.id, fromName: currentUser.name }));
  }, [session?.user?.id, currentUser.name, enviarDataLivekit]);

  const handleToggleRaiseHand = useCallback(() => {
    const participantId = session?.user?.id;
    if (!participantId) return;
    const decision = raiseHandUseCaseRef.current.toggle({
      participantId,
      participantName: currentUser.name,
      raisedHandParticipantIds,
    });
    setRaisedHandParticipantIds(decision.raisedHandParticipantIds);
    const sent = enviarDataLivekit(createRaiseHandDataPacket(decision.packet), true);
    if (!sent) {
      setRaisedHandParticipantIds((current) => {
        const rollback = new Set(current);
        if (decision.packet.raised) {
          rollback.delete(participantId);
        } else {
          rollback.add(participantId);
        }
        return rollback;
      });
    }
  }, [currentUser.name, enviarDataLivekit, raisedHandParticipantIds, session?.user?.id, setRaisedHandParticipantIds]);

  const isLocalHandRaised = Boolean(session?.user?.id && raisedHandParticipantIds.has(session.user.id));

  // ========== Atajos numéricos ==========
  useEffect(() => {
    const emojiKeys = ['👍', '🔥', '❤️', '👏', '😂', '😮', '🚀', '✨'];
    const handleNumericKeys = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) handleTriggerReaction(emojiKeys[num - 1]);
    };
    window.addEventListener('keydown', handleNumericKeys);
    return () => window.removeEventListener('keydown', handleNumericKeys);
  }, [handleTriggerReaction]);

  // ========== Proximity notification ==========
  useEffect(() => {
    if (hasActiveCall) {
      if (!proximidadNotificadaRef.current) {
        proximidadNotificadaRef.current = true;
        if (notifSettings.nearbyUserSound) {
          sendDesktopNotification('Usuario cercano', `${usersInCall[0]?.name || 'Alguien'} está cerca — activa mic/cam para hablar`);
        }
      }
    } else {
      if (currentUser.isPrivate) setPrivacy(false);
      if (conversacionBloqueada) setConversacionBloqueada(false);
      proximidadNotificadaRef.current = false;
      setConversacionesBloqueadasRemoto(new Map());
    }
  }, [hasActiveCall]);

  return {
    broadcastMovement,
    manejarEventoInstantaneo,
    bloquearConversacion,
    handleSendMessage,
    handleTriggerReaction,
    handleToggleRaiseHand,
    showEmojis, setShowEmojis,
    showChat, setShowChat,
    showStatusPicker, setShowStatusPicker,
    chatInput, setChatInput,
    localMessage,
    remoteMessages,
    localReactions,
    remoteReaction,
    raisedHandParticipantIds,
    isLocalHandRaised,
    incomingWave, setIncomingWave,
  };
}
