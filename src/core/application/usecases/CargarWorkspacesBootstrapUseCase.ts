/**
 * @module core/application/usecases/CargarWorkspacesBootstrapUseCase
 * @description Use case: Load user's workspaces during app bootstrap.
 *
 * Clean Architecture: Application layer — orchestrates domain port.
 * No infrastructure dependencies (Supabase, PostgREST, etc.).
 *
 * This use case exists to:
 * 1. Decouple workspace loading from the Zustand store orchestrator
 * 2. Allow future optimizations (caching, prefetching) without touching infra
 * 3. Provide a single entry point for workspace bootstrap logic
 *
 * Performance context:
 *   The underlying SQL now uses SECURITY DEFINER functions that execute
 *   O(1) per-statement instead of O(N) per-row RLS evaluation.
 *   Expected latency: <200ms (down from 4.8s).
 */

import type {
  IWorkspaceBootstrapRepository,
  WorkspaceBootstrapData,
} from '../../domain/ports/IWorkspaceBootstrapRepository';

export class CargarWorkspacesBootstrapUseCase {
  constructor(private readonly repo: IWorkspaceBootstrapRepository) {}

  /**
   * Execute the workspace bootstrap query.
   *
   * @param userId  Authenticated user's UUID
   * @returns       Workspaces with role, or empty array on failure
   */
  async execute(userId: string): Promise<WorkspaceBootstrapData[]> {
    if (!userId) return [];
    return this.repo.fetchUserWorkspaces(userId);
  }
}
