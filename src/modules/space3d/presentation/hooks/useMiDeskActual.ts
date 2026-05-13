/**
 * @module space3d/hooks/useMiDeskActual
 *
 * Devuelve el `AreaEscritorio` dentro del cual está parado el avatar local
 * actualmente. Sample a 5Hz (cada 200ms) para evitar work per-frame: la
 * resolución temporal del candado no necesita ser per-frame, solo
 * lo-suficiente-snappy para que el toggle refleje cambios al cruzar bordes.
 *
 * Devuelve `null` si el avatar está afuera de cualquier desk.
 *
 * Performance: O(N) per sample (N = total desks); para N=100 → ~0.1ms.
 * Mucho más barato que un useFrame.
 */

import { useEffect, useState } from 'react';
import {
  puntoEnAreaEscritorio,
  type AreaEscritorio,
} from '@/src/core/domain/entities/espacio3d/AreaEscritorio';
import { useComposedStore as useStore } from '@/modules/_state/composedStore';

const SAMPLE_INTERVAL_MS = 200;

export function useMiDeskActual(areas: AreaEscritorio[]): AreaEscritorio | null {
  const currentUser = useStore((s) => s.currentUser);
  const [miDesk, setMiDesk] = useState<AreaEscritorio | null>(null);

  useEffect(() => {
    // `currentUser.x/y` viene en escala DB (×16). Las áreas tienen bbox en
    // world meters. Convertir antes del test.
    const tick = () => {
      const px = (currentUser?.x ?? 0) / 16;
      const pz = (currentUser?.y ?? 0) / 16;
      if (!Number.isFinite(px) || !Number.isFinite(pz)) {
        setMiDesk(null);
        return;
      }
      const adentro = areas.find((a) => puntoEnAreaEscritorio({ x: px, z: pz }, a)) ?? null;
      // Set solo si cambia para evitar re-renders innecesarios.
      setMiDesk((prev) => {
        if (prev?.id === adentro?.id) return prev;
        return adentro;
      });
    };
    tick();
    const interval = setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [areas, currentUser?.x, currentUser?.y]);

  return miDesk;
}
