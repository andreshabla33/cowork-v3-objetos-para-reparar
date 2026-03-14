import { useEffect, useRef, useState } from 'react';
import type { AnimationState } from './shared';

export const useAvatarControls = () => {
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [direction, setDirection] = useState<string>('front');
  const [isMoving, setIsMoving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const keysPressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
      if (isTyping) return;

      keysPressed.current.add(e.code);

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIsRunning(true);
      }

      if (e.code === 'KeyE') setAnimationState('cheer');
      if (e.code === 'KeyQ') setAnimationState('dance');

      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.code);

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setIsRunning(false);
      }

      if (['KeyE', 'KeyQ'].includes(e.code)) {
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

  const updateMovement = (dx: number, dy: number) => {
    const moving = dx !== 0 || dy !== 0;
    setIsMoving(moving);

    if (moving) {
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? 'right' : 'left');
      } else {
        setDirection(dy > 0 ? 'up' : 'front');
      }
      setAnimationState(isRunning ? 'run' : 'walk');
    } else if (animationState === 'walk' || animationState === 'run') {
      setAnimationState('idle');
    }
  };

  return {
    animationState,
    setAnimationState,
    direction,
    setDirection,
    isMoving,
    isRunning,
    keysPressed,
    updateMovement,
  };
};
