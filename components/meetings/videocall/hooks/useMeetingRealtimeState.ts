import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat, useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { type Participant, RoomEvent, Track } from 'livekit-client';
import { supabase } from '@/lib/supabase';
import { sendDesktopNotification } from '@/lib/userSettings';
import { LiveKitRoomGateway, RaiseHandUseCase, RealtimeSessionTelemetry } from '@/modules/realtime-room';
import type { InvitadoExterno } from '@/types/meeting-types';
import type { TipoGrabacionDetallado } from '../../recording/types/analysis';
import type { ToastNotification } from '@/components/ChatToast';
import type { GuestPermissions, MeetingConsentRequest, MeetingQualityState } from '../meetingRoom.types';
import type { ViewMode } from '../ViewModeSelector';
import type { TipoReunion } from '../MeetingControlBar';
import { useOptimizacionSalaGrande } from './useOptimizacionSalaGrande';

const SPEAKER_HOLD_MS = 5000;
const SHORT_SPEAKER_BUBBLE_MS = 5000;

let meetingAudioContext: AudioContext | null = null;

const getMeetingAudioContext = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const AudioContextConstructor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  if (!meetingAudioContext || meetingAudioContext.state === 'closed') {
    meetingAudioContext = new AudioContextConstructor();
  }

  return meetingAudioContext;
};

const playMeetingTone = (config: {
  startFrequency: number;
  endFrequency: number;
  attackGain: number;
  durationSeconds: number;
  type?: OscillatorType;
}) => {
  const audioContext = getMeetingAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = config.type ?? 'sine';
  oscillator.frequency.setValueAtTime(config.startFrequency, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(config.endFrequency, audioContext.currentTime + config.durationSeconds * 0.7);

  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(config.attackGain, audioContext.currentTime + Math.min(0.03, config.durationSeconds / 4));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + config.durationSeconds);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + config.durationSeconds);
};

const playRaiseHandSound = () => {
  try {
    playMeetingTone({
      startFrequency: 740,
      endFrequency: 988,
      attackGain: 0.08,
      durationSeconds: 0.24,
      type: 'sine',
    });
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de mano levantada:', error);
  }
};

const playParticipantJoinSound = () => {
  try {
    playMeetingTone({
      startFrequency: 520,
      endFrequency: 780,
      attackGain: 0.055,
      durationSeconds: 0.18,
      type: 'triangle',
    });
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de entrada a la sala:', error);
  }
};

interface UseMeetingRealtimeStateParams {
  salaId: string;
  tokenInvitacion?: string;
  tipoReunion: TipoReunion;
  userName: string;
  userAvatar?: string;
  userId: string;
  espacioId: string;
  isExternalGuest: boolean;
  guestPermissions: GuestPermissions;
  showChat: boolean;
  onToggleChat: () => void;
  invitadosExternos: InvitadoExterno[];
}

interface MeetingChatMessage {
  id?: string;
  message?: string;
  timestamp: number;
  from?: {
    identity?: string;
    name?: string;
  };
}

