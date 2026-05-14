/**
 * @file App.tsx — Root del POC cowork-2d.
 *
 * Layout: HUD overlay HTML (chat, controles) + canvas Phaser fullscreen.
 * Demuestra el patrón que reemplazaría VirtualSpace3D.tsx en la app real.
 */
import { useEffect, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import { EventBus } from './EventBus';
import { FloorType, FLOOR_TYPE_COLORS, distancia2D } from '@cowork/core-shared';

export function App() {
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
  const [tipoSuelo, setTipoSuelo] = useState<FloorType>(FloorType.CONCRETE_SMOOTH);

  useEffect(() => {
    const handler = (pos: { x: number; y: number }) => setPlayerPos(pos);
    EventBus.on('player-position', handler);
    return () => { EventBus.off('player-position', handler); };
  }, []);

  // Demo del paquete shared: calcular distancia al origen
  const distanciaAlOrigen = distancia2D(playerPos, { x: 0, y: 0 });

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />

      {/* HUD top-left — info del player + paquete shared funcionando */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        padding: '12px 16px',
        background: 'rgba(11, 13, 18, 0.85)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        fontSize: 12,
        pointerEvents: 'none',
        color: '#e6e9ef',
        minWidth: 220,
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: 4, color: '#a5b4fc' }}>Cowork 2D POC</div>
        <div>Posición: ({playerPos.x.toFixed(1)}, {playerPos.y.toFixed(1)})</div>
        <div>Distancia origen: {distanciaAlOrigen.toFixed(1)}px</div>
        <div style={{ marginTop: 8, fontSize: 10, opacity: 0.7 }}>
          ⌨ WASD / flechas para moverte
        </div>
      </div>

      {/* HUD bottom — selector de FloorType reutilizando @cowork/core-shared */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 14px',
        background: 'rgba(11, 13, 18, 0.85)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        pointerEvents: 'auto',
      }}>
        <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>FloorType:</span>
        {Object.values(FloorType).map((tipo) => (
          <button
            key={tipo}
            onClick={() => setTipoSuelo(tipo)}
            title={tipo}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: tipoSuelo === tipo ? '2px solid #a5b4fc' : '1px solid rgba(255,255,255,0.1)',
              background: FLOOR_TYPE_COLORS[tipo],
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
