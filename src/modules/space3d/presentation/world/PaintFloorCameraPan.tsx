/**
 * @module space3d/world/PaintFloorCameraPan
 *
 * Habilita pan de la cámara cenital con WASD / arrows en modo decorar piso.
 *
 * Patrón industria (Sims build mode / Roblox Studio / Figma / Sketchup): en
 * modos de edición top-down, las teclas de movimiento se repurposean a pan
 * de cámara porque el avatar/cursor no se mueve. UX descubrible sin
 * necesidad de tooltips — el usuario prueba WASD por reflejo y funciona.
 *
 * Implementación: window keydown/keyup listeners propios (independientes de
 * `useAvatarControls`) para mantener el hook compacto y enfocado. useFrame
 * aplica delta a `controls.target` y `controls.object.position` cada frame.
 *
 * Clean Architecture: Presentation R3F-side. Reads paint mode flag del
 * store; muta OrbitControls vía `useThree(s => s.controls)` (auto-poblado
 * por `makeDefault` en SceneCamera).
 *
 * Refs:
 *  - https://r3f.docs.pmnd.rs/api/hooks#useframe
 *  - https://r3f.docs.pmnd.rs/api/hooks#usethree (controls)
 *  - https://drei.docs.pmnd.rs/controls/orbit-controls
 */

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';

/** Velocidad de pan en m/s. Calibrada para vista cenital con far ~35m
 *  — se siente responsive sin volar fuera del espacio. */
const PAN_SPEED_MS = 12;

/** Multiplicador con Shift para "fast pan" — UX productividad. */
const FAST_PAN_MULT = 2.5;

/** Codes de teclas que afectan el pan. Usamos `e.code` para ser layout-agnostic
 *  (KeyW funciona en QWERTY, AZERTY, Dvorak, etc.). */
const PAN_KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

export const PaintFloorCameraPan: React.FC = () => {
  const isActive = useStore((s) => s.isPaintingDecorativeFloor);
  const controls = useThree((s) => s.controls) as
    | { target: { x: number; z: number }; object: { position: { x: number; z: number } }; update: () => void }
    | null;

  const keysRef = useRef<Set<string>>(new Set());

  // Listeners SOLO mientras paint mode activo. Preventdefault para evitar
  // scroll de página con arrows / espacio.
  useEffect(() => {
    if (!isActive) return;

    const isTyping = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    };

    const handleDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (!PAN_KEY_CODES.has(e.code)) return;
      keysRef.current.add(e.code);
      e.preventDefault();
    };
    const handleUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);

    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      keysRef.current.clear();
    };
  }, [isActive]);

  // useFrame canónico R3F: mutar, no setState. Se ejecuta cada frame
  // independiente del estado de React.
  useFrame((_, delta) => {
    if (!isActive || !controls) return;
    const keys = keysRef.current;

    let dx = 0;
    let dz = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp'))    dz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown'))  dz += 1;

    if (dx === 0 && dz === 0) return;

    // Normalizar diagonal para evitar bonus de velocidad en 45°.
    if (dx !== 0 && dz !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dz *= inv;
    }

    const speed = PAN_SPEED_MS * delta * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? FAST_PAN_MULT : 1);

    // Mover target y camera en paralelo → mantiene framing constante
    // (camera offset relativo al target no cambia).
    controls.target.x += dx * speed;
    controls.target.z += dz * speed;
    controls.object.position.x += dx * speed;
    controls.object.position.z += dz * speed;
    controls.update();
  });

  return null;
};
