/**
 * @module application/usecases/ConfiguracionPerimetroUseCases
 *
 * Clean Architecture — Application layer.
 *
 * Use cases que orquestan la lectura/escritura/subscripción de la config
 * de perímetro. Envuelven al repositorio con el fallback al `DEFAULT_SCENE_POLICY.perimeter`
 * para que los consumidores (Presentation) no tengan que manejar `null`.
 *
 * Clean Architecture: la Presentation depende SOLO de estos use cases + tipos
 * de Domain. Nunca importa el adapter de Supabase directamente.
 */

import {
  DEFAULT_SCENE_POLICY,
  type PerimeterPolicy,
} from '@/src/core/domain/entities/espacio3d/ScenePolicy';
import type { IConfiguracionPerimetroRepository } from '@/src/core/domain/ports/IConfiguracionPerimetroRepository';

/** Default que aplica cuando el espacio no tiene config persistida todavía. */
const FALLBACK_POLICY: PerimeterPolicy = DEFAULT_SCENE_POLICY.perimeter!;

export class ObtenerConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /** Lee la policy. Retorna el default si no hay nada persistido. */
  async ejecutar(espacioId: string): Promise<PerimeterPolicy> {
    const persisted = await this.repo.obtener(espacioId);
    return persisted ?? FALLBACK_POLICY;
  }
}

export class ActualizarConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /**
   * Persiste una nueva policy. Valida rangos antes de escribir para evitar
   * que inputs maliciosos rompan el render (altura < 0, segmentWidth = 0, etc).
   */
  async ejecutar(espacioId: string, policy: PerimeterPolicy): Promise<void> {
    const saneada: PerimeterPolicy = {
      enabled: Boolean(policy.enabled),
      style: policy.style ?? FALLBACK_POLICY.style,
      height: clamp(Number(policy.height) || FALLBACK_POLICY.height, 0.5, 10),
      segmentWidth: clamp(Number(policy.segmentWidth) || FALLBACK_POLICY.segmentWidth, 1, 20),
      margin: clamp(Number(policy.margin) || 0, 0, 5),
    };
    await this.repo.actualizar(espacioId, saneada);
  }
}

export class SuscribirConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /** Suscribe a cambios realtime. El callback recibe la policy saneada. */
  ejecutar(espacioId: string, onChange: (policy: PerimeterPolicy) => void): () => void {
    return this.repo.subscribe(espacioId, onChange);
  }
}

// ─── Helpers privados ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
