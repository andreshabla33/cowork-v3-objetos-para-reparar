/**
 * @module presentation/hooks/customizer/useProfileEditor
 * @description Hook para gestionar la edición del perfil de usuario en el customizador 3D.
 * Orquesta casos de uso de dominio (GestionarPerfil) y abstrae la lógica de Supabase.
 *
 * Clean Architecture: Adapter entre la capa de presentación (React) y la de aplicación.
 * Inyección de dependencias a nivel de módulo (singleton).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import { ProfileSupabaseRepository } from '@/src/core/infrastructure/adapters/ProfileSupabaseRepository';
import { GestionarPerfilUseCase } from '@/src/core/application/usecases/GestionarPerfilUseCase';

const log = logger.child('profile-editor');

// Singleton DI container
const repositorio = new ProfileSupabaseRepository();
const perfilUseCase = new GestionarPerfilUseCase(repositorio);

export interface ProfileEditorState {
  profilePhoto: string | null;
  displayName: string;
  uploading: boolean;
  saved: boolean;
}

export interface UseProfileEditorActions {
  // Foto de perfil
  uploadProfilePhoto: (file: File) => Promise<void>;
  removeProfilePhoto: () => Promise<void>;

  // Nombre
  updateDisplayName: (name: string) => Promise<void>;

  // Reset
  resetState: () => void;
}

export interface UseProfileEditorReturn extends ProfileEditorState, UseProfileEditorActions {}

export interface UseProfileEditorOptions {
  /**
   * Callback ejecutado después de guardar cambios exitosamente.
   */
  onClose?: () => void;
}

/**
 * Hook para editar el perfil de usuario (foto y nombre).
 * Sincroniza cambios con Zustand store automáticamente.
 */
export const useProfileEditor = (options: UseProfileEditorOptions = {}): UseProfileEditorReturn => {
  const { currentUser, session } = useStore();
  const { onClose } = options;

  // Estado
  const [profilePhoto, setProfilePhoto] = useState<string | null>(currentUser?.profilePhoto || null);
  const [displayName, setDisplayName] = useState<string>(currentUser?.name || '');
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const userIdRef = useRef<string | null>(null);

  // Determinar userId
  useEffect(() => {
    if (session?.user?.id) {
      userIdRef.current = session.user.id;
    } else if (currentUser?.id && currentUser.id !== 'guest') {
      userIdRef.current = currentUser.id;
    }

    // Sincronizar foto inicial
    setProfilePhoto(currentUser?.profilePhoto || null);
    setDisplayName(currentUser?.name || '');
  }, [session?.user?.id, currentUser?.id, currentUser?.profilePhoto, currentUser?.name]);

  /**
   * Sube una foto de perfil para el usuario.
   */
  const uploadProfilePhoto = useCallback(
    async (file: File): Promise<void> => {
      if (!userIdRef.current) {
        log.warn('uploadProfilePhoto: userId no disponible');
        return;
      }

      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        log.warn('uploadProfilePhoto: tipo de archivo inválido', { fileType: file.type });
        return;
      }

      // Validar tamaño (máx 5MB)
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        log.warn('uploadProfilePhoto: archivo demasiado grande', { fileSize: file.size });
        return;
      }

      try {
        setUploading(true);
        setSaved(false);

        const publicUrl = await perfilUseCase.subirFotoPerfil(userIdRef.current, file);

        if (publicUrl) {
          setProfilePhoto(publicUrl);

          // Actualizar Zustand store
          useStore.setState((state) => ({
            currentUser: {
              ...state.currentUser,
              profilePhoto: publicUrl,
            },
          }));

          setSaved(true);
          log.info('Foto de perfil subida exitosamente', { userId: userIdRef.current });

          // Reset después de 2 segundos
          setTimeout(() => setSaved(false), 2000);
        } else {
          log.warn('Fallo al subir foto de perfil', { userId: userIdRef.current });
        }
      } catch (err) {
        log.error('Error subiendo foto de perfil', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setUploading(false);
      }
    },
    []
  );

  /**
   * Elimina la foto de perfil del usuario.
   */
  const removeProfilePhoto = useCallback(async (): Promise<void> => {
    if (!userIdRef.current) {
      log.warn('removeProfilePhoto: userId no disponible');
      return;
    }

    try {
      setUploading(true);
      setSaved(false);

      const success = await perfilUseCase.eliminarFotoPerfil(userIdRef.current);

      if (success) {
        setProfilePhoto(null);

        // Actualizar Zustand store
        useStore.setState((state) => ({
          currentUser: {
            ...state.currentUser,
            profilePhoto: null,
          },
        }));

        setSaved(true);
        log.info('Foto de perfil eliminada exitosamente', { userId: userIdRef.current });

        // Reset después de 2 segundos
        setTimeout(() => setSaved(false), 2000);
      } else {
        log.warn('Fallo al eliminar foto de perfil', { userId: userIdRef.current });
      }
    } catch (err) {
      log.error('Error eliminando foto de perfil', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Actualiza el nombre para mostrar del usuario.
   */
  const updateDisplayName = useCallback(
    async (name: string): Promise<void> => {
      if (!userIdRef.current) {
        log.warn('updateDisplayName: userId no disponible');
        return;
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        log.warn('updateDisplayName: nombre vacío');
        return;
      }

      // Validar longitud
      const MIN_LENGTH = 2;
      const MAX_LENGTH = 50;
      if (trimmedName.length < MIN_LENGTH || trimmedName.length > MAX_LENGTH) {
        log.warn('updateDisplayName: nombre fuera de rango válido', {
          length: trimmedName.length,
          min: MIN_LENGTH,
          max: MAX_LENGTH,
        });
        return;
      }

      try {
        setDisplayName(trimmedName);
        setSaved(false);

        const success = await perfilUseCase.guardarNombre(userIdRef.current, trimmedName);

        if (success) {
          // Actualizar Zustand store
          useStore.setState((state) => ({
            currentUser: {
              ...state.currentUser,
              name: trimmedName,
            },
          }));

          setSaved(true);
          log.info('Nombre de perfil actualizado exitosamente', { userId: userIdRef.current });

          // Reset después de 2 segundos
          setTimeout(() => setSaved(false), 2000);

          // Ejecutar callback si se proporciona
          if (onClose) {
            setTimeout(onClose, 500);
          }
        } else {
          log.warn('Fallo al guardar nombre de perfil', { userId: userIdRef.current });
        }
      } catch (err) {
        log.error('Error actualizando nombre de perfil', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Revertir cambio local en caso de error
        setDisplayName(currentUser?.name || '');
      }
    },
    [currentUser?.name, onClose]
  );

  /**
   * Reset completo del estado.
   */
  const resetState = useCallback((): void => {
    setProfilePhoto(currentUser?.profilePhoto || null);
    setDisplayName(currentUser?.name || '');
    setSaved(false);
  }, [currentUser?.profilePhoto, currentUser?.name]);

  return {
    // Estado
    profilePhoto,
    displayName,
    uploading,
    saved,

    // Acciones
    uploadProfilePhoto,
    removeProfilePhoto,
    updateDisplayName,
    resetState,
  };
};
