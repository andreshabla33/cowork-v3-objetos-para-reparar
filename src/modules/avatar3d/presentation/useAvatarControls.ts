/**
 * useAvatarControls — PR-1: Input Lag Fix
 * =========================================
 * ANTES: useState para isMoving, direction, animationState
 *        → cada keydown/keyup dispara un React re-render
 *        → updateMovement() llamado desde useFrame causa setState en el render loop
 *        → React reconcilia toda la escena 3D en cada frame con tecla presionada
 *
 * AHORA: Todos los valores de teclas y estado de movimiento son puros useRef
 *        → Zero re-renders durante el movimiento
 *        → Solo setAnimationState/setDirection cuando cambia el estado de animación visual
 *          (que es poco frecuente: idle→walk, walk→idle, etc.)
 *        → La lógica de movimiento vive exclusivamente en useFrame a través de los refs
 *
 * Patrón: "Ref-first for high-frequency, State only for visual transitions"
 * Esto es lo que hace react-three/rapier internamente para sus colliders.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AnimationState } from './shared';

export interface AvatarControlsState {
  /** Stable ref — read in useFrame without triggering re-renders */
  keysPressed: React.MutableRefObject<Set<string>>;
  /** Stable ref — read in useFrame for running speed */
  isRunningRef: React.MutableRefObject<boolean>;
  /** Stable ref — current movement direction string */
  directionRef: React.MutableRefObject<string>;
  /** Stable ref — whether avatar is moving this frame */
  isMovingRef: React.MutableRefObject<boolean>;
  /** Stable ref — current animation state */
  animationStateRef: React.MutableRefObject<AnimationState>;
  /** React state — triggers GLTFAvatar animation change (only on actual state change) */
  animationState: AnimationState;
  /** React state — triggers avatar visual direction change (only on actual change) */
  direction: string;
  /** React state — needed by parent for conditional rendering (sitting etc.) */
  isRunning: boolean;
  /**
   * Call from useFrame to update movement state imperatively.
   * Does NOT call setState unless the animation state actually changes.
   */
  updateMovement: (dx: number, dz: number) => void;
  /** Imperatively set animation (e.g., from sit/stand logic) */
  setAnimationState: React.Dispatch<React.SetStateAction<AnimationState>>;
  /** Imperatively set direction (e.g., from sit facing) */
  setDirection: React.Dispatch<React.SetStateAction<string>>;
}

export const useAvatarControls = (): AvatarControlsState => {
  // ─── React state — only for rendering (animation, direction) ──────────────
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [direction, setDirection] = useState<string>('front');
  const [isRunning, setIsRunning] = useState(false);

  // ─── Refs — for useFrame (zero React re-renders) ──────────────────────────
  const keysPressed = useRef<Set<string>>(new Set());
  const isRunningRef = useRef(false);
  const directionRef = useRef('front');
  const isMovingRef = useRef(false);
  const animationStateRef = useRef<AnimationState>('idle');

  // Keep state refs in sync with React state after a state change
  // (only triggered when animationState/direction actually changes)
  useEffect(() => {
    animationStateRef.current = animationState;
  }, [animationState]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  // ─── Key listeners — pure ref mutations, no setState on keydown/keyup ──────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isTyping) return;

      keysPressed.current.add(e.code);

      // Running — only this one needs setState (affects speed in display, not framerate)
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isRunningRef.current = true;
        setIsRunning(true);
      }

      // Emote keystrokes — visual state change, once per interaction
      if (e.code === 'KeyE') {
        animationStateRef.current = 'cheer';
        setAnimationState('cheer');
      }
      if (e.code === 'KeyQ') {
        animationStateRef.current = 'dance';
        setAnimationState('dance');
      }

      // Prevent page scroll on arrow keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isRunningRef.current = false;
        setIsRunning(false);
      }

      // Emotes reset — only on key release, not per-frame
      if (['KeyE', 'KeyQ'].includes(e.code)) {
        animationStateRef.current = 'idle';
        setAnimationState('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  /**
   * updateMovement — called from useFrame every frame.
   * 
   * CRITICAL: This function must NEVER call setState unless the animation
   * state actually changes (e.g., idle→walk). Otherwise, every frame with
   * keys pressed causes a React re-render of the entire 3D scene.
   * 
   * Pattern: Compare ref value first, only call setState on transition.
   */
  const updateMovement = useCallback((dx: number, dz: number) => {
    const moving = dx !== 0 || dz !== 0;

    // Update moving ref immediately (no React render needed for this)
    isMovingRef.current = moving;

    if (moving) {
      // Compute new direction
      let newDirection: string;
      if (Math.abs(dx) > Math.abs(dz)) {
        newDirection = dx > 0 ? 'right' : 'left';
      } else {
        newDirection = dz > 0 ? 'up' : 'front';
      }

      // Only call setState if the direction actually changed
      if (directionRef.current !== newDirection) {
        directionRef.current = newDirection;
        setDirection(newDirection); // ← React render, but only on direction change (not every frame)
      }

      // Only switch animation if needed (idle→walk or walk→run, not every frame)
      const nextAnim: AnimationState = isRunningRef.current ? 'run' : 'walk';
      if (animationStateRef.current !== nextAnim) {
        animationStateRef.current = nextAnim;
        setAnimationState(nextAnim);
      }
    } else {
      // Stopping — only trigger idle if we were walking/running
      if (animationStateRef.current === 'walk' || animationStateRef.current === 'run') {
        animationStateRef.current = 'idle';
        setAnimationState('idle');
      }
    }
  }, []);

  return {
    keysPressed,
    isRunningRef,
    directionRef,
    isMovingRef,
    animationStateRef,
    animationState,
    direction,
    isRunning,
    updateMovement,
    setAnimationState,
    setDirection,
  };
};
