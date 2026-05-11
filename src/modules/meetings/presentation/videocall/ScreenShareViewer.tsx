'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ScreenShareViewerProps {
  children: React.ReactNode;
  isActive: boolean;
  sharerName?: string;
  onClose?: () => void;
}

export const ScreenShareViewer: React.FC<ScreenShareViewerProps> = ({
  children,
  isActive,
  sharerName,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const MIN_SCALE = 1;
  const MAX_SCALE = 3;
  const ZOOM_STEP = 0.25;

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + ZOOM_STEP, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.max(prev - ZOOM_STEP, MIN_SCALE);
      if (newScale === MIN_SCALE) {
        setPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleFit = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    if (document.fullscreenElement === element) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    await element.requestFullscreen();
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale((prev) => {
        const newScale = Math.max(MIN_SCALE, Math.min(prev + delta, MAX_SCALE));
        if (newScale === MIN_SCALE) {
          setPosition({ x: 0, y: 0 });
        }
        return newScale;
      });
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale > 1 && e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      const maxOffset = (scale - 1) * 200;
      setPosition({
        x: Math.max(-maxOffset, Math.min(maxOffset, newX)),
        y: Math.max(-maxOffset, Math.min(maxOffset, newY)),
      });
    }
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2);
    }
  }, [scale, handleReset]);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!isActive) return null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black/95 rounded-xl overflow-hidden">
      {/* Header con info del que comparte */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-white text-sm font-medium">
              {sharerName ? `${sharerName} está compartiendo` : 'Pantalla compartida'}
            </span>
          </div>
          
          {/* Controles de zoom */}
          <div className="flex items-center gap-1 bg-[#0B2240]/35 backdrop-blur-sm rounded-lg p-1">
            <button
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-[rgba(46,150,245,0.14)] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Alejar (Ctrl + Scroll)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            
            <span className="text-white text-xs font-mono px-2 min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            
            <button
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-[rgba(46,150,245,0.14)] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Acercar (Ctrl + Scroll)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            
            <div className="w-px h-5 bg-white/20 mx-1" />
            
            <button
              onClick={handleFit}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-[rgba(46,150,245,0.14)] rounded-lg transition-colors"
              title="Ajustar a pantalla"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            
            <button
              onClick={handleReset}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-[rgba(46,150,245,0.14)] rounded-lg transition-colors"
              title="Restablecer vista"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <button
              onClick={() => {
                void toggleFullscreen();
              }}
              className="w-8 h-8 flex items-center justify-center text-white hover:bg-[rgba(46,150,245,0.14)] rounded-lg transition-colors"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9H4V4m11 5h5V4m-5 11h5v5m-11-5H4v5" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Contenedor con zoom/pan */}
      <div
        className={`w-full h-full flex items-center justify-center ${
          scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className="transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
          }}
        >
          {children}
        </div>
      </div>

      {/* Indicador de zoom activo */}
      {scale > 1 && (
        <div className="absolute bottom-4 left-4 z-20">
          <div className="bg-[#0B2240]/35 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
            Arrastra para mover • Doble clic para restablecer
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenShareViewer;
