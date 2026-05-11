/**
 * @module domain/ports/IEspacioConfiguracionRepository
 * @description Port para el campo `configuracion` (JSONB) de `espacios_trabajo`.
 * Settings genéricas del espacio (guests, meetings, etc.) viven aquí.
 */

export interface EspacioConfiguracion {
  guests?: {
    checkInEnabled?: boolean;
    requireApproval?: boolean;
    accessDuration?: number;
    allowChat?: boolean;
    allowVideo?: boolean;
  };
  [key: string]: unknown;
}

export interface IEspacioConfiguracionRepository {
  obtenerConfiguracion(espacioId: string): Promise<EspacioConfiguracion | null>;
  actualizarConfiguracion(espacioId: string, configuracion: EspacioConfiguracion): Promise<void>;
}
