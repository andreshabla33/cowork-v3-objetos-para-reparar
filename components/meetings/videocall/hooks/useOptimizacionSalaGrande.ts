import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { RemoteParticipant, RemoteTrackPublication, Room, Track, VideoQuality } from 'livekit-client';
import { ActiveSpeakerPolicy, GalleryPolicy, PinningPolicy, SubscriptionPolicyService, ViewportFitPolicy } from '@/modules/realtime-room';
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
const GALLERY_TILE_ASPECT_RATIO = 4 / 3;
const GALLERY_GAP_PX = 12;
const GALLERY_HORIZONTAL_PADDING_PX = 40;
const GALLERY_RESERVED_HEIGHT_PX = 180;

const getGalleryMaxColumns = (width: number) => {
  if (width >= 1800) return 5;
  if (width >= 1280) return 4;
  if (width >= 820) return 3;
  if (width >= 520) return 2;
  return 1;
};

const getMinimumGalleryTileWidth = (width: number) => {
  if (width < 520) return 140;
  if (width < 1024) return 180;
  return 220;
};

const calculateGalleryPageSize = (participantCount: number, viewportWidth: number, viewportHeight: number) => {
  if (participantCount <= 1) {
    return 1;
  }

  const availableWidth = Math.max(280, viewportWidth - GALLERY_HORIZONTAL_PADDING_PX);
  const availableHeight = Math.max(220, viewportHeight - GALLERY_RESERVED_HEIGHT_PX);
  const minimumTileWidth = getMinimumGalleryTileWidth(viewportWidth);
  const minimumTileHeight = minimumTileWidth / GALLERY_TILE_ASPECT_RATIO;
  const maxColumns = Math.min(getGalleryMaxColumns(viewportWidth), participantCount);
  let bestSlots = 1;

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const tileWidth = (availableWidth - GALLERY_GAP_PX * (columns - 1)) / columns;
    const tileHeight = tileWidth / GALLERY_TILE_ASPECT_RATIO;

    if (tileWidth < minimumTileWidth || tileHeight < minimumTileHeight) {
      continue;
    }

    const rows = Math.max(1, Math.floor((availableHeight + GALLERY_GAP_PX) / (tileHeight + GALLERY_GAP_PX)));
    bestSlots = Math.max(bestSlots, Math.min(participantCount, rows * columns));
  }

  if (bestSlots === 1 && participantCount > 1) {
    return Math.min(participantCount, viewportWidth < 520 ? 2 : 4);
  }

  return bestSlots;
};

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
  const appliedPublicationQualityRef = useRef<Map<string, VideoQuality>>(new Map());
  const viewportFitPolicyRef = useRef(new ViewportFitPolicy());
  const pinningPolicyRef = useRef(new PinningPolicy());
  const activeSpeakerPolicyRef = useRef(new ActiveSpeakerPolicy());
  const galleryPolicyRef = useRef(new GalleryPolicy());
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
      raisedHandParticipantIds,
    });

    const orderIndex = new Map(orderedIds.map((participantId, index) => [participantId, index]));
    return [...pistasCamara].sort((a, b) => {
      const aIndex = orderIndex.get(a.participant?.identity || '') ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderIndex.get(b.participant?.identity || '') ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }, [featuredParticipantId, pistasCamara, raisedHandParticipantIds, room?.localParticipant?.identity, speakerIdentity]);

  const galleryPageSize = useMemo(
    () => calculateGalleryPageSize(pistasOrdenadas.length, galleryViewport.width, galleryViewport.height),
    [galleryViewport.height, galleryViewport.width, pistasOrdenadas.length],
  );

  const esSalaGrande = pistasOrdenadas.length > UMBRAL_SALA_GRANDE;
  const pageSize = effectiveViewMode === 'gallery' ? galleryPageSize : TAMANIO_PAGINA_STRIP;
  const totalPaginas = useMemo(() => {
    if (effectiveViewMode === 'gallery') {
      return Math.max(1, Math.ceil(pistasOrdenadas.length / galleryPageSize));
    }

    if (effectiveViewMode === 'speaker' && featuredParticipantId) {
      return Math.max(1, Math.ceil(Math.max(0, pistasOrdenadas.length - 1) / TAMANIO_PAGINA_STRIP));
    }

    return Math.max(1, Math.ceil(pistasOrdenadas.length / TAMANIO_PAGINA_STRIP));
  }, [effectiveViewMode, featuredParticipantId, galleryPageSize, pistasOrdenadas.length]);
  const mostrarPaginacion = totalPaginas > 1;

  useEffect(() => {
    setPaginaActual((prev) => Math.min(prev, totalPaginas - 1));
  }, [totalPaginas]);

  useEffect(() => {
    setPaginaActual(0);
  }, [effectiveViewMode, featuredParticipantId, screenShareTrack?.participant?.identity]);

  const pistasVisibles = useMemo(() => {
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
  }, [effectiveViewMode, esSalaGrande, featuredParticipantId, pageSize, paginaActual, pistasOrdenadas]);

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
      qualityMode: qualityState.mode,
    }),
    [effectiveViewMode, featuredParticipantId, participantesVisibles, qualityState.mode, room],
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
    paginaActual,
    totalPaginas,
    totalParticipantesVideo: pistasOrdenadas.length,
    mostrarPaginacion,
    qualityState,
    irPaginaAnterior,
    irPaginaSiguiente,
  };
}
