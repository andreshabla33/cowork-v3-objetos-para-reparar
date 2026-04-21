/**
 * @module application/usecases/ColocarObjetoUseCase
 *
 * Clean Architecture — Application layer.
 *
 * Orquesta la política de dominio `PlacementPolicy` para decidir dónde cae
 * un objeto mientras el admin lo arrastra con el pointer. La Presentation
 * llama este use case en cada `onPointerMove` y recibe `{ x, y, z }` ya
 * calculado — no conoce las reglas (esas viven en Domain).
 */

import {
  resolverHitSuperficie,
  resolverPosicionColocacion,
  type ObjetoColocable,
  type Posicion3D,
  type Rayo,
} from '@/src/core/domain/entities/espacio3d/PlacementPolicy';

export interface ColocarObjetoInput {
  /** Rayo del pointer en coordenadas de mundo. */
  readonly rayo: Rayo;
  /** Objetos actualmente persistidos en el espacio (superficies candidatas). */
  readonly objetos: readonly ObjetoColocable[];
  /**
   * Punto donde el rayo intersecta el suelo (plano Y=0). Calculado en la
   * Presentation porque el dominio no importa THREE.Plane. Debe llegar ya
   * ajustado a la grilla si corresponde.
   */
  readonly hitPisoX: number;
  readonly hitPisoZ: number;
  /** Alto del objeto que se está colocando (catálogo). */
  readonly altoAColocar: number;
  /**
   * Id del objeto en colocación, para excluirlo del candidate set y no
   * auto-apilarse. `null` cuando el objeto aún no existe en la DB (creación
   * nueva desde el catálogo).
   */
  readonly idEnColocacion: string | null;
}

export class ColocarObjetoUseCase {
  ejecutar(input: ColocarObjetoInput): Posicion3D {
    const hit = resolverHitSuperficie(input.rayo, input.objetos, input.idEnColocacion);
    return resolverPosicionColocacion({
      hitObjeto: hit,
      hitPisoX: input.hitPisoX,
      hitPisoZ: input.hitPisoZ,
      altoAColocar: input.altoAColocar,
    });
  }
}
