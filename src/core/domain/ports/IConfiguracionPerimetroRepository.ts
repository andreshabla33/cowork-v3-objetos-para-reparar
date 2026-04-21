/**
 * @module domain/ports/IConfiguracionPerimetroRepository
 *
 * Clean Architecture — Domain port (puro, sin detalles de infraestructura).
 *
 * Contrato que define cómo obtener/actualizar/suscribirse a la configuración
 * del cerramiento perimetral de un espacio 3D. La infraestructura (Supabase)
 * implementa este puerto; la Presentation lo consume vía use cases del
 * Application layer.
 *
 * La configuración se persiste en la tabla dedicada
 * `espacio_configuracion_perimetro` (CHECK constraints + RLS). Ver adapter.
 */

import type { PerimeterPolicy } from '@/src/core/domain/entities/espacio3d/ScenePolicy';

export interface IConfiguracionPerimetroRepository {
  /**
   * Lee la configuración de perímetro del espacio. Si no existe row, retorna
   * `null` — el consumidor debe aplicar `DEFAULT_PERIMETER_POLICY` como fallback.
   */
  obtener(espacioId: string): Promise<PerimeterPolicy | null>;

  /**
   * Persiste la configuración. Solo usuarios con rol admin/super_admin
   * deberían invocarlo (enforcement real vive en RLS de Supabase).
   */
  actualizar(espacioId: string, policy: PerimeterPolicy): Promise<void>;

  /**
   * Suscribe a cambios en tiempo real. El callback se invoca cada vez que
   * otro admin cambia la config (o cuando el mismo usuario recibe eco).
   * Retorna una función de cleanup (unsubscribe).
   */
  subscribe(espacioId: string, onChange: (policy: PerimeterPolicy) => void): () => void;
}
