'use client';

import React from 'react';
import { TrackReferenceOrPlaceholder } from '@livekit/components-react';
import type { MeetingLayoutModel } from '@/modules/realtime-room';
import { ScreenShareViewer } from './ScreenShareViewer';
import { VideoPagination } from './VideoPagination';

interface VideoLayoutManagerProps {
  layoutModel: MeetingLayoutModel<TrackReferenceOrPlaceholder>;
  renderParticipant: (track: TrackReferenceOrPlaceholder, index: number) => React.ReactNode;
  renderScreenShare?: (track: TrackReferenceOrPlaceholder) => React.ReactNode;
  optimizacion?: {
    paginaActual: number;
    totalPaginas: number;
    irPaginaAnterior: () => void;
    irPaginaSiguiente: () => void;
    mostrarPaginacion: boolean;
  };
}

export const VideoLayoutManager: React.FC<VideoLayoutManagerProps> = ({
  layoutModel,
  renderParticipant,
  renderScreenShare,
  optimizacion,
}) => {
  if (layoutModel.template === 'sidebar' && layoutModel.screenShareTrack) {
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2 pb-28 md:flex-row md:pb-2">
        {/* Pantalla compartida - área principal */}
        <div className="min-h-0 flex-1 min-w-0">
          <ScreenShareViewer
            isActive={true}
            sharerName={layoutModel.screenShareTrack.participant?.name || layoutModel.screenShareTrack.participant?.identity}
          >
            {renderScreenShare?.(layoutModel.screenShareTrack)}
          </ScreenShareViewer>
        </div>
        
        {/* Strip lateral de participantes */}
        <div className="flex shrink-0 flex-col gap-2 md:w-56 lg:w-64">
          <div className="flex h-24 snap-x snap-mandatory gap-2 overflow-x-auto pb-1 pr-1 md:h-auto md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pr-0">
            {layoutModel.stripTracks.map((track, index) => (
              <div
                key={`${track.participant?.identity ?? 'unknown'}-${track.source ?? index}`}
                className="h-full aspect-[4/3] snap-start rounded-xl overflow-hidden bg-zinc-900 shrink-0 md:min-h-[8rem] md:h-auto"
              >
                {renderParticipant(track, index)}
              </div>
            ))}
          </div>
          
          {optimizacion?.mostrarPaginacion && (
            <div className="shrink-0 pt-2 border-t border-white/10 flex justify-center">
              <VideoPagination
                paginaActual={optimizacion.paginaActual}
                totalPaginas={optimizacion.totalPaginas}
                onAnterior={optimizacion.irPaginaAnterior}
                onSiguiente={optimizacion.irPaginaSiguiente}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (layoutModel.template === 'screen-share-top' && layoutModel.screenShareTrack) {
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2 pb-28 md:pb-2">
        {/* Pantalla compartida - área principal */}
        <div className="min-h-0 flex-1">
          <ScreenShareViewer
            isActive={true}
            sharerName={layoutModel.screenShareTrack.participant?.name || layoutModel.screenShareTrack.participant?.identity}
          >
            {renderScreenShare?.(layoutModel.screenShareTrack)}
          </ScreenShareViewer>
        </div>
        
        {/* Strip inferior de participantes */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex h-24 snap-x snap-mandatory gap-2 overflow-x-auto pb-2 pr-1 md:h-32 md:pr-0">
            {layoutModel.stripTracks.map((track, index) => (
              <div
                key={`${track.participant?.identity ?? 'unknown'}-${track.source ?? index}`}
                className="aspect-[4/3] h-full snap-start rounded-xl overflow-hidden bg-zinc-900 shrink-0"
              >
                {renderParticipant(track, index)}
              </div>
            ))}
          </div>
          
          {optimizacion?.mostrarPaginacion && (
            <div className="flex justify-center shrink-0">
              <VideoPagination
                paginaActual={optimizacion.paginaActual}
                totalPaginas={optimizacion.totalPaginas}
                onAnterior={optimizacion.irPaginaAnterior}
                onSiguiente={optimizacion.irPaginaSiguiente}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (layoutModel.template === 'speaker' && layoutModel.featuredTrack) {
    return (
      <div className="h-full w-full overflow-y-auto overscroll-contain p-2 pb-[calc(7rem+env(safe-area-inset-bottom))] md:overflow-hidden md:pb-2">
        <div className="flex min-h-full w-full flex-col gap-2 md:h-full">
          {/* Speaker principal */}
          <div className="shrink-0 md:flex-1 md:min-h-0 flex items-center justify-center">
            <div className="w-full max-h-[48svh] aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 md:h-full md:w-auto md:max-h-none md:max-w-full md:aspect-[5/4]">
              {renderParticipant(layoutModel.featuredTrack, 0)}
            </div>
          </div>

          {/* Otros participantes */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:h-24 md:justify-center md:overflow-x-auto lg:h-32">
            {layoutModel.stripTracks.map((track, index) => (
              <div
                key={`${track.participant?.identity ?? 'unknown'}-${track.source ?? index}`}
                className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 md:h-full md:w-auto md:shrink-0"
              >
                {renderParticipant(track, index + 1)}
              </div>
            ))}
          </div>
          
          {optimizacion?.mostrarPaginacion && (
            <div className="flex justify-center pb-2 md:pb-0">
              <VideoPagination
                paginaActual={optimizacion.paginaActual}
                totalPaginas={optimizacion.totalPaginas}
                onAnterior={optimizacion.irPaginaAnterior}
                onSiguiente={optimizacion.irPaginaSiguiente}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={layoutModel.gallery?.viewportClassName ?? 'relative h-full w-full overflow-hidden p-2 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-3 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-3 md:pb-3'}>
      <div className={`grid h-full min-h-full w-full ${layoutModel.gallery?.gridClassName ?? 'grid-cols-1 grid-rows-1 place-content-center place-items-center'} auto-rows-[minmax(0,1fr)] gap-2 sm:gap-3`}>
        {layoutModel.galleryTracks.map((track, index) => (
          <div
            key={`${track.participant?.identity ?? 'unknown'}-${track.source ?? index}`}
            className={layoutModel.gallery?.getTileClassName(index) ?? 'rounded-2xl overflow-hidden bg-zinc-900 min-h-0 h-full w-full'}
          >
            {renderParticipant(track, index)}
          </div>
        ))}
      </div>

      {optimizacion?.mostrarPaginacion && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-5">
          <VideoPagination
            paginaActual={optimizacion.paginaActual}
            totalPaginas={optimizacion.totalPaginas}
            onAnterior={optimizacion.irPaginaAnterior}
            onSiguiente={optimizacion.irPaginaSiguiente}
          />
        </div>
      )}
    </div>
  );
};

export default VideoLayoutManager;
