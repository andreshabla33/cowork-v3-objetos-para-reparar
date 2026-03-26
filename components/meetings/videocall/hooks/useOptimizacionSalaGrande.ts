import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { RemoteParticipant, RemoteTrackPublication, Room, Track, VideoQuality } from 'livekit-client';
import { ActiveSpeakerPolicy, GalleryPolicy, GalleryViewportPolicy, PinningPolicy, SubscriptionPolicyService, ViewportFitPolicy } from '@/modules/realtime-room';
import type { ViewMode } from '../ViewModeSelector';
import type { MeetingQualityState } from '../meetingRoom.types';

interface UseOptimizacionSalaGrandeParams {
  room?: Room;
  tracks: TrackReferenceOrPlaceholder[];
  viewMode: ViewMode;
  screenShareTrack?: TrackReferenceOrPlaceholder;
  speakerIdentity?: string;
  pinnedParticipantId?: string | null;
  raisedHandParticipantIds?: Iterable<string>;
}

interface UseOptimizacionSalaGrandeResult {
  effectiveViewMode: ViewMode;
  featuredParticipantId: string | null;
  featuredTrack?: TrackReferenceOrPlaceholder | null;
  esSalaGrande: boolean;
  pistasVisibles: TrackReferenceOrPlaceholder[];
  galleryViewport: { width: number; height: number };
  paginaActual: number;
  totalPaginas: number;
  totalParticipantesVideo: number;
  mostrarPaginacion: boolean;
  qualityState: MeetingQualityState;
  irPaginaAnterior: () => void;
  irPaginaSiguiente: () => void;
}

const UMBRAL_SALA_GRANDE = 12;
const TAMANIO_PAGINA_STRIP = 10;
const DEFAULT_GALLERY_VIEWPORT = { width: 1280, height: 720 };
const RECENT_SPEAKER_TTL_MS = 15_000;
const RECENT_SPEAKER_PRUNE_INTERVAL_MS = 5_000;

const mapMeetingVideoQuality = (quality: 'high' | 'medium' | 'low' | null): VideoQuality | null => {
  if (quality === 'low') return VideoQuality.LOW;
  if (quality === 'medium') return VideoQuality.MEDIUM;
  if (quality === 'high') return VideoQuality.HIGH;
  return null;
};

