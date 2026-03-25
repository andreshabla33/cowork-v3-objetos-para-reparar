'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { 
  TrackReferenceOrPlaceholder,
  useMaybeTrackRefContext,
  useEnsureTrackRef,
  ParticipantContextIfNeeded,
  TrackRefContextIfNeeded,
  useRoomContext,
} from '@livekit/components-react';
import { Track, Participant, RoomEvent } from 'livekit-client';
import { ParticipantAvatar } from './ParticipantAvatar';
import { MeetingTrackRenderer } from './MeetingTrackRenderer';

interface CustomParticipantTileProps {
  trackRef?: TrackReferenceOrPlaceholder;
  participant?: Participant;
  avatarUrl?: string;
  onParticipantClick?: (participant: Participant) => void;
  onTogglePin?: (participant: Participant) => void | Promise<void>;
  onToggleRemoteMute?: (participant: Participant) => void | Promise<void>;
  isPinned?: boolean;
  isHandRaised?: boolean;
  canModerateAudio?: boolean;
  disableVideo?: boolean;
  className?: string;
  localMirrorVideo?: boolean;
  localVideoProcessed?: boolean;
}

export const CustomParticipantTile: React.FC<CustomParticipantTileProps> = ({
  trackRef,
  participant: participantProp,
  avatarUrl,
  onParticipantClick,
  onTogglePin,
  onToggleRemoteMute,
  isPinned = false,
  isHandRaised = false,
  canModerateAudio = false,
  disableVideo = false,
  className = '',
  localMirrorVideo = true,
  localVideoProcessed = false,
}) => {
  const room = useRoomContext();
  const maybeTrackRef = useMaybeTrackRefContext();
  const trackReference = useEnsureTrackRef(trackRef ?? maybeTrackRef);
  
  const participant = participantProp || trackReference?.participant;
  const [currentMetadata, setCurrentMetadata] = useState<string | undefined>(participant?.metadata);

  // Escuchar cambios en metadata desde la sala
  useEffect(() => {
    if (!participant || !room) return;

    const onMetadataChanged = (metadata: string | undefined, p: Participant | undefined) => {
      // Verificar si el cambio es para este participante
      if (p?.identity === participant.identity) {
        console.log(`🔄 Metadata actualizada para ${p.identity}:`, metadata);
        setCurrentMetadata(metadata);
      }
    };

    // Set initial value
    setCurrentMetadata(participant.metadata);

    // Escuchar evento a nivel de sala (más seguro que evento de participante individual)
    room.on(RoomEvent.ParticipantMetadataChanged, onMetadataChanged);
    return () => {
      room.off(RoomEvent.ParticipantMetadataChanged, onMetadataChanged);
    };
  }, [participant, room]);
  
  // Obtener avatar de metadata si no se pasa como prop
  const metadataAvatar = useMemo(() => {
    if (currentMetadata) {
      try {
        const meta = JSON.parse(currentMetadata);
        return meta.avatarUrl || meta.avatar_url || meta.profilePhoto;
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [currentMetadata]);

  const finalAvatarUrl = avatarUrl || metadataAvatar;
  const localParticipantIdentity = room?.localParticipant?.identity;
  const publicationTrack = trackReference?.publication?.track;
  const isLocalParticipant = !!participant && !!localParticipantIdentity && participant.identity === localParticipantIdentity;
  const isRenderablePublication = trackReference?.publication
    ? ('isSubscribed' in trackReference.publication ? trackReference.publication.isSubscribed !== false : true)
    : false;
  const hasCameraPublication = trackReference?.source === Track.Source.Camera && Boolean(trackReference?.publication);
  const hasVideoTrack = !!publicationTrack && publicationTrack.kind === Track.Kind.Video && isRenderablePublication;
  const isVideoEnabled = hasVideoTrack && publicationTrack?.isMuted === false;
  const isVideoPending = Boolean(
    !disableVideo
    && hasCameraPublication
    && participant?.isCameraEnabled
    && !isVideoEnabled,
  );
  const isAudioEnabled = participant?.isMicrophoneEnabled;
  const isSpeaking = participant?.isSpeaking;
  
  const participantName = participant?.name || participant?.identity || 'Participante';
  const canMuteRemotely = Boolean(canModerateAudio && participant && !isLocalParticipant && isAudioEnabled);
  const showHoverActions = Boolean(participant && (onTogglePin || canMuteRemotely));

  const handleClick = () => {
    if (participant && onParticipantClick) {
      onParticipantClick(participant);
    }
  };

  const handleTogglePin = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (participant && onTogglePin) {
      void onTogglePin(participant);
    }
  };

  const handleToggleRemoteMute = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (participant && onToggleRemoteMute) {
      void onToggleRemoteMute(participant);
    }
  };

  return (
    <ParticipantContextIfNeeded participant={participant}>
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <div
          className={`
            group relative h-full w-full bg-zinc-900 overflow-hidden
            ${onParticipantClick ? 'cursor-pointer' : ''}
            ${className}
          `}
          onClick={handleClick}
        >
          {/* Video o Avatar */}
          {isVideoEnabled && !disableVideo && publicationTrack ? (
            <MeetingTrackRenderer
              track={publicationTrack}
              muted={isLocalParticipant}
              className="w-full h-full object-cover bg-transparent"
              mirror={isLocalParticipant && localMirrorVideo && !localVideoProcessed}
              dataLocalParticipant={isLocalParticipant}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
              <ParticipantAvatar
                name={participantName}
                avatarUrl={finalAvatarUrl || undefined}
                size="lg"
                isSpeaking={isSpeaking}
              />
            </div>
          )}

          <div
            className={`pointer-events-none absolute inset-0 border-2 transition-colors duration-200 ${isPinned ? 'border-amber-400/90' : isSpeaking ? 'border-green-500/90' : 'border-transparent'}`}
          />

          {isPinned && (
            <div className="absolute left-2 top-2 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg">
              Fijado
            </div>
          )}

          {isHandRaised && (
            <div className="absolute right-2 top-2 rounded-full bg-sky-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg">
              ✋
            </div>
          )}

          {showHoverActions && (
            <div className="absolute right-2 top-2 z-20 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {onTogglePin && (
                <button
                  type="button"
                  onClick={handleTogglePin}
                  className={`pointer-events-auto flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold shadow-lg backdrop-blur-md transition-colors ${
                    isPinned
                      ? 'border-amber-300/40 bg-amber-500/90 text-white'
                      : 'border-white/15 bg-black/55 text-white/90 hover:bg-black/72'
                  }`}
                  title={isPinned ? 'Quitar fijado' : 'Fijar cámara'}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7V4a1 1 0 00-1-1H9a1 1 0 00-1 1v3H6a1 1 0 00-.707 1.707l4 4V20l2-1v-6.293l4-4A1 1 0 0018 7h-2z" />
                  </svg>
                  <span>{isPinned ? 'Fijada' : 'Fijar'}</span>
                </button>
              )}

              {canMuteRemotely && (
                <button
                  type="button"
                  onClick={handleToggleRemoteMute}
                  className="pointer-events-auto flex h-8 items-center gap-1 rounded-full border border-red-400/30 bg-red-500/82 px-2.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md transition-colors hover:bg-red-600"
                  title="Silenciar micrófono"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  </svg>
                  <span>Silenciar</span>
                </button>
              )}
            </div>
          )}

          {/* Overlay con nombre y estados */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/48 to-transparent p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-black/62 px-2.5 py-1.5 shadow-lg backdrop-blur-md">
                <div className={`
                  h-6 w-6 shrink-0 rounded-full flex items-center justify-center
                  ${isAudioEnabled ? 'bg-white/20' : 'bg-red-500/80'}
                `}>
                  {isAudioEnabled ? (
                    isSpeaking ? (
                      <svg className="w-3.5 h-3.5 text-green-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    )
                  ) : (
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                    </svg>
                  )}
                </div>

                <span className="truncate text-[13px] font-semibold leading-none tracking-[0.01em] text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.55)] max-w-[170px]">
                  {participantName}
                </span>
              </div>

              {isVideoPending ? (
                <div className="flex h-8 shrink-0 items-center gap-1 rounded-xl border border-sky-400/20 bg-black/55 px-2 backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-100">Cargando video</span>
                </div>
              ) : !isVideoEnabled && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/55 backdrop-blur-md">
                  <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Indicador de conexión pobre (opcional) */}
          {participant?.connectionQuality === 'poor' && (
            <div className="absolute top-2 right-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center" title="Conexión débil">
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
                </svg>
              </div>
            </div>
          )}

        </div>
      </TrackRefContextIfNeeded>
    </ParticipantContextIfNeeded>
  );
};

export default CustomParticipantTile;
