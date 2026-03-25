import React, { useRef, useState, useCallback } from 'react';
import { hapticFeedback } from '@/lib/mobileDetect';

interface EmoteOption {
  id: string;
  icon: string;
  label: string;
}

interface EmoteWheelProps {
  /** Callback cuando se selecciona un emote */
  onSelect: (emoteId: string) => void;
  /** Callback para cerrar la rueda */
  onClose: () => void;
  /** Si la rueda está visible */
  visible: boolean;
}

const EMOTE_OPTIONS: EmoteOption[] = [
  { id: 'wave', icon: '👋', label: 'Saludar' },
  { id: 'dance', icon: '💃', label: 'Bailar' },
  { id: 'cheer', icon: '🎉', label: 'Celebrar' },
  { id: 'victory', icon: '✌️', label: 'Victoria' },
  { id: 'jump', icon: '🦘', label: 'Saltar' },
  { id: 'sit', icon: '🪑', label: 'Sentarse' },
];

/**
 * Rueda radial de emotes estilo Fortnite/Roblox.
 * Se abre con long-press o tap en botón emote.
 * En mobile: arrastrar hacia el emote deseado. En desktop: hover + click.
 */
export const EmoteWheel: React.FC<EmoteWheelProps> = ({ onSelect, onClose, visible }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const wheelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);

  const WHEEL_SIZE = 220;
  const ITEM_SIZE = 52;
  const RADIUS = 80;

  const getAngleIndex = useCallback((clientX: number, clientY: number): number | null => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 20) return null; // Dead zone central

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    // Empezar desde arriba (offset -90 grados)
    angle = (angle + 90) % 360;

    const sliceSize = 360 / EMOTE_OPTIONS.length;
    return Math.floor(angle / sliceSize) % EMOTE_OPTIONS.length;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const idx = getAngleIndex(touch.clientX, touch.clientY);
    if (idx !== hoveredIdx) {
      setHoveredIdx(idx);
      if (idx !== null) hapticFeedback('light');
    }
  }, [getAngleIndex, hoveredIdx]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (hoveredIdx !== null) {
      onSelect(EMOTE_OPTIONS[hoveredIdx].id);
      hapticFeedback('medium');
    }
    setHoveredIdx(null);
    onClose();
  }, [hoveredIdx, onSelect, onClose]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const idx = getAngleIndex(e.clientX, e.clientY);
    setHoveredIdx(idx);
  }, [getAngleIndex]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const idx = getAngleIndex(e.clientX, e.clientY);
    if (idx !== null) {
      onSelect(EMOTE_OPTIONS[idx].id);
    }
    onClose();
  }, [getAngleIndex, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[250]"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
    >
      {/* Backdrop sutil */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Rueda */}
      <div
        ref={wheelRef}
        className="absolute"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          bottom: 140,
          right: 20,
          transform: 'translate(0, 0)',
        }}
        onClick={(e) => { e.stopPropagation(); handleClick(e); }}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Fondo circular */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 70%, rgba(15,23,42,0) 100%)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        />

        {/* Opciones en círculo */}
        {EMOTE_OPTIONS.map((emote, idx) => {
          const angle = ((360 / EMOTE_OPTIONS.length) * idx - 90) * (Math.PI / 180);
          const x = Math.cos(angle) * RADIUS + WHEEL_SIZE / 2 - ITEM_SIZE / 2;
          const y = Math.sin(angle) * RADIUS + WHEEL_SIZE / 2 - ITEM_SIZE / 2;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={emote.id}
              className="absolute flex flex-col items-center justify-center rounded-full transition-all duration-100"
              style={{
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                left: x,
                top: y,
                backgroundColor: isHovered ? 'rgba(99, 102, 241, 0.5)' : 'rgba(30, 41, 59, 0.7)',
                border: isHovered ? '2px solid rgba(165, 180, 252, 0.8)' : '1px solid rgba(99, 102, 241, 0.2)',
                transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                boxShadow: isHovered ? '0 0 16px rgba(99, 102, 241, 0.5)' : 'none',
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(emote.id);
                onClose();
              }}
            >
              <span className="text-xl">{emote.icon}</span>
            </div>
          );
        })}

        {/* Label del seleccionado en el centro */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
            {hoveredIdx !== null ? EMOTE_OPTIONS[hoveredIdx].label : 'Emotes'}
          </span>
        </div>
      </div>
    </div>
  );
};
