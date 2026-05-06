/**
 * @module presentation/hooks/customizer/useAvatarCatalog
 * @description Hook para gestionar el catálogo de avatares y objetos en el customizador 3D.
 * Orquesta casos de uso de dominio (CargarCatalogos, CambiarAvatar, CapturarThumbnail, ReportarModeloInvalido)
 * y abstrae la lógica de Supabase del componente.
 *
 * Clean Architecture: Adapter entre la capa de presentación (React) y la de aplicación.
 * Inyección de dependencias a nivel de módulo (singleton).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { logger } from '@/lib/logger';
import { AvatarCatalogSupabaseRepository } from '@/src/core/infrastructure/adapters/AvatarCatalogSupabaseRepository';
import { CargarCatalogosUseCase } from '@/src/core/application/usecases/CargarCatalogosUseCase';
import { CambiarAvatarUseCase } from '@/src/core/application/usecases/CambiarAvatarUseCase';
import { ObtenerAnimacionesAvatarUseCase } from '@/src/core/application/usecases/ObtenerAnimacionesAvatarUseCase';
import { CapturarThumbnailUseCase, TipoThumbnail } from '@/src/core/application/usecases/CapturarThumbnailUseCase';
import { ReportarModeloInvalidoUseCase } from '@/src/core/application/usecases/ReportarModeloInvalidoUseCase';
import type {
  AvatarModelData,
  AnimacionAvatarData,
} from '@/src/core/domain/ports/IAvatarCatalogRepository';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import type { Avatar3DConfig } from '@/components/avatar3d/shared';

const log = logger.child('avatar-catalog');

// Singleton DI container
const repositorio = new AvatarCatalogSupabaseRepository();
const cargarCatalogosUseCase = new CargarCatalogosUseCase(repositorio);
const cambiarAvatarUseCase = new CambiarAvatarUseCase(repositorio);
const obtenerAnimacionesUseCase = new ObtenerAnimacionesAvatarUseCase(repositorio);
const capturarThumbnailUseCase = new CapturarThumbnailUseCase(repositorio);
const reportarModeloInvalidoUseCase = new ReportarModeloInvalidoUseCase(repositorio);

// Cache para evitar recargas innecesarias
const previewAvatarConfigCache = new Map<string, Promise<Avatar3DConfig>>();
const preloadedImageUrls = new Set<string>();

/**
 * Crea la configuración base de un avatar para preview.
 */
const createBasePreviewAvatarConfig = (avatar: AvatarModelData): Avatar3DConfig => ({
  id: avatar.id,
  nombre: avatar.nombre,
  modelo_url: avatar.modelo_url,
  escala: parseFloat(avatar.escala) || 1,
  textura_url: avatar.textura_url || null,
});

/**
 * Precarga una imagen en el navegador de forma asincrónica.
 */
const preloadImageAsset = (url?: string | null): void => {
  if (!url || typeof Image === 'undefined' || preloadedImageUrls.has(url)) return;
  preloadedImageUrls.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = url;
};

export interface AvatarCatalogState {
  // Catálogos
  availableAvatars: AvatarModelData[];
  availableObjects: CatalogoObjeto3D[];
  equippedAvatarId: string | null;

  // Selecciones
  selectedAvatarId: string | null;
  selectedObjectId: string | null;
  /**
   * Categoría seleccionada en el filtro de objetos. Valores canónicos:
   *  - 'todos'    → no filtrar (devuelve todos los objetos)
   *  - 'avatares' → vista avatares
   *  - 'objetos'  → vista objetos generales
   *  - {string}   → categoría específica emitida por el catálogo Supabase.
   * Plan 34919757 — Domain drift resolved.
   */
  selectedCategory: string;

  // Estados de carga
  loadingAvatars: boolean;
  loadingObjects: boolean;
  avatarSaved: boolean;

  // Preview y configuración
  previewConfig: Avatar3DConfig | null;
  invalidObjectModelIds: Set<string>;

  // Captura de thumbnail
  isCapturing: boolean;
  captureRequest: { type: 'avatar' | 'objeto'; id: string } | null;
}

