/**
 * @deprecated CLEAN-ARCH-F1: Proxy de compatibilidad.
 * La lógica canónica vive en:
 *  - src/core/domain/entities/espacio3d/ColisionEntity.ts (funciones puras)
 *  - src/core/application/usecases/DetectarColisionesUseCase.ts (orquestación)
 *
 * Los importadores pueden migrar a:
 *   import { construirTodosLosObstaculos } from '@/src/core/application/usecases/DetectarColisionesUseCase'
 */

export type { ObstaculoColision3D } from '@/src/core/domain/entities/espacio3d';

export {
  colisionaJugadorConObstaculo,
  esPosicionTransitable,
} from '@/src/core/domain/entities/espacio3d';

// ─── Wrapper de compatibilidad para importadores actuales ─────────────────────

import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import type { ObstaculoColision3D } from '@/src/core/domain/entities/espacio3d';
import {
  construirObstaculosDeObjeto,
  construirTodosLosObstaculos,
} from '@/src/core/application/usecases/DetectarColisionesUseCase';

export const crearObstaculosFisicosObjetoPersistente = (
  objeto: EspacioObjeto,
): ObstaculoColision3D[] => construirObstaculosDeObjeto(objeto);

export const crearObstaculosObjetosPersistentes = (
  objetos: EspacioObjeto[],
): ObstaculoColision3D[] => construirTodosLosObstaculos(objetos);
