/**
 * @module application/usecases/ObtenerDatosOnboardingUseCase
 * @description Fetches all data needed for the onboarding flow.
 * Orchestrates membership verification + departments/cargos/invitation data.
 */

import type { IOnboardingRepository, DatosOnboarding } from '../../domain/ports/IOnboardingRepository';

export class ObtenerDatosOnboardingUseCase {
  constructor(private readonly repo: IOnboardingRepository) {}

  async ejecutar(userId: string, userEmail: string): Promise<DatosOnboarding | null> {
    const miembro = await this.repo.obtenerMiembroPendiente(userId);
    if (!miembro) return null;

    if (miembro.onboarding_completado) return null;

    const datos = await this.repo.obtenerDatosOnboarding(userId, userEmail, miembro.espacio_id);

    return {
      miembro,
      ...datos,
    };
  }
}
