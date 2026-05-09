/**
 * @module domain/ports/IDepartamentoRepository
 * @description Port interface for departamentos CRUD (organizational departments per workspace).
 *
 * Clean Architecture: Domain layer defines the contract; Infrastructure
 * implements it with Supabase. Settings UI consumes via this port — never
 * touches `supabase.from()` directly.
 */

export interface Departamento {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  icono: string;
}

export interface DepartamentoInput {
  nombre: string;
  descripcion: string | null;
  color: string;
  icono: string;
}

export interface IDepartamentoRepository {
  listByWorkspace(workspaceId: string): Promise<Departamento[]>;
  create(workspaceId: string, input: DepartamentoInput): Promise<void>;
  update(id: string, input: DepartamentoInput): Promise<void>;
  delete(id: string): Promise<void>;
}
