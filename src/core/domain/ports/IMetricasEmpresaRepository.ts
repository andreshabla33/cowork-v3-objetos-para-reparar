/**
 * @module domain/ports/IMetricasEmpresaRepository
 * @description Port para queries de métricas segmentadas por empresa.
 * Clean Architecture: capa Domain — sin deps externas.
 */

export interface MetricaDiaria {
  id: string;
  espacio_id: string;
  empresa_id: string;
  fecha: string;
  conexiones: number;
  desconexiones: number;
  usuarios_activos: number;
  reuniones_creadas: number;
  reuniones_asistidas: number;
  minutos_reunion: number;
  mensajes_chat: number;
  emotes_enviados: number;
  saludos_wave: number;
  teleports: number;
  xp_ganado: number;
  nivel_promedio: number;
  racha_promedio: number;
}

export interface EmpresaMetrica {
  id: string;
  nombre: string;
}

export interface IMetricasEmpresaRepository {
  obtenerMetricasPorEspacio(espacioId: string, diasAtras: number): Promise<MetricaDiaria[]>;
  obtenerEmpresasDelEspacio(espacioId: string): Promise<EmpresaMetrica[]>;
}
