/**
 * @module application/usecases/CompletarOnboardingUseCase
 * @description Completes the onboarding process by saving cargo and department.
 */

import type { IOnboardingRepository } from '../../domain/ports/IOnboardingRepository';

export interface CompletarOnboardingInput {
  miembroId: string;
  cargoId: string;
  departamentoId?: string;
}

export class CompletarOnboardingUseCase {
  constructor(private readonly repo: IOnboardingRepository) {}

  async ejecutar(input: CompletarOnboardingInput): Promise<void> {
    await this.repo.completarOnboarding(
      input.miembroId,
      input.cargoId,
      input.departamentoId,
    );
  }
}