export const useMeetingRealtimeState = ({
  salaId,
  tokenInvitacion,
  tipoReunion,
  userName,
  userAvatar,
  userId,
  espacioId,
  isExternalGuest,
  guestPermissions,
  showChat,
  onToggleChat,
  invitadosExternos,
}: UseMeetingRealtimeStateParams) => {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const chatOptions = useMemo(() => ({ room }), [room]);
  const { chatMessages, send, isSending } = useChat(chatOptions);
  const [remoteRecording, setRemoteRecording] = useState<{ isRecording: boolean; by: string } | null>(null);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; by: string }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [raisedHandParticipantIds, setRaisedHandParticipantIds] = useState<Set<string>>(new Set());
  const [chatNotifications, setChatNotifications] = useState<ToastNotification[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTrigger, setRecordingTrigger] = useState(false);
  const [guestConsentRequest, setGuestConsentRequest] = useState<MeetingConsentRequest | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const processedChatMessageIdsRef = useRef<Set<string>>(new Set());
  const chatMessagesReadyRef = useRef(false);
  const prevRecordingRef = useRef(isRecording);
  const [meetingGroupId, setMeetingGroupId] = useState<string | null>(null);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const [persistedMessages, setPersistedMessages] = useState<MeetingChatMessage[]>([]);
  const [stableSpeakerIdentity, setStableSpeakerIdentity] = useState<string | null>(null);
  const [speakerBubbleParticipant, setSpeakerBubbleParticipant] = useState<{ identity: string; name: string } | null>(null);
  const telemetryRef = useRef(new RealtimeSessionTelemetry({
    enabled: import.meta.env.DEV,
    scope: 'MeetingRealtime',
    sessionKey: `meeting-realtime:${salaId}:${userId || 'anon'}`,
  }));
  const meetingGatewayRef = useRef<LiveKitRoomGateway | null>(null);
  const raiseHandUseCaseRef = useRef(new RaiseHandUseCase());
  const pendingSpeakerIdentityRef = useRef<string | null>(null);
  const speakerHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakerBubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownRemoteParticipantsRef = useRef<Set<string>>(new Set());
  const localJoinSoundPlayedRef = useRef(false);

  if (!meetingGatewayRef.current) {
    meetingGatewayRef.current = new LiveKitRoomGateway();
  }

  useEffect(() => {
    const gateway = meetingGatewayRef.current;
    if (!gateway || !room) {
      return;
    }

    gateway.bindRoom(room);
    return () => {
      gateway.unbindRoom();
    };
  }, [room]);

  useEffect(() => {
    if (!room) {
      knownRemoteParticipantsRef.current = new Set();
      localJoinSoundPlayedRef.current = false;
      return;
    }

    knownRemoteParticipantsRef.current = new Set(room.remoteParticipants.keys());
    localJoinSoundPlayedRef.current = false;

    const handleParticipantConnected = (participant: Participant) => {
      if (knownRemoteParticipantsRef.current.has(participant.identity)) {
        return;
      }

      knownRemoteParticipantsRef.current.add(participant.identity);
      playParticipantJoinSound();
    };

    const handleParticipantDisconnected = (participant: Participant) => {
      knownRemoteParticipantsRef.current.delete(participant.identity);
    };

    const handleRoomConnected = () => {
      if (localJoinSoundPlayedRef.current) {
        return;
      }

      localJoinSoundPlayedRef.current = true;
      playParticipantJoinSound();
    };

    if (room.state === 'connected') {
      handleRoomConnected();
    }

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Connected, handleRoomConnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.Connected, handleRoomConnected);
    };
  }, [room]);

  // --- Chat persistence: get/create grupo_chat for meeting & load history ---
  useEffect(() => {
    if (!salaId || !espacioId || isExternalGuest) return;

    const initMeetingChatGroup = async () => {
      try {
        const groupName = `reunion:${salaId}`;
        let resolvedGroupId: string | null = null;

        // Try to find existing meeting chat group (search by name + espacio)
        const { data: existing, error: findErr } = await supabase
          .from('grupos_chat')
          .select('id')
          .eq('espacio_id', espacioId)
          .eq('nombre', groupName)
          .limit(1)
          .maybeSingle();

        if (findErr) {
          console.warn('⚠️ Error buscando grupo chat reunión:', findErr.message);
        }

        if (existing) {
          resolvedGroupId = existing.id;
        } else {
          // Create a new chat group for this meeting (use tipo 'publico' for RLS compatibility)
          const { data: newGroup, error: createErr } = await supabase
            .from('grupos_chat')
            .insert({
              espacio_id: espacioId,
              nombre: groupName,
              tipo: 'publico',
              icono: '📹',
              creado_por: userId || null,
            })
            .select('id')
            .single();

          if (createErr) {
            console.warn('⚠️ Error creando grupo chat reunión:', createErr.message);
            return;
          }
          resolvedGroupId = newGroup.id;
        }

        if (!resolvedGroupId) return;
        setMeetingGroupId(resolvedGroupId);
        telemetryRef.current.record({
          category: 'meeting_realtime',
          name: 'meeting_chat_group_ready',
          data: {
            salaId,
            groupId: resolvedGroupId,
          },
        });

        // Load historical messages from this meeting group
        const { data: history, error: histErr } = await supabase
          .from('mensajes_chat')
          .select('id, contenido, creado_en, usuario_id, usuario:usuarios!mensajes_chat_usuario_id_fkey(nombre, apellido)')
          .eq('grupo_id', resolvedGroupId)
          .order('creado_en', { ascending: true })
          .limit(200);

        if (histErr) {
          console.warn('⚠️ Error cargando historial chat reunión:', histErr.message);
        }

        if (history && history.length > 0) {
          const mapped: MeetingChatMessage[] = history.map((msg: any) => {
            persistedMessageIdsRef.current.add(msg.id);
            return {
              id: `db-${msg.id}`,
              message: msg.contenido,
              timestamp: new Date(msg.creado_en).getTime(),
              from: {
                identity: msg.usuario_id || 'unknown',
                name: msg.usuario ? [msg.usuario.nombre, msg.usuario.apellido].filter(Boolean).join(' ') || 'Participante' : 'Participante',
              },
            };
          });
          setPersistedMessages(mapped);
        }

        console.log('💬 Meeting chat group ready:', resolvedGroupId, '| historial:', history?.length ?? 0);
      } catch (err) {
        console.warn('⚠️ Error inicializando chat de reunión:', err);
      }
    };

    void initMeetingChatGroup();
  }, [salaId, espacioId, userId, isExternalGuest]);

  // --- Realtime subscription: listen for new messages inserted by other participants ---
  useEffect(() => {
    if (!meetingGroupId || isExternalGuest) return;
    const groupId = meetingGroupId;

    const channel = supabase
      .channel(`meeting-chat-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_chat', filter: `grupo_id=eq.${groupId}` },
        async (payload) => {
          const msg = payload.new as any;
          if (!msg?.id || persistedMessageIdsRef.current.has(msg.id)) return;
          persistedMessageIdsRef.current.add(msg.id);

          // Skip messages sent by current user (already shown via LiveKit)
          if (msg.usuario_id === userId) return;

          // Resolve sender name
          let senderName = 'Participante';
          if (msg.usuario_id) {
            const { data: u } = await supabase
              .from('usuarios')
              .select('nombre, apellido')
              .eq('id', msg.usuario_id)
              .maybeSingle();
            if (u) senderName = [u.nombre, u.apellido].filter(Boolean).join(' ') || 'Participante';
          }

          setPersistedMessages((prev) => [
            ...prev,
            {
              id: `db-${msg.id}`,
              message: msg.contenido,
              timestamp: new Date(msg.creado_en).getTime(),
              from: { identity: msg.usuario_id || 'unknown', name: senderName },
            },
          ]);
          telemetryRef.current.record({
            category: 'meeting_realtime',
            name: 'meeting_chat_message_persisted_remote',
            data: {
              salaId,
              groupId,
              senderId: msg.usuario_id || 'unknown',
            },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingGroupId, userId, isExternalGuest]);

  // Persist a single message to the database
  const persistMessageToDB = useCallback(async (content: string) => {
    if (!meetingGroupId || !userId || isExternalGuest) return;

    try {
      await supabase.from('mensajes_chat').insert({
        grupo_id: meetingGroupId,
        usuario_id: userId,
        contenido: content,
        tipo: 'texto',
      });
    } catch (err) {
      console.warn('⚠️ Error persistiendo mensaje de reunión:', err);
    }
  }, [meetingGroupId, userId, isExternalGuest]);

  // Wrapped send: sends via LiveKit AND persists to DB
  const sendAndPersist = useCallback(async (message: string) => {
    await send(message);
    void persistMessageToDB(message);
    telemetryRef.current.record({
      category: 'meeting_realtime',
      name: 'meeting_chat_message_sent',
      data: {
        salaId,
        length: message.trim().length,
      },
    });
  }, [send, persistMessageToDB]);

  // Merge persisted (historical) messages with live LiveKit messages, sorted by timestamp
  const allChatMessages = useMemo(() => {
    // Build a set of persisted DB message IDs (without the 'db-' prefix) to detect overlap
    const persistedDbIds = new Set(
      persistedMessages.map((pm) => (pm.id?.startsWith('db-') ? pm.id.slice(3) : pm.id)),
    );

    // LiveKit messages that aren't already in persisted set
    const uniqueLive = (chatMessages as MeetingChatMessage[]).filter(
      (lm) => !persistedDbIds.has(lm.id),
    );

    const merged = [...persistedMessages, ...uniqueLive];
    merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return merged;
  }, [persistedMessages, chatMessages]);

  // Persist incoming LiveKit messages from other participants to DB
  useEffect(() => {
    if (!meetingGroupId || isExternalGuest) return;

    const localIdentity = room?.localParticipant?.identity;

    chatMessages.forEach((msg: any) => {
      if (!msg.id || persistedMessageIdsRef.current.has(msg.id)) return;
      persistedMessageIdsRef.current.add(msg.id);

      // Only persist messages from remote participants (our own are persisted on send)
      if (msg.from?.identity && msg.from.identity !== localIdentity) {
        const content = typeof msg.message === 'string' ? msg.message.trim() : '';
        if (content) {
          void (async () => {
            try {
              const senderIdentity = msg.from.identity;
              // Guard: only query participantes_sala with valid UUIDs (guests use non-UUID IDs like "guest_xxx")
              const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(senderIdentity);
              
              let resolvedUserId: string | null = null;
              if (isValidUUID) {
                const { data: remoteUser } = await supabase
                  .from('participantes_sala')
                  .select('usuario_id')
                  .eq('sala_id', salaId)
                  .eq('usuario_id', senderIdentity)
                  .maybeSingle();
                resolvedUserId = remoteUser?.usuario_id || null;
              }

              // Only insert if we have a valid user ID (guests can't write to mensajes_chat)
              if (resolvedUserId) {
                await supabase.from('mensajes_chat').insert({
                  grupo_id: meetingGroupId,
                  usuario_id: resolvedUserId,
                  contenido: content,
                  tipo: 'texto',
                });
              }
            } catch {
              // Silently ignore persistence errors for remote messages
            }
          })();
        }
      }
    });
  }, [chatMessages, room, salaId, meetingGroupId, isExternalGuest]);

  const appendReaction = useCallback((emoji: string, by: string) => {
    const reactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setReactions((prev) => [...prev, { id: reactionId, emoji, by }]);

    setTimeout(() => {
      setReactions((prev) => prev.filter((reaction) => reaction.id !== reactionId));
    }, 3000);
  }, []);

  const handleSendReaction = useCallback(async (emoji: string) => {
    const participantName = room?.localParticipant?.name || userName || 'Participante';
    appendReaction(emoji, participantName);

    const sent = await meetingGatewayRef.current?.sendReaction({
      emoji,
      from: room?.localParticipant?.identity,
      fromName: participantName,
    }) ?? false;

    if (!sent) {
      console.warn('⚠️ No se pudo publicar la reacción porque la sala aún no está conectada');
      return;
    }

    telemetryRef.current.record({
      category: 'meeting_realtime',
      name: 'meeting_reaction_sent',
      data: {
        salaId,
        emoji,
      },
    });
  }, [appendReaction, room, salaId, userName]);

  const isLocalHandRaised = useMemo(() => {
    const participantId = room?.localParticipant?.identity ?? userId;
    return participantId ? raisedHandParticipantIds.has(participantId) : false;
  }, [raisedHandParticipantIds, room?.localParticipant?.identity, userId]);

  const handleToggleRaiseHand = useCallback(async () => {
    const participantId = room?.localParticipant?.identity ?? userId;
    const participantName = room?.localParticipant?.name || userName || 'Participante';
    if (!participantId) {
      return;
    }

    const decision = raiseHandUseCaseRef.current.toggle({
      participantId,
      participantName,
      raisedHandParticipantIds,
    });

    setRaisedHandParticipantIds(decision.raisedHandParticipantIds);

    const sent = await meetingGatewayRef.current?.sendRaiseHand(decision.packet) ?? false;
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
      return;
    }

    telemetryRef.current.record({
      category: 'meeting_realtime',
      name: 'meeting_raise_hand_toggled',
      data: {
        salaId,
        participantId,
        raised: decision.packet.raised,
      },
    });

    if (decision.packet.raised) {
      playRaiseHandSound();
    }
  }, [raisedHandParticipantIds, room?.localParticipant?.identity, room?.localParticipant?.name, salaId, userId, userName]);

  useEffect(() => {
    if (room.state === 'connected' && localParticipant && userAvatar) {
      const updateMetadata = async () => {
        try {
          const currentMeta = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};
          if (currentMeta.avatarUrl !== userAvatar) {
            const newMeta = { ...currentMeta, avatarUrl: userAvatar };
            await localParticipant.setMetadata(JSON.stringify(newMeta));
            console.log('📸 Avatar publicado en metadata:', userAvatar);
          }
        } catch (e) {
          console.error('Error actualizando metadata:', e);
        }
      };

      void updateMetadata();
    }
  }, [room.state, localParticipant, userAvatar]);

  useEffect(() => {
    if (!localParticipant) return;

    const buildStream = () => {
      const tracks: MediaStreamTrack[] = [];
      const cameraPublication = localParticipant.getTrackPublication(Track.Source.Camera);
      if (cameraPublication?.track?.mediaStreamTrack) {
        tracks.push(cameraPublication.track.mediaStreamTrack);
      }

      const micPublication = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPublication?.track?.mediaStreamTrack) {
        tracks.push(micPublication.track.mediaStreamTrack);
      }

      if (tracks.length > 0) {
        setLocalStream(new MediaStream(tracks));
      }
    };

    buildStream();

    const handleTrackChange = () => setTimeout(buildStream, 500);
    room?.on(RoomEvent.LocalTrackPublished, handleTrackChange);
    room?.on(RoomEvent.LocalTrackUnpublished, handleTrackChange);

    return () => {
      room?.off(RoomEvent.LocalTrackPublished, handleTrackChange);
      room?.off(RoomEvent.LocalTrackUnpublished, handleTrackChange);
    };
  }, [localParticipant, room]);

  const canShowChat = !(isExternalGuest && !guestPermissions.allowChat);

  const dismissChatNotification = useCallback((id: string) => {
    setChatNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const openChatNotification = useCallback((_groupId: string) => {
    if (!showChat) {
      onToggleChat();
    }
  }, [onToggleChat, showChat]);

  const enqueueChatNotification = useCallback((messageId: string, senderName: string, messagePreview: string) => {
    setChatNotifications((prev) => {
      const nextNotification: ToastNotification = {
        id: `meeting-chat-${messageId}`,
        userName: senderName,
        userInitial: senderName.charAt(0).toUpperCase(),
        message: messagePreview,
        groupId: salaId,
        timestamp: new Date(),
      };

      return [...prev.filter((notification) => notification.id !== nextNotification.id), nextNotification].slice(-3);
    });
  }, [salaId]);

  useEffect(() => {
    if (showChat && chatNotifications.length > 0) {
      setChatNotifications([]);
    }
  }, [chatNotifications.length, showChat]);

  useEffect(() => {
    if (!chatMessagesReadyRef.current) {
      chatMessages.forEach((message) => {
        if (message.id) {
          processedChatMessageIdsRef.current.add(message.id);
        }
      });
      chatMessagesReadyRef.current = true;
      return;
    }

    if (!canShowChat) {
      return;
    }

    const localIdentity = room?.localParticipant?.identity;

    chatMessages.forEach((message) => {
      if (!message.id || processedChatMessageIdsRef.current.has(message.id)) {
        return;
      }

      processedChatMessageIdsRef.current.add(message.id);

      if (showChat) {
        return;
      }

      if (message.from?.identity && message.from.identity === localIdentity) {
        return;
      }

      const senderName = message.from?.name || message.from?.identity || 'Participante';
      const messagePreview = typeof message.message === 'string' ? message.message.trim() : '';

      if (!messagePreview) {
        return;
      }

      enqueueChatNotification(message.id, senderName, messagePreview);
    });
  }, [canShowChat, chatMessages, enqueueChatNotification, room, showChat]);

  const remoteParticipantsCount = room?.remoteParticipants.size ?? 0;
  const canStartRecording = remoteParticipantsCount > 0;
  const recordingDisabledReason = 'La grabación solo se habilita cuando hay al menos 2 personas en la reunión.';

  const handleToggleRecording = useCallback(() => {
    if (!isRecording && !canStartRecording) {
      return;
    }
    setRecordingTrigger(true);
  }, [canStartRecording, isRecording]);

  const handleRecordingStateChange = useCallback((recording: boolean) => {
    setIsRecording(recording);
    if (!recording) {
      setRecordingDuration(0);
    }
  }, []);

  // Guard: warn user before closing tab/browser if recording is active
  useEffect(() => {
    if (!isRecording) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers require returnValue to be set
      event.returnValue = 'Tienes una grabación activa. Si sales, la grabación se perderá. ¿Deseas continuar?';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRecording]);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const videoTracks = useMemo(
    () => tracks.filter((track) => track.participant && track.source === Track.Source.Camera),
    [tracks],
  );

  const screenShareTrack = useMemo(() => {
    const found = tracks.find((track) => track.source === Track.Source.ScreenShare && track.publication?.track);
    // Fallback: also detect screen share tracks that haven't been subscribed yet but exist
    if (found) return found;
    return tracks.find((track) => track.source === Track.Source.ScreenShare && track.publication) ?? undefined;
  }, [tracks]);

  // Auto-subscribe to screen share track when detected (ensures all participants see it)
  useEffect(() => {
    if (!screenShareTrack?.publication) return;
    const pub = screenShareTrack.publication;
    if ('isSubscribed' in pub && !pub.isSubscribed && 'setSubscribed' in pub) {
      (pub as any).setSubscribed(true);
    }
  }, [screenShareTrack]);

  const validTracks = useMemo(
    () => tracks.filter((track) => track.participant && (track.publication?.track || track.source === Track.Source.Camera)),
    [tracks],
  );

  useEffect(() => {
    if (screenShareTrack && viewMode === 'gallery') {
      setViewMode('sidebar');
    } else if (!screenShareTrack && viewMode === 'sidebar') {
      setViewMode('gallery');
    }
  }, [screenShareTrack, viewMode]);

  const activeSpeakerIdentity = room?.activeSpeakers?.[0]?.identity ?? null;
  const fallbackSpeakerIdentity = stableSpeakerIdentity || videoTracks[0]?.participant?.identity || null;

  const isParticipantMicrophoneEnabled = useCallback((participantIdentity: string | null | undefined) => {
    if (!participantIdentity || !room) {
      return false;
    }

    if (participantIdentity === room.localParticipant.identity) {
      return room.localParticipant.isMicrophoneEnabled;
    }

    return room.getParticipantByIdentity(participantIdentity)?.isMicrophoneEnabled ?? false;
  }, [room]);

  useEffect(() => {
    return () => {
      if (speakerHoldTimeoutRef.current) {
        clearTimeout(speakerHoldTimeoutRef.current);
      }
      if (speakerBubbleTimeoutRef.current) {
        clearTimeout(speakerBubbleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const initialSpeakerIdentity = activeSpeakerIdentity || videoTracks[0]?.participant?.identity || null;
    if (!initialSpeakerIdentity) {
      return;
    }

    setStableSpeakerIdentity((current) => current ?? initialSpeakerIdentity);
  }, [activeSpeakerIdentity, videoTracks]);

  useEffect(() => {
    if (!stableSpeakerIdentity) {
      return;
    }

    if (!activeSpeakerIdentity || activeSpeakerIdentity === stableSpeakerIdentity) {
      pendingSpeakerIdentityRef.current = null;
      if (speakerHoldTimeoutRef.current) {
        clearTimeout(speakerHoldTimeoutRef.current);
        speakerHoldTimeoutRef.current = null;
      }
      if (speakerBubbleTimeoutRef.current) {
        clearTimeout(speakerBubbleTimeoutRef.current);
        speakerBubbleTimeoutRef.current = null;
      }
      setSpeakerBubbleParticipant(null);
      return;
    }

    if (!isParticipantMicrophoneEnabled(activeSpeakerIdentity)) {
      pendingSpeakerIdentityRef.current = null;
      setSpeakerBubbleParticipant(null);
      return;
    }

    if (pendingSpeakerIdentityRef.current === activeSpeakerIdentity) {
      return;
    }

    pendingSpeakerIdentityRef.current = activeSpeakerIdentity;
    const participantName = room?.getParticipantByIdentity(activeSpeakerIdentity)?.name || activeSpeakerIdentity;
    setSpeakerBubbleParticipant({ identity: activeSpeakerIdentity, name: participantName });

    if (speakerHoldTimeoutRef.current) {
      clearTimeout(speakerHoldTimeoutRef.current);
    }
    if (speakerBubbleTimeoutRef.current) {
      clearTimeout(speakerBubbleTimeoutRef.current);
    }

    speakerHoldTimeoutRef.current = setTimeout(() => {
      if (isParticipantMicrophoneEnabled(activeSpeakerIdentity)) {
        setStableSpeakerIdentity(activeSpeakerIdentity);
      }
      setSpeakerBubbleParticipant((current) => current?.identity === activeSpeakerIdentity ? null : current);
      pendingSpeakerIdentityRef.current = null;
      speakerHoldTimeoutRef.current = null;
    }, SPEAKER_HOLD_MS);

    speakerBubbleTimeoutRef.current = setTimeout(() => {
      setSpeakerBubbleParticipant((current) => current?.identity === activeSpeakerIdentity ? null : current);
      speakerBubbleTimeoutRef.current = null;
    }, SHORT_SPEAKER_BUBBLE_MS);
  }, [activeSpeakerIdentity, isParticipantMicrophoneEnabled, room, stableSpeakerIdentity]);

  const speakerIdentity = stableSpeakerIdentity || fallbackSpeakerIdentity;

  const optimizacion = useOptimizacionSalaGrande({
    room,
    tracks: validTracks,
    viewMode,
    screenShareTrack,
    speakerIdentity,
    pinnedParticipantId,
    raisedHandParticipantIds,
  });
  const qualityState: MeetingQualityState = optimizacion.qualityState;

  const handleTogglePinnedParticipant = useCallback(async (participantId: string | null) => {
    const nextPinnedParticipantId = pinnedParticipantId === participantId ? null : participantId;
    setPinnedParticipantId(nextPinnedParticipantId);

    const gateway = meetingGatewayRef.current;
    if (!gateway) return;

    await gateway.sendPinParticipant({
      participantId: nextPinnedParticipantId,
      pinned: Boolean(nextPinnedParticipantId),
      by: room?.localParticipant?.name || userName || 'Participante',
    });
  }, [pinnedParticipantId, room?.localParticipant?.name, userName]);

  const handleMuteRemoteParticipant = useCallback(async (participant: Participant) => {
    if (!room?.name) {
      return;
    }

    const microphonePublication = Array.from(participant.trackPublications.values()).find(
      (publication) => publication.source === Track.Source.Microphone,
    );
    const trackSid = (microphonePublication as { trackSid?: string; sid?: string } | undefined)?.trackSid
      || (microphonePublication as { trackSid?: string; sid?: string } | undefined)?.sid;

    if (!trackSid) {
      return;
    }

    const { error } = await supabase.functions.invoke('livekit-moderate-participant', {
      body: {
        action: 'mute_microphone',
        room_name: room.name,
        participant_identity: participant.identity,
        track_sid: trackSid,
        token_invitacion: tokenInvitacion,
      },
    });

    if (error) {
      console.error('No se pudo silenciar el micrófono remoto:', error);
      return;
    }

    const moderatorName = room.localParticipant?.name || userName || 'Moderador';
    await meetingGatewayRef.current?.sendModerationNotice({
      targetParticipantId: participant.identity,
      action: 'mute_microphone',
      by: moderatorName,
      message: `${moderatorName} silenció tu micrófono.`,
    });

    telemetryRef.current.record({
      category: 'meeting_realtime',
      name: 'meeting_remote_mute_applied',
      data: {
        salaId,
        participantId: participant.identity,
      },
    });
  }, [room, salaId, tokenInvitacion, userName]);

  useEffect(() => {
    telemetryRef.current.record({
      category: 'meeting_quality',
      name: 'meeting_quality_state_changed',
      severity: qualityState.mode === 'low' ? 'warn' : 'info',
      data: {
        salaId,
        mode: qualityState.mode,
        poorConnectionParticipants: qualityState.poorConnectionParticipants,
        reason: qualityState.reason,
        visibleTracks: optimizacion.pistasVisibles.length,
      },
    });
  }, [optimizacion.pistasVisibles.length, qualityState.mode, qualityState.poorConnectionParticipants, qualityState.reason, salaId]);

  useEffect(() => {
    if (!room) return;
    telemetryRef.current.record({
      category: 'meeting_realtime',
      name: 'meeting_room_state_snapshot',
      data: {
        salaId,
        roomState: room.state,
        remoteParticipants: room.remoteParticipants.size,
        activeSpeakers: room.activeSpeakers.length,
      },
    });
  }, [room, room?.state, room?.remoteParticipants.size, room?.activeSpeakers.length, salaId]);

  useEffect(() => {
    if (!room || room.state !== 'connected') return;
    if (!isRecording && !prevRecordingRef.current) return;
    prevRecordingRef.current = isRecording;

    const gateway = meetingGatewayRef.current;
    if (!gateway) return;

    gateway.sendRecordingStatus({
      isRecording,
      by: room.localParticipant?.name || 'Anfitrión',
    }).then((sent) => {
      if (!sent) {
        console.warn('⚠️ No se pudo enviar estado de grabación (room no lista)');
      }
    }).catch(() => {
      console.warn('⚠️ No se pudo enviar estado de grabación (room no lista)');
    });
  }, [isRecording, room]);

  const handleRequestGuestConsent = useCallback((guestName: string, guestEmail: string, grabacionId: string) => {
    if (!room || room.state !== 'connected') return;

    const gateway = meetingGatewayRef.current;
    if (!gateway) return;

    gateway.sendConsentRequest({
      by: room.localParticipant?.name || 'Anfitrión',
      grabacionId,
      guestName,
      guestEmail,
    }).then((sent) => {
      if (!sent) {
        console.warn('⚠️ No se pudo enviar solicitud de consentimiento');
      }
    }).catch(() => {
      console.warn('⚠️ No se pudo enviar solicitud de consentimiento');
    });

    console.log('📨 Solicitud de consentimiento enviada via DataChannel a:', guestName);
  }, [room]);

  const handleGuestConsentResponse = useCallback((accepted: boolean) => {
    if (!room || room.state !== 'connected' || !guestConsentRequest) return;

    const gateway = meetingGatewayRef.current;
    if (!gateway) return;

    gateway.sendConsentResponse({
      accepted,
      grabacionId: guestConsentRequest.grabacionId,
      by: room.localParticipant?.name || 'Invitado',
    }).then((sent) => {
      if (!sent) {
        console.warn('⚠️ No se pudo enviar respuesta de consentimiento');
      }
    }).catch(() => {
      console.warn('⚠️ No se pudo enviar respuesta de consentimiento');
    });

    console.log(accepted ? '✅ Consentimiento aceptado' : '❌ Consentimiento rechazado');
    setGuestConsentRequest(null);
  }, [room, guestConsentRequest]);

  useEffect(() => {
    const gateway = meetingGatewayRef.current;
    if (!gateway) return;

    const eventBus = gateway.getEventBus();

    const offRecording = eventBus.on('recording_status', ({ packet }) => {
      if (packet.payload.isRecording) {
        setRemoteRecording({ isRecording: true, by: packet.payload.by });
      } else {
        setRemoteRecording(null);
      }
      telemetryRef.current.record({
        category: 'meeting_realtime',
        name: 'meeting_recording_status_received',
        data: {
          salaId,
          isRecording: Boolean(packet.payload.isRecording),
          by: packet.payload.by,
        },
      });
    });

    const offReaction = eventBus.on('reaction', ({ packet, participantIdentity }) => {
      const participantName = (participantIdentity && room?.getParticipantByIdentity(participantIdentity)?.name)
        || packet.payload.fromName
        || participantIdentity
        || 'Participante';
      appendReaction(packet.payload.emoji, participantName);
    });

    const offConsentRequest = eventBus.on('consent_request', ({ packet }) => {
      if (!isExternalGuest) return;
      console.log('📋 Solicitud de consentimiento recibida de:', packet.payload.by);
      setGuestConsentRequest({
        by: packet.payload.by,
        grabacionId: packet.payload.grabacionId,
      });
      telemetryRef.current.record({
        category: 'meeting_realtime',
        name: 'meeting_consent_request_received',
        data: {
          salaId,
          by: packet.payload.by,
        },
      });
    });

    const offConsentResponse = eventBus.on('consent_response', ({ packet, participantIdentity }) => {
      if (isExternalGuest) return;
      const participantName = (participantIdentity && room?.getParticipantByIdentity(participantIdentity)?.name)
        || participantIdentity
        || 'Invitado';
      console.log(`📋 Respuesta consentimiento de ${participantName}: ${packet.payload.accepted ? 'ACEPTADO' : 'RECHAZADO'}`);
      if (packet.payload.grabacionId) {
        void supabase
          .from('grabaciones')
          .update({
            consentimiento_evaluado: packet.payload.accepted,
            consentimiento_evaluado_fecha: new Date().toISOString(),
          })
          .eq('id', packet.payload.grabacionId)
          .then(({ error }) => {
            if (error) console.warn('⚠️ Error actualizando consentimiento:', error);
            else console.log('✅ Consentimiento actualizado en BD');
          });
      }
      telemetryRef.current.record({
        category: 'meeting_realtime',
        name: 'meeting_consent_response_received',
        data: {
          salaId,
          accepted: Boolean(packet.payload.accepted),
          by: participantName,
        },
      });
    });

    const offPinParticipant = eventBus.on('pin_participant', ({ packet }) => {
      setPinnedParticipantId(packet.payload.pinned ? packet.payload.participantId : null);
    });

    const offRaiseHand = eventBus.on('raise_hand', ({ packet }) => {
      setRaisedHandParticipantIds((current) => raiseHandUseCaseRef.current.apply({
        participantId: packet.payload.participantId,
        participantName: packet.payload.by,
        raised: packet.payload.raised,
        raisedHandParticipantIds: current,
      }).raisedHandParticipantIds);

      if (packet.payload.raised && packet.payload.participantId !== room?.localParticipant?.identity) {
        playRaiseHandSound();
      }
    });

    const offModerationNotice = eventBus.on('moderation_notice', ({ packet }) => {
      const localParticipantId = room?.localParticipant?.identity ?? userId;
      if (packet.payload.targetParticipantId !== localParticipantId || packet.payload.action !== 'mute_microphone') {
        return;
      }

      const notificationMessage = packet.payload.message || `${packet.payload.by} silenció tu micrófono.`;
      enqueueChatNotification(`moderation-${Date.now()}`, packet.payload.by, notificationMessage);
      sendDesktopNotification('Micrófono silenciado', notificationMessage);
    });

    return () => {
      offRecording();
      offReaction();
      offConsentRequest();
      offConsentResponse();
      offPinParticipant();
      offRaiseHand();
      offModerationNotice();
    };
  }, [appendReaction, enqueueChatNotification, isExternalGuest, room, salaId, userId]);

  const usuariosEnLlamada = room?.remoteParticipants
    ? Array.from(room.remoteParticipants.values()).map((participant) => {
        const externo = invitadosExternos.find(
          (inv) => participant.name?.toLowerCase().includes(inv.nombre.toLowerCase()) || participant.identity.startsWith('guest_'),
        );

        return {
          id: participant.identity,
          nombre: participant.name || participant.identity,
          email: externo?.email,
        };
      })
    : [];

  const preselectedTipoGrabacion = useMemo(() => ({
    equipo: 'equipo' as TipoGrabacionDetallado,
    deal: 'deals' as TipoGrabacionDetallado,
    entrevista: 'rrhh_entrevista' as TipoGrabacionDetallado,
  }[tipoReunion]), [tipoReunion]);

  return {
    room,
    localParticipant,
    chatMessages: allChatMessages,
    send: sendAndPersist,
    isSending,
    remoteRecording,
    reactions,
    viewMode,
    setViewMode,
    effectiveViewMode: optimizacion.effectiveViewMode,
    pinnedParticipantId,
    chatNotifications,
    dismissChatNotification,
    openChatNotification,
    isRecording,
    recordingDuration,
    recordingTrigger,
    setRecordingTrigger,
    guestConsentRequest,
    localStream,
    canStartRecording,
    recordingDisabledReason,
    canShowChat,
    raisedHandParticipantIds,
    isLocalHandRaised,
    handleSendReaction,
    handleToggleRaiseHand,
    handleToggleRecording,
    handleRecordingStateChange,
    setRecordingDuration,
    validTracks: optimizacion.pistasVisibles,
    videoTracks,
    screenShareTrack,
    speakerIdentity: optimizacion.featuredParticipantId ?? speakerIdentity,
    speakerBubbleParticipant,
    optimizacion,
    qualityState,
    handleTogglePinnedParticipant,
    handleMuteRemoteParticipant,
    handleRequestGuestConsent,
    handleGuestConsentResponse,
    usuariosEnLlamada,
    preselectedTipoGrabacion,
  };
};