export function useOptimizacionSalaGrande({
  room,
  tracks,
  viewMode,
  screenShareTrack,
  speakerIdentity,
  pinnedParticipantId,
  raisedHandParticipantIds,
}: UseOptimizacionSalaGrandeParams): UseOptimizacionSalaGrandeResult {
  const [paginaActual, setPaginaActual] = useState(0);
  const [galleryViewport, setGalleryViewport] = useState(DEFAULT_GALLERY_VIEWPORT);
  const [recentSpeakerActivity, setRecentSpeakerActivity] = useState<Map<string, number>>(new Map());
  const appliedPublicationQualityRef = useRef<Map<string, VideoQuality>>(new Map());
  const viewportFitPolicyRef = useRef(new ViewportFitPolicy());
  const pinningPolicyRef = useRef(new PinningPolicy());
  const activeSpeakerPolicyRef = useRef(new ActiveSpeakerPolicy());
  const galleryPolicyRef = useRef(new GalleryPolicy());
  const galleryViewportPolicyRef = useRef(new GalleryViewportPolicy());
  const subscriptionPolicyServiceRef = useRef(new SubscriptionPolicyService({ largeRoomThreshold: UMBRAL_SALA_GRANDE }));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewport = () => {
      setGalleryViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const pistasCamara = useMemo(
    () => tracks.filter((track) => track.participant && track.source === Track.Source.Camera),
    [tracks],
  );
  const activeSpeakerIds = useMemo(
    () => room?.activeSpeakers.map((participant) => participant.identity).filter(Boolean) ?? [],
    [room?.activeSpeakers],
  );

  useEffect(() => {
    const now = Date.now();

    setRecentSpeakerActivity((prev) => {
      const next = new Map(prev);

      activeSpeakerIds.forEach((participantId) => {
        next.set(participantId, now);
      });

      Array.from(next.entries()).forEach(([participantId, lastSpokeAt]) => {
        if (now - lastSpokeAt > RECENT_SPEAKER_TTL_MS) {
          next.delete(participantId);
        }
      });

      return next;
    });
  }, [activeSpeakerIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const pruneExpiredRecentSpeakers = () => {
      const now = Date.now();
      setRecentSpeakerActivity((prev) => {
        const next = new Map(prev);
        Array.from(next.entries()).forEach(([participantId, lastSpokeAt]) => {
          if (now - lastSpokeAt > RECENT_SPEAKER_TTL_MS) {
            next.delete(participantId);
          }
        });
        return next;
      });
    };

    const intervalId = window.setInterval(pruneExpiredRecentSpeakers, RECENT_SPEAKER_PRUNE_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const recentSpeakerIds = useMemo(
    () => Array.from(recentSpeakerActivity.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([participantId]) => participantId),
    [recentSpeakerActivity],
  );

  const resolvedPinnedParticipantId = useMemo(
    () => pinningPolicyRef.current.resolvePinnedParticipantId({
      participantIds: pistasCamara.map((track) => track.participant?.identity).filter(Boolean) as string[],
      currentPinnedParticipantId: pinnedParticipantId ?? null,
    }),
    [pinnedParticipantId, pistasCamara],
  );

  const effectiveViewMode = useMemo<ViewMode>(
    () => viewportFitPolicyRef.current.resolveMode({
      requestedMode: viewMode,
      participantCount: pistasCamara.length,
      hasScreenShare: Boolean(screenShareTrack),
      hasPinnedParticipant: Boolean(resolvedPinnedParticipantId),
    }),
    [pistasCamara.length, resolvedPinnedParticipantId, screenShareTrack, viewMode],
  );

  const featuredParticipantId = useMemo(
    () => activeSpeakerPolicyRef.current.resolveFeaturedParticipantId({
      participantIds: pistasCamara.map((track) => track.participant?.identity).filter(Boolean) as string[],
      activeSpeakerId: speakerIdentity ?? null,
      pinnedParticipantId: resolvedPinnedParticipantId,
      effectiveMode: effectiveViewMode,
    }),
    [effectiveViewMode, pistasCamara, resolvedPinnedParticipantId, speakerIdentity],
  );

  const pistasOrdenadas = useMemo(() => {
    const orderedIds = galleryPolicyRef.current.orderParticipantIds({
      participantIds: pistasCamara.map((track) => track.participant?.identity).filter(Boolean) as string[],
      localParticipantId: room?.localParticipant?.identity ?? null,
      featuredParticipantId,
      activeSpeakerId: speakerIdentity ?? null,
      activeSpeakerIds,
      recentSpeakerIds,
      raisedHandParticipantIds,
    });

    const orderIndex = new Map(orderedIds.map((participantId, index) => [participantId, index]));
    return [...pistasCamara].sort((a, b) => {
      const aIndex = orderIndex.get(a.participant?.identity || '') ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderIndex.get(b.participant?.identity || '') ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [activeSpeakerIds, featuredParticipantId, pistasCamara, raisedHandParticipantIds, recentSpeakerIds, room?.localParticipant?.identity, speakerIdentity]);

  const galleryCapacity = useMemo(
    () => galleryViewportPolicyRef.current.resolveCapacity({
      participantCount: pistasOrdenadas.length,
      viewportWidth: galleryViewport.width,
      viewportHeight: galleryViewport.height,
    }),
    [galleryViewport.height, galleryViewport.width, pistasOrdenadas.length],
  );
  const galleryPageSize = galleryCapacity.effectivePageSize;
  const shouldPaginateGallery = effectiveViewMode === 'gallery' && pistasOrdenadas.length > galleryPageSize;

  const esSalaGrande = pistasOrdenadas.length > UMBRAL_SALA_GRANDE;
  const pageSize = effectiveViewMode === 'gallery' ? galleryPageSize : TAMANIO_PAGINA_STRIP;
  const totalPaginas = useMemo(() => {
    if (effectiveViewMode === 'gallery') {
      return shouldPaginateGallery
        ? Math.max(1, Math.ceil(pistasOrdenadas.length / galleryPageSize))
        : 1;
    }

    if (effectiveViewMode === 'speaker' && featuredParticipantId) {
      return Math.max(1, Math.ceil(Math.max(0, pistasOrdenadas.length - 1) / TAMANIO_PAGINA_STRIP));
    }

    return Math.max(1, Math.ceil(pistasOrdenadas.length / TAMANIO_PAGINA_STRIP));
  }, [effectiveViewMode, featuredParticipantId, galleryPageSize, pistasOrdenadas.length, shouldPaginateGallery]);
  const mostrarPaginacion = totalPaginas > 1;

  useEffect(() => {
    setPaginaActual((prev) => Math.min(prev, totalPaginas - 1));
  }, [totalPaginas]);

  useEffect(() => {
    setPaginaActual(0);
  }, [effectiveViewMode, featuredParticipantId, screenShareTrack?.participant?.identity]);

  const pistasVisibles = useMemo(() => {
    if (effectiveViewMode === 'gallery') {
      if (!shouldPaginateGallery) {
        return pistasOrdenadas;
      }

      const inicio = paginaActual * pageSize;
      return pistasOrdenadas.slice(inicio, inicio + pageSize);
    }

    if (!esSalaGrande) {
      return pistasOrdenadas;
    }

    if (effectiveViewMode === 'speaker' && featuredParticipantId) {
      const speakerTrack = pistasOrdenadas.find((track) => track.participant?.identity === featuredParticipantId);
      const resto = pistasOrdenadas.filter((track) => track.participant?.identity !== featuredParticipantId);
      const inicio = paginaActual * TAMANIO_PAGINA_STRIP;
      const pagina = resto.slice(inicio, inicio + TAMANIO_PAGINA_STRIP);
      return speakerTrack ? [speakerTrack, ...pagina] : pagina;
    }

    const inicio = paginaActual * pageSize;
    return pistasOrdenadas.slice(inicio, inicio + pageSize);
  }, [effectiveViewMode, esSalaGrande, featuredParticipantId, pageSize, paginaActual, pistasOrdenadas, shouldPaginateGallery]);

  const featuredTrack = useMemo(
    () => featuredParticipantId
      ? pistasOrdenadas.find((track) => track.participant?.identity === featuredParticipantId) ?? null
      : null,
    [featuredParticipantId, pistasOrdenadas],
  );

  const participantesVisibles = useMemo(
    () => new Set(pistasVisibles.map((track) => track.participant?.identity).filter(Boolean) as string[]),
    [pistasVisibles],
  );

  const poorConnectionParticipants = useMemo(() => {
    if (!room) return 0;
    return Array.from(room.remoteParticipants.values()).filter((participant) => participant.connectionQuality === 'poor').length;
  }, [room, tracks, pistasVisibles]);

  const qualityState = useMemo<MeetingQualityState>(() => {
    if (poorConnectionParticipants >= 2) {
      return {
        mode: 'low',
        poorConnectionParticipants,
        reason: 'Múltiples participantes con conexión débil',
      };
    }

    if (esSalaGrande || pistasOrdenadas.length > 8) {
      return {
        mode: 'medium',
        poorConnectionParticipants,
        reason: esSalaGrande ? 'Sala grande con muchas cámaras activas' : 'Carga visual elevada en reunión',
      };
    }

    return {
      mode: 'high',
      poorConnectionParticipants,
      reason: null,
    };
  }, [esSalaGrande, pistasOrdenadas.length, poorConnectionParticipants]);

  const meetingPolicySnapshot = useMemo(
    () => subscriptionPolicyServiceRef.current.buildMeetingSnapshot({
      participantIds: room ? Array.from(room.remoteParticipants.keys()) : [],
      visibleParticipantIds: participantesVisibles,
      speakerParticipantId: effectiveViewMode === 'speaker' ? featuredParticipantId ?? null : null,
      recentSpeakerParticipantIds: recentSpeakerIds,
      pageCapacity: pageSize,
      qualityMode: qualityState.mode,
    }),
    [effectiveViewMode, featuredParticipantId, pageSize, participantesVisibles, qualityState.mode, recentSpeakerIds, room],
  );

  useEffect(() => {
    if (!room) return;

    room.remoteParticipants.forEach((participant: RemoteParticipant) => {
      participant.trackPublications.forEach((publication) => {
        if (!(publication instanceof RemoteTrackPublication)) {
          return;
        }

        if (publication.source === Track.Source.Camera) {
          const decision = meetingPolicySnapshot.decisions.get(participant.identity);
          const debeSuscribirse = decision?.shouldSubscribe ?? false;
          if (publication.isSubscribed !== debeSuscribirse) {
            publication.setSubscribed(debeSuscribirse);
            if (!debeSuscribirse) {
              appliedPublicationQualityRef.current.delete(`${participant.identity}:${publication.trackSid}`);
            }
          }

          if (debeSuscribirse && publication.isSubscribed) {
            const desiredQuality = mapMeetingVideoQuality(decision?.preferredVideoQuality ?? null);
            const qualityKey = `${participant.identity}:${publication.trackSid}`;
            const currentAppliedQuality = appliedPublicationQualityRef.current.get(qualityKey);
            if (desiredQuality && currentAppliedQuality !== desiredQuality) {
              publication.setVideoQuality(desiredQuality);
              appliedPublicationQualityRef.current.set(qualityKey, desiredQuality);
            }
          }
          return;
        }

        // Non-camera tracks (ScreenShare, Audio): always subscribe and set high quality for screen share
        if (!publication.isSubscribed) {
          publication.setSubscribed(true);
        }
        if (publication.source === Track.Source.ScreenShare && publication.isSubscribed) {
          publication.setVideoQuality(VideoQuality.HIGH);
        }
      });
    });
  }, [meetingPolicySnapshot, room]);

  const irPaginaAnterior = () => {
    setPaginaActual((prev) => Math.max(0, prev - 1));
  };

  const irPaginaSiguiente = () => {
    setPaginaActual((prev) => Math.min(totalPaginas - 1, prev + 1));
  };

  return {
    effectiveViewMode,
    featuredParticipantId,
    featuredTrack,
    esSalaGrande,
    pistasVisibles,
    galleryViewport,
    paginaActual,
    totalPaginas,
    totalParticipantesVideo: pistasOrdenadas.length,
    mostrarPaginacion,
    qualityState,
    irPaginaAnterior,
    irPaginaSiguiente,
  };
}
