import { supabase } from '@/lib/supabase';
import { guardarZonaEmpresa } from '@/lib/autorizacionesEmpresa';
import type { ZonaEmpresa } from '@/types';
import type { PlantillaEspacio } from '../domain/entities/plantillasEspacio';
import type { IRegistroEmpresaRepositorio } from '../application/usecases/RegistrarEmpresaConPlantillaUseCase';

interface EmpresaPersistida {
  id: string;
  nombre: string;
  espacio_id: string;
}

interface MiembroPersistido {
  id: string;
}

interface RectanguloZona {
  centroX: number;
  centroY: number;
  ancho: number;
  alto: number;
}

const WORLD_SIZE_PX = 800;
const GAP_ZONAS_PX = 24;
const PASO_BUSQUEDA_PX = 32;

const normalizarTexto = (valor: string) => {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

const solapanRectangulos = (a: RectanguloZona, b: RectanguloZona, gap = GAP_ZONAS_PX) => {
  const halfAw = a.ancho / 2 + gap / 2;
  const halfAh = a.alto / 2 + gap / 2;
  const halfBw = b.ancho / 2 + gap / 2;
  const halfBh = b.alto / 2 + gap / 2;

  return (
    Math.abs(a.centroX - b.centroX) < halfAw + halfBw &&
    Math.abs(a.centroY - b.centroY) < halfAh + halfBh
  );
};

const crearRectanguloZona = (zona: Pick<ZonaEmpresa, 'posicion_x' | 'posicion_y' | 'ancho' | 'alto'>): RectanguloZona => ({
  centroX: Number(zona.posicion_x),
  centroY: Number(zona.posicion_y),
  ancho: Number(zona.ancho),
  alto: Number(zona.alto),
});

const encontrarPosicionDisponible = (zonas: ZonaEmpresa[], ancho: number, alto: number) => {
  const minX = Math.ceil(ancho / 2 + GAP_ZONAS_PX);
  const maxX = Math.floor(WORLD_SIZE_PX - ancho / 2 - GAP_ZONAS_PX);
  const minY = Math.ceil(alto / 2 + GAP_ZONAS_PX);
  const maxY = Math.floor(WORLD_SIZE_PX - alto / 2 - GAP_ZONAS_PX);
  const ocupadas = zonas.filter((zona) => zona.estado === 'activa').map(crearRectanguloZona);
  const centro = WORLD_SIZE_PX / 2;
  const candidatos: Array<{ centroX: number; centroY: number; distancia: number }> = [];

  for (let y = minY; y <= maxY; y += PASO_BUSQUEDA_PX) {
    for (let x = minX; x <= maxX; x += PASO_BUSQUEDA_PX) {
      const candidato = { centroX: x, centroY: y, ancho, alto };
      const libre = ocupadas.every((zona) => !solapanRectangulos(candidato, zona));
      if (!libre) {
        continue;
      }

      candidatos.push({
        centroX: x,
        centroY: y,
        distancia: Math.hypot(x - centro, y - centro),
      });
    }
  }

  candidatos.sort((a, b) => a.distancia - b.distancia);
  return candidatos[0] ?? null;
};

export class RepositorioRegistroEmpresaSupabase implements IRegistroEmpresaRepositorio {
  async guardarEmpresa(params: {
    empresaId?: string | null;
    userId: string;
    espacioId: string;
    nombre: string;
    industria?: string | null;
    tamano?: string | null;
    sitioWeb?: string | null;
    plantillaId: string;
  }): Promise<EmpresaPersistida> {
    const payload = {
      nombre: params.nombre,
      industria: params.industria ?? null,
      tamano: params.tamano ?? null,
      sitio_web: params.sitioWeb ?? null,
      actualizado_en: new Date().toISOString(),
      espacio_id: params.espacioId,
      plantilla_oficina: params.plantillaId,
    };

    if (params.empresaId) {
      const { data, error } = await supabase
        .from('empresas')
        .update(payload)
        .eq('id', params.empresaId)
        .select('id, nombre, espacio_id')
        .single();

      if (error || !data) {
        throw error ?? new Error('No se pudo actualizar la empresa.');
      }

      return data as EmpresaPersistida;
    }

    const { data, error } = await supabase
      .from('empresas')
      .insert({
        ...payload,
        creado_por: params.userId,
      })
      .select('id, nombre, espacio_id')
      .single();

    if (error || !data) {
      throw error ?? new Error('No se pudo crear la empresa.');
    }

    return data as EmpresaPersistida;
  }

  async asegurarMiembro(params: {
    espacioId: string;
    userId: string;
    empresaId: string;
    cargoId?: string | null;
  }): Promise<MiembroPersistido> {
    const { data: miembroExistente, error: miembroExistenteError } = await supabase
      .from('miembros_espacio')
      .select('id, empresa_id, cargo_id')
      .eq('espacio_id', params.espacioId)
      .eq('usuario_id', params.userId)
      .maybeSingle();

    if (miembroExistenteError) {
      throw miembroExistenteError;
    }

    if (miembroExistente) {
      if (miembroExistente.empresa_id !== params.empresaId || ((miembroExistente as { cargo_id?: string | null }).cargo_id ?? null) !== (params.cargoId ?? null)) {
        const { error: updateMiembroError } = await supabase
          .from('miembros_espacio')
          .update({ empresa_id: params.empresaId, cargo_id: params.cargoId ?? null })
          .eq('id', miembroExistente.id);

        if (updateMiembroError) {
          throw updateMiembroError;
        }
      }

      return { id: miembroExistente.id };
    }

    const { data: miembroData, error: miembroError } = await supabase
      .from('miembros_espacio')
      .insert({
        espacio_id: params.espacioId,
        usuario_id: params.userId,
        rol: 'super_admin',
        aceptado: true,
        onboarding_completado: false,
        empresa_id: params.empresaId,
        cargo_id: params.cargoId ?? null,
      })
      .select('id')
      .single();

    if (miembroError || !miembroData) {
      throw miembroError ?? new Error('No se pudo crear la membresía inicial.');
    }

    return miembroData as MiembroPersistido;
  }

  async asegurarZonaEmpresa(params: {
    espacioId: string;
    empresaId: string;
    nombreEmpresa: string;
    usuarioId: string;
    plantilla: PlantillaEspacio;
  }): Promise<ZonaEmpresa> {
    const { data, error } = await supabase
      .from('zonas_empresa')
      .select('id, empresa_id, espacio_id, nombre_zona, posicion_x, posicion_y, ancho, alto, color, estado, es_comun, spawn_x, spawn_y, modelo_url, tipo_suelo')
      .eq('espacio_id', params.espacioId)
      .order('creado_en', { ascending: true });

    if (error) {
      throw error;
    }

    const zonas = ((data || []) as ZonaEmpresa[]).filter((zona) => !zona.es_comun);
    const zonaPorEmpresa = zonas.find((zona) => zona.empresa_id === params.empresaId);

    if (zonaPorEmpresa) {
      const spawnX = Number(zonaPorEmpresa.spawn_x) || Number(zonaPorEmpresa.posicion_x);
      const spawnY = Number(zonaPorEmpresa.spawn_y) || Number(zonaPorEmpresa.posicion_y);
      const actualizada = await guardarZonaEmpresa({
        zonaId: zonaPorEmpresa.id,
        espacioId: params.espacioId,
        empresaId: params.empresaId,
        nombreZona: params.nombreEmpresa,
        posicionX: Number(zonaPorEmpresa.posicion_x),
        posicionY: Number(zonaPorEmpresa.posicion_y),
        ancho: Number(zonaPorEmpresa.ancho),
        alto: Number(zonaPorEmpresa.alto),
        color: params.plantilla.zona.color,
        usuarioId: params.usuarioId,
        spawnX,
        spawnY,
        tipoSuelo: params.plantilla.tipo_suelo,
      });

      if (!actualizada) {
        throw new Error('No se pudo actualizar la zona de la empresa.');
      }

      return actualizada;
    }

    const zonaPorNombre = zonas.find((zona) => !zona.empresa_id && normalizarTexto(zona.nombre_zona || '') === normalizarTexto(params.nombreEmpresa));

    if (zonaPorNombre) {
      const spawnX = Number(zonaPorNombre.spawn_x) || Number(zonaPorNombre.posicion_x);
      const spawnY = Number(zonaPorNombre.spawn_y) || Number(zonaPorNombre.posicion_y);
      const adoptada = await guardarZonaEmpresa({
        zonaId: zonaPorNombre.id,
        espacioId: params.espacioId,
        empresaId: params.empresaId,
        nombreZona: params.nombreEmpresa,
        posicionX: Number(zonaPorNombre.posicion_x),
        posicionY: Number(zonaPorNombre.posicion_y),
        ancho: Number(zonaPorNombre.ancho),
        alto: Number(zonaPorNombre.alto),
        color: params.plantilla.zona.color,
        usuarioId: params.usuarioId,
        spawnX,
        spawnY,
        tipoSuelo: params.plantilla.tipo_suelo,
      });

      if (!adoptada) {
        throw new Error('No se pudo adoptar la zona inicial de la empresa.');
      }

      return adoptada;
    }

    const ancho = Math.round(params.plantilla.zona.ancho_metros * 16);
    const alto = Math.round(params.plantilla.zona.alto_metros * 16);
    const posicion = encontrarPosicionDisponible(zonas, ancho, alto);

    if (!posicion) {
      throw new Error('No se encontró un área libre suficiente para ubicar la oficina inicial.');
    }

    const creada = await guardarZonaEmpresa({
      espacioId: params.espacioId,
      empresaId: params.empresaId,
      nombreZona: params.nombreEmpresa,
      posicionX: posicion.centroX,
      posicionY: posicion.centroY,
      ancho,
      alto,
      color: params.plantilla.zona.color,
      usuarioId: params.usuarioId,
      spawnX: posicion.centroX,
      spawnY: posicion.centroY,
      tipoSuelo: params.plantilla.tipo_suelo,
    });

    if (!creada) {
      throw new Error('No se pudo crear la zona base de la empresa.');
    }

    return creada;
  }
}
