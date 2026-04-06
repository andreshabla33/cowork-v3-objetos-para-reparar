/**
 * @module hooks/workspace/useWorkspaceData
 * @description Hook for loading workspace data via Clean Architecture use cases.
 * Handles empresa membership, company authorizations, and connection tracking.
 *
 * Architecture: This hook orchestrates Clean Architecture use cases,
 * keeping Supabase details in the infrastructure layer.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
import { getSettingsSection } from '@/lib/userSettings';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

// Import use cases
import { CargarDatosEmpresaUseCase } from '@/core/application/usecases/CargarDatosEmpresaUseCase';
import { CargarAutorizacionesEmpresaUseCase } from '@/core/application/usecases/CargarAutorizacionesEmpresaUseCase';
import { RegistrarConexionEspacioUseCase } from '@/core/application/usecases/RegistrarConexionEspacioUseCase';

// Import adapters
import { WorkspaceSupabaseRepository } from '@/core/infrastructure/adapters/WorkspaceSupabaseRepository';

const log = logger.child('workspace-data');

interface UseWorkspaceDataProps {
  activeWorkspaceId: string | undefined;
  userId: string | undefined;
  session: Session | null;
  currentUserEmpresaId: string | null;
  onEmpresaIdLoaded: (empresaId: string | null) => void;
  onDepartamentoIdLoaded: (departamentoId: string | null) => void;
  onAutorizacionesLoaded: (empresas: string[]) => void;
}

interface UseWorkspaceDataReturn {
  isLoadingEmpresa: boolean;
  isLoadingAutorizaciones: boolean;
  conexionId: string | null;
}

/**
 * Custom hook that manages all workspace data loading via Clean Architecture
 */
export function useWorkspaceData({
  activeWorkspaceId,
  userId,
  session,
  currentUserEmpresaId,
  onEmpresaIdLoaded,
  onDepartamentoIdLoaded,
  onAutorizacionesLoaded,
}: UseWorkspaceDataProps): UseWorkspaceDataReturn {
  const [isLoadingEmpresa, setIsLoadingEmpresa] = useState(false);
  const [isLoadingAutorizaciones, setIsLoadingAutorizaciones] =
    useState(false);
  const [conexionId, setConexionId] = useState<string | null>(null);
  const conexionIdRef = useRef<string | null>(null);

  // Initialize repository and use cases
  const repositoryRef = useRef(new WorkspaceSupabaseRepository());
  const cargarDatosEmpresaUCRef = useRef(
    new CargarDatosEmpresaUseCase(repositoryRef.current)
  );
  const cargarAutorizacionesUCRef = useRef(
    new CargarAutorizacionesEmpresaUseCase(repositoryRef.current)
  );
  const registrarConexionUCRef = useRef(
    new RegistrarConexionEspacioUseCase(repositoryRef.current)
  );

  /**
   * Load empresa and departamento data
   */
  useEffect(() => {
    if (!activeWorkspaceId || !userId) {
      return;
    }

    let cancelado = false;
    const loadData = async () => {
      try {
        setIsLoadingEmpresa(true);
        const data = await cargarDatosEmpresaUCRef.current.execute(
          userId,
          activeWorkspaceId
        );

        if (!cancelado) {
          onEmpresaIdLoaded(data?.empresa_id ?? null);
          onDepartamentoIdLoaded(data?.departamento_id ?? null);
        }
      } catch (err: unknown) {
        if (!cancelado) {
          const message =
            err instanceof Error ? err.message : String(err);
          log.error('Error loading empresa data', {
            error: message,
            userId,
            activeWorkspaceId,
          });
          onEmpresaIdLoaded(null);
          onDepartamentoIdLoaded(null);
        }
      } finally {
        if (!cancelado) {
          setIsLoadingEmpresa(false);
        }
      }
    };

    loadData();
    return () => {
      cancelado = true;
    };
  }, [activeWorkspaceId, userId, onEmpresaIdLoaded, onDepartamentoIdLoaded]);

  /**
   * Load authorized companies
   */
  useEffect(() => {
    if (!activeWorkspaceId || !currentUserEmpresaId) {
      onAutorizacionesLoaded([]);
      return;
    }

    let cancelado = false;
    const loadAuthorizations = async () => {
      try {
        setIsLoadingAutorizaciones(true);
        const autorizadas =
          await cargarAutorizacionesUCRef.current.execute(
            activeWorkspaceId,
            currentUserEmpresaId
          );

        if (!cancelado) {
          onAutorizacionesLoaded(autorizadas);
        }
      } catch (err: unknown) {
        if (!cancelado) {
          const message =
            err instanceof Error ? err.message : String(err);
          log.error('Error loading authorizations', {
            error: message,
            activeWorkspaceId,
            currentUserEmpresaId,
          });
          onAutorizacionesLoaded([]);
        }
      } finally {
        if (!cancelado) {
          setIsLoadingAutorizaciones(false);
        }
      }
    };

    loadAuthorizations();
    return () => {
      cancelado = true;
    };
  }, [activeWorkspaceId, currentUserEmpresaId, onAutorizacionesLoaded]);

  /**
   * Register connection and handle keepalive on beforeunload
   */
  useEffect(() => {
    if (!activeWorkspaceId || !userId) {
      return;
    }

    const privacyForConn = getSettingsSection('privacy');

    if (privacyForConn.activityHistoryEnabled !== false) {
      const registerConnection = async () => {
        try {
          const id =
            await registrarConexionUCRef.current.registrarConexion(
              userId,
              activeWorkspaceId,
              null // empresaId will be null here, let the component pass it if needed
            );

          conexionIdRef.current = id;
          setConexionId(id);

          // Register activity log
          await registrarConexionUCRef.current.registrarActividad({
            usuario_id: userId,
            empresa_id: null,
            espacio_id: activeWorkspaceId,
            accion: 'conexion_espacio',
            entidad: 'espacio',
            entidad_id: activeWorkspaceId,
            descripcion: 'Usuario conectado al espacio',
            datos_extra: { origen: 'workspace-data-hook' },
          });

          // Cleanup old records
          const retDays = privacyForConn.activityRetentionDays;
          if (retDays && retDays > 0) {
            await registrarConexionUCRef.current.limpiarConexionesAntiguas(
              userId,
              retDays
            );
          }
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : String(err);
          log.warn('Error registering connection', {
            error: message,
            userId,
            activeWorkspaceId,
          });
        }
      };

      registerConnection();
    }

    // Handle beforeunload with fetch keepalive
    const handleBeforeUnload = () => {
      const id = conexionIdRef.current;
      if (id && session?.access_token) {
        const url = `${SUPABASE_URL}/rest/v1/registro_conexiones?id=eq.${id}`;
        fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            desconectado_en: new Date().toISOString(),
          }),
          keepalive: true,
        }).catch(() => {
          // Ignore keepalive errors
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Register disconnection on unmount
      const id = conexionIdRef.current;
      if (id) {
        registrarConexionUCRef.current.registrarDesconexion(id);

        registrarConexionUCRef.current.registrarActividad({
          usuario_id: userId,
          empresa_id: null,
          espacio_id: activeWorkspaceId,
          accion: 'desconexion_espacio',
          entidad: 'espacio',
          entidad_id: activeWorkspaceId,
          descripcion: 'Usuario desconectado del espacio',
          datos_extra: { origen: 'workspace-data-hook' },
        });
      }
    };
  }, [activeWorkspaceId, userId, session?.access_token]);

  return {
    isLoadingEmpresa,
    isLoadingAutorizaciones,
    conexionId,
  };
}
