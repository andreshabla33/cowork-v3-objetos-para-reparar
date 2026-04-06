/**
 * @module infrastructure/adapters/WorkspaceSupabaseRepository
 * @description Supabase implementation of IWorkspaceRepository.
 * Encapsulates all Supabase queries for workspace membership and connections.
 *
 * Clean Architecture: Infrastructure layer — depends on domain port.
 * Ref: Supabase JS v2 — from() / select() / insert() / update() / delete().
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  IWorkspaceRepository,
  MiembroEspacioData,
} from '../../domain/ports/IWorkspaceRepository';

const log = logger.child('workspace-repo');

export class WorkspaceSupabaseRepository implements IWorkspaceRepository {
  async cargarMiembroEspacio(
    usuarioId: string,
    espacioId: string
  ): Promise<MiembroEspacioData | null> {
    try {
      const { data, error } = await supabase
        .from('miembros_espacio')
        .select('empresa_id, departamento_id')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', usuarioId)
        .maybeSingle();

      if (error) {
        log.warn('Error loading miembro_espacio', {
          error: error.message,
          espacioId,
          usuarioId,
        });
        return null;
      }

      return data as MiembroEspacioData | null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading miembro_espacio', {
        error: message,
        espacioId,
        usuarioId,
      });
      return null;
    }
  }

  async cargarAutorizacionesEmpresa(
    espacioId: string,
    empresaId: string
  ): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('autorizaciones_empresa')
        .select('empresa_origen_id, empresa_destino_id, estado')
        .eq('espacio_id', espacioId)
        .eq('estado', 'aprobada');

      if (error) {
        log.warn('Error loading autorizaciones_empresa', {
          error: error.message,
          espacioId,
          empresaId,
        });
        return [];
      }

      const autorizadas = new Set<string>();
      (data || []).forEach((row: any) => {
        if (
          row.empresa_origen_id === empresaId &&
          row.empresa_destino_id
        ) {
          autorizadas.add(row.empresa_destino_id);
        }
        if (
          row.empresa_destino_id === empresaId &&
          row.empresa_origen_id
        ) {
          autorizadas.add(row.empresa_origen_id);
        }
      });

      return Array.from(autorizadas);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception loading autorizaciones_empresa', {
        error: message,
        espacioId,
        empresaId,
      });
      return [];
    }
  }

  async registrarConexion(
    usuarioId: string,
    espacioId: string,
    empresaId: string | null
  ): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('registro_conexiones')
        .insert({
          usuario_id: usuarioId,
          espacio_id: espacioId,
          empresa_id: empresaId,
        })
        .select('id')
        .single();

      if (error) {
        log.warn('Error registering connection', {
          error: error.message,
          usuarioId,
          espacioId,
        });
        throw new Error(error.message);
      }

      return data.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception registering connection', {
        error: message,
        usuarioId,
        espacioId,
      });
      throw err;
    }
  }

  async registrarDesconexion(conexionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('registro_conexiones')
        .update({ desconectado_en: new Date().toISOString() })
        .eq('id', conexionId);

      if (error) {
        log.warn('Error updating disconnection', {
          error: error.message,
          conexionId,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception updating disconnection', {
        error: message,
        conexionId,
      });
    }
  }

  async limpiarConexionesAntiguas(
    usuarioId: string,
    retentionDays: number
  ): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error } = await supabase
        .from('registro_conexiones')
        .delete()
        .eq('usuario_id', usuarioId)
        .lt('conectado_en', cutoff);

      if (error) {
        log.warn('Error cleaning old connections', {
          error: error.message,
          usuarioId,
          retentionDays,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception cleaning old connections', {
        error: message,
        usuarioId,
        retentionDays,
      });
    }
  }

  async registrarActividad(datos: {
    usuario_id: string;
    empresa_id: string | null;
    espacio_id: string;
    accion: 'conexion_espacio' | 'desconexion_espacio';
    entidad: string;
    entidad_id: string;
    descripcion: string;
    datos_extra: Record<string, unknown>;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('actividades_log')
        .insert(datos);

      if (error) {
        log.warn('Error registering activity', {
          error: error.message,
          accion: datos.accion,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception registering activity', {
        error: message,
        accion: datos.accion,
      });
    }
  }
}
