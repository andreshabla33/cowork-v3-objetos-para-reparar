/**
 * @file PhaserGame.tsx
 *
 * Componente React que monta una `Phaser.Game` dentro de un `<div>` parent
 * y la destruye al desmontar. Sigue el patrón oficial del template:
 *   https://github.com/phaserjs/template-react-ts/blob/main/src/PhaserGame.tsx
 *
 * Reglas:
 *  - StrictMode dispara el effect dos veces en dev → destruir el Game al
 *    cleanup es OBLIGATORIO (evita leak de canvases).
 *  - El ref es estable; el Game NO se remonta si las props no cambian.
 */
import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene';

interface PhaserGameProps {
  /** Llamado cuando la escena terminó de inicializar (post-create). */
  onSceneReady?: (sceneKey: string) => void;
}

export function PhaserGame({ onSceneReady: _onSceneReady }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: '100%',
      height: '100%',
      backgroundColor: '#1b2030',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [OfficeScene],
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
