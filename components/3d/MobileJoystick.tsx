import React, { useRef, useCallback, useState, useEffect } from 'react';
import { hapticFeedback } from '@/lib/mobileDetect';

export interface JoystickInput {
  dx: number; // -1 a 1 (izquierda/derecha)
  dz: number; // -1 a 1 (arriba/abajo)
  magnitude: number; // 0 a 1
  isRunning: boolean; // magnitude > 0.7
  active: boolean;
}

interface MobileJoystickProps {
  /** Ref compartido para leer input desde useFrame del Player */
  inputRef: React.MutableRefObject<JoystickInput>;
  /** Radio del joystick en px */
  size?: number;
  /** Umbral de dead zone (0-1) */
  deadZone?: number;
  /** Umbral para activar run (0-1) */
  runThreshold?: number;
}

const JOYSTICK_DEFAULT: JoystickInput = { dx: 0, dz: 0, magnitude: 0, isRunning: false, active: false };

/**
 * Joystick virtual touch con dead zone, inercia visual, y feedback háptico.
 * Estilo: semi-transparente, esquina inferior izquierda.
 * Solo se renderiza en dispositivos touch.
 */
export const MobileJoystick: React.FC<MobileJoystickProps> = ({
  inputRef,
  size = 120,
  deadZone = 0.15,
  runThreshold = 0.7,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const wasRunningRef = useRef(false);
  const maxDistance = size / 2;

  const resetJoystick = useCallback(() => {
    setKnobPos({ x: 0, y: 0 });
    setIsActive(false);
    touchIdRef.current = null;
    inputRef.current = { ...JOYSTICK_DEFAULT };
    wasRunningRef.current = false;
  }, [inputRef]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (touchIdRef.current !== null) return; // Ya hay un touch activo

    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    setIsActive(true);
    hapticFeedback('light');
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (touchIdRef.current === null) return;

    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (!touch) return;

    const deltaX = touch.clientX - centerRef.current.x;
    const deltaY = touch.clientY - centerRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Clamp al radio máximo
    const clampedDist = Math.min(distance, maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    const clampedX = Math.cos(angle) * clampedDist;
    const clampedY = Math.sin(angle) * clampedDist;

    setKnobPos({ x: clampedX, y: clampedY });

    // Normalizar a -1..1
    const normalizedMag = clampedDist / maxDistance;
    const isInDeadZone = normalizedMag < deadZone;

    if (isInDeadZone) {
      inputRef.current = { dx: 0, dz: 0, magnitude: 0, isRunning: false, active: true };
    } else {
      // Remap: deadZone..1 → 0..1
      const effectiveMag = (normalizedMag - deadZone) / (1 - deadZone);
      const dx = (clampedX / maxDistance);
      const dz = -(clampedY / maxDistance); // Invertir Y: arriba = positivo (forward)

      const isRunning = effectiveMag > runThreshold;
      inputRef.current = { dx, dz, magnitude: effectiveMag, isRunning, active: true };

      // Haptic cuando cruza el umbral de run
      if (isRunning && !wasRunningRef.current) {
        hapticFeedback('medium');
      }
      wasRunningRef.current = isRunning;
    }
  }, [maxDistance, deadZone, runThreshold, inputRef]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
    if (!touch) return;
    resetJoystick();
  }, [resetJoystick]);

  // Cleanup si el componente se desmonta durante touch activo
  useEffect(() => {
    return () => {
      inputRef.current = { ...JOYSTICK_DEFAULT };
    };
  }, [inputRef]);

  const halfSize = size / 2;
  const knobSize = size * 0.4;
  const halfKnob = knobSize / 2;
  const ringOpacity = isActive ? 0.5 : 0.25;
  const knobOpacity = isActive ? 0.7 : 0.35;

  // Indicador visual de run (borde exterior brilla)
  const magnitude = inputRef.current.magnitude;
  const isRunVisual = magnitude > runThreshold;

  return (
    <div
      ref={containerRef}
      className="absolute z-[150] select-none touch-none"
      style={{
        bottom: 100,
        left: 20,
        width: size,
        height: size,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Base del joystick */}
      <div
        className="absolute rounded-full transition-opacity duration-150"
        style={{
          width: size,
          height: size,
          top: 0,
          left: 0,
          border: `2px solid rgba(99, 102, 241, ${ringOpacity})`,
          backgroundColor: `rgba(15, 23, 42, ${ringOpacity * 0.6})`,
          backdropFilter: 'blur(4px)',
          boxShadow: isRunVisual
            ? '0 0 20px rgba(99, 102, 241, 0.4), inset 0 0 15px rgba(99, 102, 241, 0.1)'
            : 'inset 0 0 10px rgba(0,0,0,0.3)',
        }}
      />

      {/* Líneas de cruz (guía visual) */}
      <div className="absolute pointer-events-none" style={{ top: halfSize - 0.5, left: halfSize * 0.3, width: halfSize * 0.4, height: 1, backgroundColor: `rgba(99, 102, 241, ${ringOpacity * 0.5})` }} />
      <div className="absolute pointer-events-none" style={{ top: halfSize - 0.5, left: halfSize * 1.3, width: halfSize * 0.4, height: 1, backgroundColor: `rgba(99, 102, 241, ${ringOpacity * 0.5})` }} />
      <div className="absolute pointer-events-none" style={{ top: halfSize * 0.3, left: halfSize - 0.5, width: 1, height: halfSize * 0.4, backgroundColor: `rgba(99, 102, 241, ${ringOpacity * 0.5})` }} />
      <div className="absolute pointer-events-none" style={{ top: halfSize * 1.3, left: halfSize - 0.5, width: 1, height: halfSize * 0.4, backgroundColor: `rgba(99, 102, 241, ${ringOpacity * 0.5})` }} />

      {/* Knob (botón interno que se mueve) */}
      <div
        className="absolute rounded-full transition-[width,height,box-shadow] duration-75"
        style={{
          width: knobSize,
          height: knobSize,
          left: halfSize - halfKnob + knobPos.x,
          top: halfSize - halfKnob + knobPos.y,
          backgroundColor: isRunVisual
            ? `rgba(129, 140, 248, ${knobOpacity + 0.15})`
            : `rgba(99, 102, 241, ${knobOpacity})`,
          border: '2px solid rgba(165, 180, 252, 0.5)',
          boxShadow: isRunVisual
            ? '0 0 12px rgba(129, 140, 248, 0.6)'
            : '0 2px 8px rgba(0,0,0,0.4)',
        }}
      />

      {/* Label run indicator */}
      {isActive && isRunVisual && (
        <div
          className="absolute text-[9px] font-bold text-indigo-300 uppercase tracking-wider pointer-events-none"
          style={{
            bottom: -16,
            left: '50%',
            transform: 'translateX(-50%)',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          RUN
        </div>
      )}
    </div>
  );
};
