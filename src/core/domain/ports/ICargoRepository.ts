/**
 * @module domain/ports/ICargoRepository
 * @description Port interface for cargos CRUD (organizational positions per workspace).
 *
 * Clean Architecture: Domain layer defines the contract; Infrastructure
 * implements it with Supabase. Settings UI consumes via this port — never
 * touches `supabase.from()` directly.
 */

export interface Cargo {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  icono: string;
  orden: number;
  activo: boolean;
  tiene_analisis_avanzado: boolean;
  analisis_disponibles: string[];
  solo_admin: boolean;
}

export interface CargoCreateInput {
  nombre: string;
  descripcion: string | null;
  categoria: string;
  icono: string;
  orden: number;
  solo_admin: boolean;
  tiene_analisis_avanzado: boolean;
}

export interface CargoUpdateInput {
  nombre: string;
  descripcion: string | null;
  categoria: string;
  icono: string;
  solo_admin: boolean;
  tiene_analisis_avanzado: boolean;
}

export interface ICargoRepository {
  listByWorkspace(workspaceId: string): Promise<Cargo[]>;
  create(workspaceId: string, input: CargoCreateInput): Promise<void>;
  update(id: string, input: CargoUpdateInput): Promise<void>;
  toggleActivo(id: string, activo: boolean): Promise<void>;
  delete(id: string): Promise<void>;
}
