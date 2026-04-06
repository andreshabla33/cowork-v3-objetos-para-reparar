/**
 * @module hooks/space3d/useEspacioObjetos
 * Hook para gestión de objetos 3D persistentes en el espacio virtual.
 * Maneja: fetch, claim (reclamar escritorio), mover, liberar y spawn personal.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { obtenerPlantillaZona } from '@/src/core/domain/entities/plantillasEspacio';

// ─── Tipo canónico desde dominio ──────────────────────────────────────────────
// CLEAN-ARCH-F1: EspacioObjeto es una entidad de dominio, no un detalle del hook.
// La definición canónica vive en src/core/domain/entities/espacio3d/ObjetoEspacio3D.ts
import type { ObjetoEspacio3D as EspacioObjeto } from '@/src/core/domain/entities/espacio3d';
export type { EspacioObjeto };

export interface SpawnPersonal {
  spawn_x: number | null;
  spawn_z: number | null;
}

export type TransformacionObjetoInput = Partial<Pick<
  EspacioObjeto,
  | 'posicion_x'
  | 'posicion_y'
  | 'posicion_z'
  | 'rotacion_x'
  | 'rotacion_y'
  | 'rotacion_z'
  | 'escala_x'
  | 'escala_y'
  | 'escala_z'
>>;

export interface UseEspacioObjetosReturn {
  objetos: EspacioObjeto[];
  loading: boolean;
  spawnPersonal: SpawnPersonal;
  miEscritorio: EspacioObjeto | null;
  refrescarObjetos: () => Promise<void>;
  crearObjetoDesdeCatalogo: (catalogo: CatalogoObjeto3D, posicion: { x: number; y: number; z: number }, rotacionY?: number) => Promise<EspacioObjeto | null>;
  reemplazarObjetoDesdeCatalogo: (objetoId: string, catalogo: CatalogoObjeto3D) => Promise<EspacioObjeto | null>;
  reclamarObjeto: (objetoId: string) => Promise<boolean>;
  liberarObjeto: (objetoId: string) => Promise<boolean>;
  actualizarTransformacionObjeto: (objetoId: string, cambios: TransformacionObjetoInput) => Promise<boolean>;
  moverObjeto: (objetoId: string, x: number, y: number, z: number) => Promise<boolean>;
  rotarObjeto: (objetoId: string, currentRotationY: number) => Promise<boolean>;
  eliminarObjeto: (objetoId: string) => Promise<boolean>;
  duplicarObjetos: (objetosList: EspacioObjeto[]) => Promise<EspacioObjeto[]>;
  restaurarObjeto: (objeto: EspacioObjeto) => Promise<EspacioObjeto | null>;
  guardarSpawnPersonal: (x: number, z: number) => Promise<boolean>;
}

type CatalogoObjeto3DRuntime = Pick<
  CatalogoObjeto3D,
  | 'id'
  | 'tipo'
  | 'modelo_url'
  | 'built_in_geometry'
  | 'built_in_color'
  | 'ancho'
  | 'alto'
  | 'profundidad'
  | 'es_sentable'
  | 'sit_offset_x'
  | 'sit_offset_y'
  | 'sit_offset_z'
  | 'sit_rotation_y'
  | 'es_interactuable'
  | 'interaccion_tipo'
  | 'interaccion_radio'
  | 'interaccion_emoji'
  | 'interaccion_label'
  | 'interaccion_config'
  | 'configuracion_geometria'
  | 'es_reclamable'
  | 'premium'
  | 'escala_normalizacion'
> & {
  slug?: string | null;
};

const crearClaveModelo = (valor?: string | null) => {
  return (valor || '').trim().toLowerCase();
};

const crearIndiceCatalogo = (catalogo: CatalogoObjeto3DRuntime[]) => {
  const porId = new Map<string, CatalogoObjeto3DRuntime>();
  const porSlug = new Map<string, CatalogoObjeto3DRuntime>();
  const porModelo = new Map<string, CatalogoObjeto3DRuntime>();
  const porTipo = new Map<string, CatalogoObjeto3DRuntime>();

  catalogo.forEach((item) => {
    if (item.id && !porId.has(item.id)) {
      porId.set(item.id, item);
    }

    const claveModelo = crearClaveModelo(item.modelo_url);
    if (claveModelo && !porModelo.has(claveModelo)) {
      porModelo.set(claveModelo, item);
    }

    const claveSlug = typeof item.slug === 'string' ? item.slug.trim().toLowerCase() : '';
    if (claveSlug && !porSlug.has(claveSlug)) {
      porSlug.set(claveSlug, item);
    }

    const claveTipo = (item.tipo || '').trim().toLowerCase();
    if (claveTipo && !porTipo.has(claveTipo)) {
      porTipo.set(claveTipo, item);
    }
  });

  return { porId, porSlug, porModelo, porTipo };
};

const resolverSlugCatalogoPlantilla = (objeto: EspacioObjeto) => {
  const configGeometria = objeto.configuracion_geometria as Record<string, unknown> | null;
  const metaPlantilla = configGeometria?.meta_plantilla_zona as { slug_catalogo?: string; plantilla_id?: string; clave_instancia?: string } | undefined;
  const slugDirecto = typeof metaPlantilla?.slug_catalogo === 'string' ? metaPlantilla.slug_catalogo.trim().toLowerCase() : '';
  if (slugDirecto) {
    return slugDirecto;
  }

  const plantillaId = typeof metaPlantilla?.plantilla_id === 'string' ? metaPlantilla.plantilla_id : null;
  const claveInstancia = typeof metaPlantilla?.clave_instancia === 'string' ? metaPlantilla.clave_instancia : null;
  if (!plantillaId || !claveInstancia) {
    return '';
  }

  const plantilla = obtenerPlantillaZona(plantillaId);
  const definicionObjeto = plantilla?.objetos.find((item) => item.clave === claveInstancia);
  return (definicionObjeto?.slug_catalogo || '').trim().toLowerCase();
};

const enriquecerObjetoEspacio = (
  objeto: EspacioObjeto,
  indiceCatalogo: ReturnType<typeof crearIndiceCatalogo>
): EspacioObjeto => {
  const metadataPorId = objeto.catalogo_id ? indiceCatalogo.porId.get(objeto.catalogo_id) : undefined;
  const claveModelo = crearClaveModelo(objeto.modelo_url);
  const claveSlugPlantilla = resolverSlugCatalogoPlantilla(objeto);
  const claveTipo = (objeto.tipo || '').trim().toLowerCase();
  const metadata =
    metadataPorId ||
    (claveModelo ? indiceCatalogo.porModelo.get(claveModelo) : undefined) ||
    (claveSlugPlantilla ? indiceCatalogo.porSlug.get(claveSlugPlantilla) : undefined) ||
    (claveTipo ? indiceCatalogo.porTipo.get(claveTipo) : undefined);

  if (!metadata) return objeto;

  const modeloUrlInstancia = (objeto.modelo_url || '').trim();
  const modeloUrlMetadata = (metadata.modelo_url || '').trim();
  const usarModeloCatalogo = Boolean(modeloUrlMetadata) && (!modeloUrlInstancia || modeloUrlInstancia.startsWith('builtin:'));

  const escalaNormalizacionInstancia = Number(objeto.escala_normalizacion);
  const escalaNormalizacionMetadata = Number(metadata.escala_normalizacion ?? 1);
  const usarEscalaMetadata = Number.isFinite(escalaNormalizacionMetadata)
    && escalaNormalizacionMetadata > 0
    && (
      !Number.isFinite(escalaNormalizacionInstancia)
      || escalaNormalizacionInstancia <= 0
    );

  return {
    ...objeto,
    modelo_url: usarModeloCatalogo ? modeloUrlMetadata : objeto.modelo_url,
    built_in_geometry: metadata.built_in_geometry,
    built_in_color: metadata.built_in_color,
    ancho: metadata.ancho,
    alto: metadata.alto,
    profundidad: metadata.profundidad,
    es_sentable: metadata.es_sentable,
    sit_offset_x: metadata.sit_offset_x,
    sit_offset_y: metadata.sit_offset_y,
    sit_offset_z: metadata.sit_offset_z,
    sit_rotation_y: metadata.sit_rotation_y,
    interactuable: objeto.interactuable ?? metadata.es_interactuable,
    es_interactuable: objeto.interactuable ?? metadata.es_interactuable,
    interaccion_tipo: metadata.interaccion_tipo,
    interaccion_radio: metadata.interaccion_radio,
    interaccion_emoji: metadata.interaccion_emoji,
    interaccion_label: metadata.interaccion_label,
    interaccion_config: metadata.interaccion_config,
    configuracion_geometria: objeto.configuracion_geometria ?? metadata.configuracion_geometria ?? null,
    es_reclamable: metadata.es_reclamable,
    premium: metadata.premium,
    escala_normalizacion: usarEscalaMetadata
      ? escalaNormalizacionMetadata
      : (Number.isFinite(escalaNormalizacionInstancia) && escalaNormalizacionInstancia > 0
        ? escalaNormalizacionInstancia
        : (metadata.escala_normalizacion ?? 1)),
    catalogo: {
      ancho: Number(metadata.ancho) || 1,
      alto: Number(metadata.alto) || 1,
      profundidad: Number(metadata.profundidad) || 1,
      escala_normalizacion: metadata.escala_normalizacion ?? 1,
    },
  };
};

export function useEspacioObjetos(
  espacioId: string | null,
  userId: string | null,
  empresaId: string | null = null
): UseEspacioObjetosReturn {
  const log = logger.child('useEspacioObjetos');
  const [objetos, setObjetos] = useState<EspacioObjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [spawnPersonal, setSpawnPersonal] = useState<SpawnPersonal>({ spawn_x: null, spawn_z: null });
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const catalogoIndiceRef = useRef<ReturnType<typeof crearIndiceCatalogo>>(crearIndiceCatalogo([]));
  const objetosRef = useRef<EspacioObjeto[]>(objetos);
  objetosRef.current = objetos;

  const fetchObjetos = useCallback(async () => {
    if (!espacioId || !userId) {
      setObjetos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data, error }, { data: catalogoData, error: catalogoError }] = await Promise.all([
      supabase
        .from('espacio_objetos')
        .select('*')
        .eq('espacio_id', espacioId),
      supabase
        .from('catalogo_objetos_3d')
        .select('id, slug, tipo, modelo_url, built_in_geometry, built_in_color, ancho, alto, profundidad, es_sentable, sit_offset_x, sit_offset_y, sit_offset_z, sit_rotation_y, es_interactuable, interaccion_tipo, interaccion_radio, interaccion_emoji, interaccion_label, interaccion_config, configuracion_geometria, es_reclamable, premium, escala_normalizacion'),
    ]);

    if (!catalogoError && catalogoData) {
      catalogoIndiceRef.current = crearIndiceCatalogo(catalogoData as CatalogoObjeto3DRuntime[]);
    } else if (catalogoError) {
      log.error('Error fetching catálogo', { error: catalogoError instanceof Error ? catalogoError.message : String(catalogoError) });
    }

    if (!error && data) {
      setObjetos((data as EspacioObjeto[]).map((objeto) => enriquecerObjetoEspacio(objeto, catalogoIndiceRef.current)));
    } else {
      log.error('Error fetching objetos', { error: error instanceof Error ? error.message : String(error) });
    }

    setLoading(false);
  }, [espacioId, userId]);

  // Fetch objetos del espacio
  useEffect(() => {
    void fetchObjetos();

    if (!espacioId || !userId) {
      return;
    }

    // Suscripción realtime para cambios en objetos del espacio
    subscriptionRef.current = supabase
      .channel(`espacio_objetos:${espacioId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'espacio_objetos',
          filter: `espacio_id=eq.${espacioId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setObjetos((prev) => {
              const nuevoObjeto = enriquecerObjetoEspacio(payload.new as EspacioObjeto, catalogoIndiceRef.current);
              if (prev.some((obj) => obj.id === nuevoObjeto.id)) return prev;
              return [...prev, nuevoObjeto];
            });
          } else if (payload.eventType === 'UPDATE') {
            setObjetos((prev) =>
              prev.map((obj) => (obj.id === (payload.new as EspacioObjeto).id ? enriquecerObjetoEspacio(payload.new as EspacioObjeto, catalogoIndiceRef.current) : obj))
            );
          } else if (payload.eventType === 'DELETE') {
            const eliminadoId = (payload.old as Record<string, unknown>)?.id as string;
            setObjetos((prev) => prev.filter((obj) => obj.id !== eliminadoId));
          }
        }
      )
      .subscribe();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    }
  }, [espacioId, fetchObjetos, userId]);

  // Fetch spawn personal del usuario
  useEffect(() => {
    if (!espacioId || !userId) return;

    const fetchSpawn = async () => {
      const { data } = await supabase
        .from('miembros_espacio')
        .select('spawn_x, spawn_z')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', userId)
        .maybeSingle();

      if (data) {
        setSpawnPersonal({ spawn_x: data.spawn_x, spawn_z: data.spawn_z });
      }
    };

    fetchSpawn();
  }, [espacioId, userId]);

  // Escritorio del usuario actual
  const miEscritorio = objetos.find((o) => o.owner_id === userId) || null;

  const crearObjetoDesdeCatalogo = useCallback(async (
    catalogo: CatalogoObjeto3D,
    posicion: { x: number; y: number; z: number },
    rotacionY = 0
  ): Promise<EspacioObjeto | null> => {
    if (!espacioId || !userId) return null;

    const modeloUrl = catalogo.modelo_url
      || (catalogo.built_in_geometry
        ? `builtin:${catalogo.built_in_geometry}:${(catalogo.built_in_color || '#6366f1').replace('#', '')}`
        : 'builtin:cubo:6366f1');

    const escalaX = 1;
    const escalaY = 1;
    const escalaZ = 1;

    const { data, error } = await supabase
      .from('espacio_objetos')
      .insert({
        espacio_id: espacioId,
        empresa_id: empresaId,
        modelo_url: modeloUrl,
        tipo: catalogo.tipo,
        nombre: catalogo.nombre,
        posicion_x: posicion.x,
        posicion_y: posicion.y,
        posicion_z: posicion.z,
        rotacion_x: 0,
        rotacion_y: rotacionY,
        rotacion_z: 0,
        escala_x: escalaX,
        escala_y: escalaY,
        escala_z: escalaZ,
        owner_id: userId,
        catalogo_id: catalogo.id,
        interactuable: Boolean(catalogo.es_interactuable || catalogo.es_sentable),
        configuracion_geometria: catalogo.configuracion_geometria ?? null,
        escala_normalizacion: null,
      })
      .select()
      .single();

    if (error) {
      log.error('Error creando objeto desde catálogo', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }

    const nuevoObjeto = enriquecerObjetoEspacio(data as EspacioObjeto, catalogoIndiceRef.current);
    // Alta optimista: añadir al estado local inmediatamente
    setObjetos((prev) => {
      if (prev.some((obj) => obj.id === nuevoObjeto.id)) return prev;
      return [...prev, nuevoObjeto];
    });

    return nuevoObjeto;
  }, [empresaId, espacioId, userId]);

  const reemplazarObjetoDesdeCatalogo = useCallback(async (
    objetoId: string,
    catalogo: CatalogoObjeto3D,
  ): Promise<EspacioObjeto | null> => {
    const objetoPrevio = objetosRef.current.find((obj) => obj.id === objetoId);
    if (!objetoPrevio) {
      return null;
    }

    const modeloUrl = catalogo.modelo_url
      || (catalogo.built_in_geometry
        ? `builtin:${catalogo.built_in_geometry}:${(catalogo.built_in_color || '#6366f1').replace('#', '')}`
        : 'builtin:cubo:6366f1');

    const configuracionCatalogo = catalogo.configuracion_geometria && typeof catalogo.configuracion_geometria === 'object'
      ? { ...((catalogo.configuracion_geometria as unknown) as Record<string, unknown>) }
      : null;
    const configuracionActual = objetoPrevio.configuracion_geometria && typeof objetoPrevio.configuracion_geometria === 'object'
      ? (objetoPrevio.configuracion_geometria as unknown) as Record<string, unknown>
      : null;
    const metaPlantilla = configuracionActual?.meta_plantilla_zona;
    const configuracionGeometria: EspacioObjeto['configuracion_geometria'] = metaPlantilla
      ? {
        ...(configuracionCatalogo || {}),
        meta_plantilla_zona: metaPlantilla,
      } as any
      : ((configuracionCatalogo ?? null) as any);

    const payload = {
      catalogo_id: catalogo.id,
      modelo_url: modeloUrl,
      tipo: catalogo.tipo,
      nombre: catalogo.nombre,
      interactuable: Boolean(catalogo.es_interactuable || catalogo.es_sentable),
      configuracion_geometria: configuracionGeometria,
      escala_normalizacion: catalogo.escala_normalizacion ?? null,
    };

    const optimista = enriquecerObjetoEspacio(
      {
        ...objetoPrevio,
        ...payload,
      },
      catalogoIndiceRef.current,
    );

    setObjetos((prev) => prev.map((obj) => (obj.id === objetoId ? optimista : obj)));

    const { data, error } = await supabase
      .from('espacio_objetos')
      .update(payload)
      .eq('id', objetoId)
      .select()
      .single();

    if (error) {
      log.error('Error reemplazando objeto desde catálogo', { error: error instanceof Error ? error.message : String(error) });
      setObjetos((prev) => prev.map((obj) => (obj.id === objetoId ? objetoPrevio : obj)));
      return null;
    }

    const reemplazado = enriquecerObjetoEspacio(data as EspacioObjeto, catalogoIndiceRef.current);
    setObjetos((prev) => prev.map((obj) => (obj.id === objetoId ? reemplazado : obj)));
    return reemplazado;
  }, []);

  // Reclamar un objeto (escritorio libre → asignar owner_id)
  // Enforce: un solo escritorio por usuario — libera el anterior si existe
  const reclamarObjeto = useCallback(async (objetoId: string): Promise<boolean> => {
    log.info('reclamarObjeto', { objetoId, userId, espacioId });
    if (!userId) { log.warn('userId es null'); return false; }

    // Si ya tiene un escritorio, liberarlo primero
    const escritorioActual = objetosRef.current.find((o) => o.owner_id === userId);
    if (escritorioActual && escritorioActual.id !== objetoId) {
      log.info('Liberando escritorio anterior', { escritorioId: escritorioActual.id });
      await supabase
        .from('espacio_objetos')
        .update({ owner_id: null })
        .eq('id', escritorioActual.id)
        .eq('owner_id', userId);
    }

    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: userId })
      .eq('id', objetoId)
      .is('owner_id', null)
      .select();

    log.debug('Resultado reclamar', { dataLength: data?.length ?? 0, hasError: !!error });

    if (error) {
      log.error('Error reclamando', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }

    if (!data || data.length === 0) {
      log.warn('No se reclamó — RLS o ya ocupado');
      return false;
    }

    // Guardar spawn personal en la posición del escritorio reclamado
    const objeto = objetosRef.current.find((o) => o.id === objetoId);
    if (objeto) {
      await guardarSpawnPersonal(objeto.posicion_x, objeto.posicion_z);
    }

    return true;
  }, [userId, espacioId]);

  // Liberar un objeto (quitar owner_id)
  const liberarObjeto = useCallback(async (objetoId: string): Promise<boolean> => {
    log.info('liberarObjeto', { objetoId, userId });
    if (!userId) { log.warn('userId null en liberar'); return false; }

    const { data, error } = await supabase
      .from('espacio_objetos')
      .update({ owner_id: null })
      .eq('id', objetoId)
      .eq('owner_id', userId)
      .select();

    log.debug('Resultado liberar', { dataLength: data?.length ?? 0, hasError: !!error });

    if (error) {
      log.error('Error liberando', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }

    // Limpiar spawn personal
    if (espacioId) {
      await supabase
        .from('miembros_espacio')
        .update({ spawn_x: null, spawn_z: null })
        .eq('espacio_id', espacioId)
        .eq('usuario_id', userId);
    }

    setSpawnPersonal({ spawn_x: null, spawn_z: null });
    return true;
  }, [userId, espacioId]);

  const actualizarTransformacionObjeto = useCallback(async (objetoId: string, cambios: TransformacionObjetoInput): Promise<boolean> => {
    const objetoPrevio = objetosRef.current.find((obj) => obj.id === objetoId);
    if (!objetoPrevio) {
      log.warn('Objeto no encontrado para transformar', { objetoId });
      return false;
    }

    const payload = Object.fromEntries(
      Object.entries(cambios).filter(([, valor]) => valor !== undefined)
    ) as TransformacionObjetoInput;

    if (Object.keys(payload).length === 0) {
      return true;
    }

    const objetoSiguiente = enriquecerObjetoEspacio(
      { ...objetoPrevio, ...payload },
      catalogoIndiceRef.current
    );

    setObjetos((prev) => prev.map((obj) => (obj.id === objetoId ? objetoSiguiente : obj)));

    const { error } = await supabase
      .from('espacio_objetos')
      .update(payload)
      .eq('id', objetoId);

    if (error) {
      log.error('Error actualizando transformación', { error: error instanceof Error ? error.message : String(error) });
      setObjetos((prev) => prev.map((obj) => (obj.id === objetoId ? objetoPrevio : obj)));
      return false;
    }

    return true;
  }, []);

  // Mover un objeto (actualizar posición)
  const moverObjeto = useCallback(async (objetoId: string, x: number, y: number, z: number): Promise<boolean> => {
    return actualizarTransformacionObjeto(objetoId, {
      posicion_x: x,
      posicion_y: y,
      posicion_z: z,
    });
  }, [actualizarTransformacionObjeto]);

  // Rotar un objeto (actualizar rotación Y en 90 grados)
  const rotarObjeto = useCallback(async (objetoId: string, currentRotationY: number): Promise<boolean> => {
    const newRotationY = (currentRotationY + Math.PI / 2) % (Math.PI * 2);
    return actualizarTransformacionObjeto(objetoId, { rotacion_y: newRotationY });
  }, [actualizarTransformacionObjeto]);

  // Eliminar un objeto (solo si el usuario tiene permisos o es el owner)
  const eliminarObjeto = useCallback(async (objetoId: string): Promise<boolean> => {
    const indicePrevio = objetosRef.current.findIndex((obj) => obj.id === objetoId);
    const objetoPrevio = indicePrevio >= 0 ? objetosRef.current[indicePrevio] : null;

    setObjetos((prev) => prev.filter((obj) => obj.id !== objetoId));

    const { error } = await supabase
      .from('espacio_objetos')
      .delete()
      .eq('id', objetoId);

    if (error) {
      log.error('Error eliminando objeto', { error: error instanceof Error ? error.message : String(error) });
      if (objetoPrevio) {
        setObjetos((prev) => {
          if (prev.some((obj) => obj.id === objetoPrevio.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(indicePrevio, next.length), 0, objetoPrevio);
          return next;
        });
      }
      return false;
    }
    return true;
  }, []);

  const duplicarObjetos = useCallback(async (objetosList: EspacioObjeto[]): Promise<EspacioObjeto[]> => {
    if (!espacioId || !userId || objetosList.length === 0) return [];

    const nuevasEntradas = objetosList.map(obj => ({
      espacio_id: espacioId,
      empresa_id: obj.empresa_id ?? null,
      es_de_plantilla: obj.es_de_plantilla ?? false,
      modelo_url: obj.modelo_url,
      tipo: obj.tipo,
      nombre: obj.nombre,
      posicion_x: obj.posicion_x + 1, // Offset para que no se superpongan exactamente
      posicion_y: obj.posicion_y,
      posicion_z: obj.posicion_z + 1,
      rotacion_x: obj.rotacion_x,
      rotacion_y: obj.rotacion_y,
      rotacion_z: obj.rotacion_z,
      escala_x: obj.escala_x,
      escala_y: obj.escala_y,
      escala_z: obj.escala_z,
      owner_id: userId,
      catalogo_id: obj.catalogo_id,
      interactuable: Boolean(obj.interactuable ?? obj.es_interactuable ?? false),
      plantilla_origen: obj.plantilla_origen ?? null,
      escala_normalizacion: obj.escala_normalizacion,
    }));

    const { data, error } = await supabase
      .from('espacio_objetos')
      .insert(nuevasEntradas)
      .select();

    if (error) {
      log.error('Error duplicando objetos', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }

    const nuevosObjetos = (data as EspacioObjeto[]).map(obj => enriquecerObjetoEspacio(obj, catalogoIndiceRef.current));
    
    setObjetos((prev) => {
      const next = [...prev];
      nuevosObjetos.forEach(nuevo => {
        if (!next.some(o => o.id === nuevo.id)) {
          next.push(nuevo);
        }
      });
      return next;
    });

    return nuevosObjetos;
  }, [espacioId, userId]);

  const restaurarObjeto = useCallback(async (objeto: EspacioObjeto): Promise<EspacioObjeto | null> => {
    const snapshotPrevio = [...objetosRef.current];
    const objetoBase = {
      id: objeto.id,
      espacio_id: objeto.espacio_id,
      catalogo_id: objeto.catalogo_id ?? null,
      modelo_url: objeto.modelo_url,
      tipo: objeto.tipo,
      nombre: objeto.nombre,
      posicion_x: objeto.posicion_x,
      posicion_y: objeto.posicion_y,
      posicion_z: objeto.posicion_z,
      rotacion_x: objeto.rotacion_x,
      rotacion_y: objeto.rotacion_y,
      rotacion_z: objeto.rotacion_z,
      escala_x: objeto.escala_x,
      escala_y: objeto.escala_y,
      escala_z: objeto.escala_z,
      empresa_id: objeto.empresa_id ?? null,
      es_de_plantilla: objeto.es_de_plantilla ?? false,
      owner_id: objeto.owner_id ?? null,
      plantilla_origen: objeto.plantilla_origen ?? null,
      interactuable: Boolean(objeto.interactuable ?? objeto.es_interactuable ?? false),
    };

    const objetoOptimista = enriquecerObjetoEspacio(objetoBase as EspacioObjeto, catalogoIndiceRef.current);

    setObjetos((prev) => {
      const indice = prev.findIndex((item) => item.id === objeto.id);
      if (indice === -1) return [...prev, objetoOptimista];
      const next = [...prev];
      next[indice] = objetoOptimista;
      return next;
    });

    const { data, error } = await supabase
      .from('espacio_objetos')
      .upsert(objetoBase, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      log.error('Error restaurando objeto', { error: error instanceof Error ? error.message : String(error) });
      setObjetos(snapshotPrevio);
      return null;
    }

    const restaurado = enriquecerObjetoEspacio(data as EspacioObjeto, catalogoIndiceRef.current);
    setObjetos((prev) => {
      const indice = prev.findIndex((item) => item.id === restaurado.id);
      if (indice === -1) return [...prev, restaurado];
      const next = [...prev];
      next[indice] = restaurado;
      return next;
    });

    return restaurado;
  }, []);

  // Guardar spawn personal
  const guardarSpawnPersonal = useCallback(async (x: number, z: number): Promise<boolean> => {
    if (!espacioId || !userId) return false;

    const { error } = await supabase
      .from('miembros_espacio')
      .update({ spawn_x: x, spawn_z: z })
      .eq('espacio_id', espacioId)
      .eq('usuario_id', userId);

    if (error) {
      log.error('Error guardando spawn', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }

    setSpawnPersonal({ spawn_x: x, spawn_z: z });
    return true;
  }, [espacioId, userId]);

  return {
    objetos,
    loading,
    spawnPersonal,
    miEscritorio,
    refrescarObjetos: fetchObjetos,
    crearObjetoDesdeCatalogo,
    reemplazarObjetoDesdeCatalogo,
    reclamarObjeto,
    liberarObjeto,
    actualizarTransformacionObjeto,
    moverObjeto,
    rotarObjeto,
    eliminarObjeto,
    duplicarObjetos,
    restaurarObjeto,
    guardarSpawnPersonal,
  };
}
