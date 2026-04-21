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
  DEFAULT_PERIMETER_POLICY,
  PerimeterPolicy as PerimeterPolicyDomain,
  type PerimeterPolicy,
  type PerimeterPolicyError,
  type Result,
} from '@/src/core/domain/entities/espacio3d/PerimeterPolicy';
import type { IConfiguracionPerimetroRepository } from '@/src/core/domain/ports/IConfiguracionPerimetroRepository';

/**
 * Refactor 2026-04-20 — validación movida a Domain (factory PerimeterPolicy.create).
 * Application solo orquesta: lee/escribe via repo, decide qué hacer con el Result.
 *
 * Ref: Robert C. Martin Clean Architecture — *"Validation is a domain concern."*
 */

export class ObtenerConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /**
   * Lee la policy. Si la DB tiene un row, lo pasa por `createLenient` para
   * sanear cualquier valor legacy / inválido (ej. JSONB sin CHECK constraints
   * históricos). Si no hay row, retorna el DEFAULT.
   */
  async ejecutar(espacioId: string): Promise<PerimeterPolicy> {
    const persisted = await this.repo.obtener(espacioId);
    if (!persisted) return DEFAULT_PERIMETER_POLICY;
    // Lenient para tolerancia con datos previos al refactor.
    return PerimeterPolicyDomain.createLenient(persisted);
  }
}

export class ActualizarConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /**
   * Valida vía Domain factory antes de persistir. Si el input es inválido,
   * retorna el error tipado SIN tocar la DB. Caller decide cómo presentarlo
   * al usuario (toast, banner, etc.).
   */
  async ejecutar(
    espacioId: string,
    input: unknown,
  ): Promise<Result<PerimeterPolicy, PerimeterPolicyError>> {
    const result = PerimeterPolicyDomain.create(input as never);
    if (!result.ok) return result;
    await this.repo.actualizar(espacioId, result.value);
    return result;
  }
}

export class SuscribirConfiguracionPerimetroUseCase {
  constructor(private readonly repo: IConfiguracionPerimetroRepository) {}

  /**
   * Suscribe a cambios realtime. Cualquier policy entrante pasa por
   * `createLenient` para protegerse de payloads malformados (la DB ya tiene
   * CHECK constraints, pero el callback es un boundary externo).
   */
  ejecutar(espacioId: string, onChange: (policy: PerimeterPolicy) => void): () => void {
    return this.repo.subscribe(espacioId, (raw) => {
      onChange(PerimeterPolicyDomain.createLenient(raw));
    });
  }
}