export interface UseAvatarCatalogActions {
  // Carga inicial
  loadCatalogs: () => Promise<void>;

  // Selección de avatares
  selectAvatar: (avatarId: string) => Promise<void>;
  selectObject: (objectId: string) => void;
  selectCategory: (category: string) => void;

  // Avatar equipado
  changeEquippedAvatar: (avatarId: string) => Promise<void>;

  // Thumbnails
  requestThumbnailCapture: (type: 'avatar' | 'objeto', id: string) => void;
  captureThumbnail: (blob: Blob) => Promise<void>;
  cancelThumbnailCapture: () => void;

  // Manejo de errores
  reportInvalidObjectModel: (objectId: string, deactivate?: boolean) => Promise<void>;

  // Reset
  resetState: () => void;
}

export interface UseAvatarCatalogReturn extends AvatarCatalogState, UseAvatarCatalogActions {}

/**
 * Hook principal para gestionar el catálogo de avatares y objetos del customizador 3D.
 * Carga catálogos en paralelo, maneja selecciones, captura de thumbnails y errores de modelos.
 */
export const useAvatarCatalog = (): UseAvatarCatalogReturn => {
  const { currentUser, session, setAvatar3DConfig } = useStore(
    useShallow(s => ({
      currentUser: s.currentUser,
      session: s.session,
      setAvatar3DConfig: s.setAvatar3DConfig,
    }))
  );

  // Estado
  const [availableAvatars, setAvailableAvatars] = useState<AvatarModelData[]>([]);
  const [availableObjects, setAvailableObjects] = useState<CatalogoObjeto3D[]>([]);
  const [equippedAvatarId, setEquippedAvatarId] = useState<string | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('avatares');
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<Avatar3DConfig | null>(null);
  const [invalidObjectModelIds, setInvalidObjectModelIds] = useState<Set<string>>(new Set());
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureRequest, setCaptureRequest] = useState<{ type: 'avatar' | 'objeto'; id: string } | null>(null);

  const userIdRef = useRef<string | null>(null);

  // Determinar userId
  useEffect(() => {
    if (session?.user?.id) {
      userIdRef.current = session.user.id;
    } else if (currentUser?.id && currentUser.id !== 'guest') {
      userIdRef.current = currentUser.id;
    }
  }, [session?.user?.id, currentUser?.id]);

  /**
   * Carga todos los catálogos en paralelo.
   */
  const loadCatalogs = useCallback(async (): Promise<void> => {
    if (!userIdRef.current) {
      log.warn('loadCatalogs: userId no disponible');
      return;
    }

    try {
      setLoadingAvatars(true);
      setLoadingObjects(true);

      const { avatares, objetos, avatarEquipadoId } = await cargarCatalogosUseCase.ejecutar(
        userIdRef.current
      );

      setAvailableAvatars(avatares);
      setAvailableObjects(objetos);
      setEquippedAvatarId(avatarEquipadoId);

      // Precarga de imágenes — avatares
      avatares.forEach((avatar) => {
        preloadImageAsset(avatar.thumbnail_url);
        preloadImageAsset(avatar.modelo_url);
        preloadImageAsset(avatar.textura_url);
      });

      // Precarga de imágenes y modelos GLTF — objetos de catálogo.
      //
      // CRITICAL FIX: Los avatares se precargaban aquí pero los objetos NO,
      // causando que el modal mostrara objetos vacíos hasta que el usuario
      // hacía clic en un botón de categoría (Mobiliario/Construcción/Todos).
      // El clic en categoría disparaba un re-render que finalmente cargaba
      // los thumbnails. Ahora precargamos thumbnails y modelos GLTF de objetos
      // en paralelo con los avatares para que estén visibles inmediatamente.
      //
      // Ref: drei useGLTF.preload — https://drei.docs.pmnd.rs/loaders/gltf#useGLTF
      objetos.forEach((objeto) => {
        preloadImageAsset(objeto.thumbnail_url);
        // Precargar modelo GLTF si tiene URL válida (no builtin)
        if (objeto.modelo_url && !objeto.modelo_url.startsWith('builtin:')) {
          try {
            useGLTF.preload(objeto.modelo_url);
          } catch {
            // Ignorar errores de precarga — el modelo se cargará on-demand
          }
        }
      });

      // Si existe avatar equipado, seleccionarlo
      if (avatarEquipadoId) {
        const equipped = avatares.find((a) => a.id === avatarEquipadoId);
        if (equipped) {
          setSelectedAvatarId(avatarEquipadoId);
          setPreviewConfig(createBasePreviewAvatarConfig(equipped));

          // Precargar animaciones
          try {
            const animaciones = await obtenerAnimacionesUseCase.ejecutar(avatarEquipadoId);
            if (animaciones.length > 0) {
              useGLTF.preload(animaciones[0].url);
            }
          } catch (err) {
            log.warn('Error precargando animaciones para avatar equipado', {
              avatarId: avatarEquipadoId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      log.info('Catálogos cargados exitosamente', {
        avatarCount: avatares.length,
        objectCount: objetos.length,
      });
    } catch (err) {
      log.error('Error cargando catálogos', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoadingAvatars(false);
      setLoadingObjects(false);
    }
  }, []);

  /**
   * Selecciona un avatar y carga su preview config con animaciones.
   */
  const selectAvatar = useCallback(
    async (avatarId: string): Promise<void> => {
      try {
        const avatar = availableAvatars.find((a) => a.id === avatarId);
        if (!avatar) {
          log.warn('selectAvatar: avatar no encontrado', { avatarId });
          return;
        }

        setSelectedAvatarId(avatarId);

        // Buscar config en cache o crear nueva
        if (!previewAvatarConfigCache.has(avatarId)) {
          const configPromise = (async (): Promise<Avatar3DConfig> => {
            const baseConfig = createBasePreviewAvatarConfig(avatar);
            try {
              const animaciones = await obtenerAnimacionesUseCase.ejecutar(avatarId);
              if (animaciones.length > 0) {
                useGLTF.preload(animaciones[0].url);
              }
            } catch (err) {
              log.warn('Error cargando animaciones para avatar', {
                avatarId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            return baseConfig;
          })();

          previewAvatarConfigCache.set(avatarId, configPromise);
        }

        const config = await previewAvatarConfigCache.get(avatarId)!;
        setPreviewConfig(config);
        preloadImageAsset(avatar.thumbnail_url);
      } catch (err) {
        log.error('Error seleccionando avatar', {
          avatarId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [availableAvatars]
  );

  /**
   * Selecciona un objeto de catálogo.
   */
  const selectObject = useCallback((objectId: string): void => {
    const objeto = availableObjects.find((o) => o.id === objectId);
    if (objeto) {
      setSelectedObjectId(objectId);
      preloadImageAsset(objeto.thumbnail_url);
    }
  }, [availableObjects]);

  /**
   * Cambia la categoría de visualización.
   */
  const selectCategory = useCallback((category: string): void => {
    setSelectedCategory(category);
  }, []);

  /**
   * Cambia el avatar equipado del usuario.
   */
  const changeEquippedAvatar = useCallback(
    async (avatarId: string): Promise<void> => {
      if (!userIdRef.current) {
        log.warn('changeEquippedAvatar: userId no disponible');
        return;
      }

      try {
        setAvatarSaved(false);

        // 1. Actualizar preview inmediatamente (UX: feedback visual instantáneo)
        //    selectAvatar carga el modelo 3D en el preview canvas.
        await selectAvatar(avatarId);

        // 2. Persistir en BD (async, no bloquea el preview)
        const success = await cambiarAvatarUseCase.ejecutar(userIdRef.current, avatarId);

        if (success) {
          setEquippedAvatarId(avatarId);
          setAvatarSaved(true);

          // 3. Sync avatar3DConfig al store global para que la escena 3D
          //    use el nuevo avatar inmediatamente (sin requerir re-bootstrap).
          const cachedConfig = previewAvatarConfigCache.has(avatarId)
            ? await previewAvatarConfigCache.get(avatarId)
            : null;
          if (cachedConfig) {
            setAvatar3DConfig(cachedConfig);
            log.info('Avatar equipado cambiado exitosamente — store synced', { avatarId });
          } else {
            log.info('Avatar equipado cambiado exitosamente', { avatarId });
          }

          // Reset después de 2 segundos
          setTimeout(() => setAvatarSaved(false), 2000);
        } else {
          log.warn('Fallo al cambiar avatar equipado', { avatarId });
        }
      } catch (err) {
        log.error('Error cambiando avatar equipado', {
          avatarId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [selectAvatar]
  );

  /**
   * Solicita captura de thumbnail para avatar u objeto.
   */
  const requestThumbnailCapture = useCallback(
    (type: 'avatar' | 'objeto', id: string): void => {
      setCaptureRequest({ type, id });
      setIsCapturing(true);
    },
    []
  );

  /**
   * Captura y sube el thumbnail.
   */
  const captureThumbnail = useCallback(
    async (blob: Blob): Promise<void> => {
      if (!captureRequest) {
        log.warn('captureThumbnail: no hay captura en progreso');
        return;
      }

      try {
        const { type, id } = captureRequest;
        const tipoThumbnail = type === 'avatar' ? TipoThumbnail.AVATAR : TipoThumbnail.OBJETO;

        const publicUrl = await capturarThumbnailUseCase.ejecutar(id, blob, tipoThumbnail);

        if (publicUrl) {
          log.info('Thumbnail capturado y subido exitosamente', { id, type, publicUrl });

          // Actualizar catálogo local con la nueva URL
          if (type === 'avatar') {
            setAvailableAvatars((prev) =>
              prev.map((a) => (a.id === id ? { ...a, thumbnail_url: publicUrl } : a))
            );
          } else {
            setAvailableObjects((prev) =>
              prev.map((o) => (o.id === id ? { ...o, thumbnail_url: publicUrl } : o))
            );
          }
        } else {
          log.warn('Fallo al subir thumbnail', { id, type });
        }
      } catch (err) {
        log.error('Error capturando thumbnail', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setCaptureRequest(null);
        setIsCapturing(false);
      }
    },
    [captureRequest]
  );

  /**
   * Cancela la captura de thumbnail en progreso.
   */
  const cancelThumbnailCapture = useCallback((): void => {
    setCaptureRequest(null);
    setIsCapturing(false);
  }, []);

  /**
   * Reporta un modelo 3D inválido y lo limpia del catálogo.
   */
  const reportInvalidObjectModel = useCallback(
    async (objectId: string, deactivate: boolean = false): Promise<void> => {
      try {
        await reportarModeloInvalidoUseCase.ejecutar(objectId, deactivate);

        setInvalidObjectModelIds((prev) => {
          const newSet = new Set(prev);
          newSet.add(objectId);
          return newSet;
        });

        log.info('Modelo inválido reportado y limpiado', { objectId, deactivate });
      } catch (err) {
        log.error('Error reportando modelo inválido', {
          objectId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    []
  );

  /**
   * Reset completo del estado.
   */
  const resetState = useCallback((): void => {
    setAvailableAvatars([]);
    setAvailableObjects([]);
    setEquippedAvatarId(null);
    setSelectedAvatarId(null);
    setSelectedObjectId(null);
    setSelectedCategory('avatares');
    setPreviewConfig(null);
    setInvalidObjectModelIds(new Set());
    setCaptureRequest(null);
    setIsCapturing(false);
    previewAvatarConfigCache.clear();
  }, []);

  // Carga inicial de catálogos
  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  return {
    // Estado
    availableAvatars,
    availableObjects,
    equippedAvatarId,
    selectedAvatarId,
    selectedObjectId,
    selectedCategory,
    loadingAvatars,
    loadingObjects,
    avatarSaved,
    previewConfig,
    invalidObjectModelIds,
    isCapturing,
    captureRequest,

    // Acciones
    loadCatalogs,
    selectAvatar,
    selectObject,
    selectCategory,
    changeEquippedAvatar,
    requestThumbnailCapture,
    captureThumbnail,
    cancelThumbnailCapture,
    reportInvalidObjectModel,
    resetState,
  };
};
