/**
 * ConsentimientoPendiente - Modal para que el evaluado acepte/rechace grabación
 * Se muestra cuando alguien solicita grabar una entrevista o one-to-one
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { recordingRepository } from '@/core/infrastructure/adapters/RecordingSupabaseRepository';
import { useUserStore } from '@/modules/user/state/useUserStore';

interface SolicitudConsentimiento {
  grabacion_id: string;
  tipo_grabacion: string;
  creador_id: string;
  creador_nombre: string;
  espacio_id: string;
  titulo?: string;
}

interface ConsentimientoPendienteProps {
  onConsentimientoRespondido?: (grabacionId: string, acepto: boolean) => void;
}

const TIPO_LABELS: Record<string, { titulo: string; descripcion: string; icono: string }> = {
  rrhh_entrevista: {
    titulo: 'Entrevista de Candidato',
    descripcion: 'Se analizarán tus expresiones faciales y lenguaje corporal para evaluar tu candidatura.',
    icono: '🎯',
  },
  rrhh_one_to_one: {
    titulo: 'Reunión One-to-One',
    descripcion: 'Se realizará un análisis de tu comunicación y engagement durante la sesión.',
    icono: '🤝',
  },
};

export const ConsentimientoPendiente: React.FC<ConsentimientoPendienteProps> = ({
  onConsentimientoRespondido,
}) => {
  const session = useUserStore(s => s.session);
  const [solicitud, setSolicitud] = useState<SolicitudConsentimiento | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const solicitudRef = useRef<SolicitudConsentimiento | null>(null);
  const isFetchingRef = useRef(false);
  const lastSolicitudIdRef = useRef<string | null>(null);

  useEffect(() => {
    solicitudRef.current = solicitud;
    if (!solicitud) {
      lastSolicitudIdRef.current = null;
    }
  }, [solicitud]);

  // Escuchar notificaciones de consentimiento
  useEffect(() => {
    if (!session?.user?.id) return;

    /**
     * Fetch pending consent notifications from Supabase.
     * Called once on mount and by realtime subscription — NO polling.
     * Supabase Realtime docs: "postgres_changes delivers INSERT/UPDATE/DELETE
     * events in real-time; polling is only needed when realtime is unavailable."
     */
    const cargarSolicitudesPendientes = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        const notificaciones = await recordingRepository.listarSolicitudesConsentimientoPendientes(session.user.id);
        if (notificaciones.length === 0) return;

        const notif = notificaciones[0];
        if (solicitudRef.current?.grabacion_id === notif.entidad_id || lastSolicitudIdRef.current === notif.entidad_id) {
          return;
        }

        const datos = notif.datos_extra;
        const grabacion = await recordingRepository.obtenerEstadoConsentimientoGrabacion(notif.entidad_id);

        if (grabacion && !grabacion.consentimiento_evaluado) {
          lastSolicitudIdRef.current = notif.entidad_id;
          setSolicitud({
            grabacion_id: notif.entidad_id,
            tipo_grabacion: datos?.tipo_grabacion || 'rrhh_entrevista',
            creador_id: datos?.creador_id || '',
            creador_nombre: datos?.creador_nombre || 'Alguien',
            espacio_id: notif.espacio_id,
            titulo: notif.titulo ?? undefined,
          });
        }
      } catch (err) {
        console.warn('[Consentimiento] Query error:', (err as Error).message);
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Initial fetch only — no polling interval
    cargarSolicitudesPendientes();

    // Realtime subscription handles all subsequent notifications
    return recordingRepository.suscribirNotificacionesUsuario(session.user.id, 'consentimiento-pendiente', async (notif) => {
      if (notif.tipo !== 'consentimiento_grabacion' || notif.leida) return;
      if (solicitudRef.current?.grabacion_id === notif.entidad_id || lastSolicitudIdRef.current === notif.entidad_id) {
        return;
      }
      const grabacion = await recordingRepository.obtenerEstadoConsentimientoGrabacion(notif.entidad_id);
      if (grabacion?.consentimiento_evaluado) return;

      const datos = notif.datos_extra as { tipo_grabacion?: string; creador_id?: string; creador_nombre?: string } | null;
      lastSolicitudIdRef.current = notif.entidad_id;
      setSolicitud({
        grabacion_id: notif.entidad_id,
        tipo_grabacion: datos?.tipo_grabacion || 'rrhh_entrevista',
        creador_id: datos?.creador_id || '',
        creador_nombre: datos?.creador_nombre || 'Alguien',
        espacio_id: notif.espacio_id,
        titulo: notif.titulo ?? undefined,
      });
    });
  }, [session?.user?.id]);

  const responderConsentimiento = useCallback(async (acepta: boolean) => {
    if (!solicitud) return;

    console.log('🔄 Respondiendo consentimiento:', { grabacion_id: solicitud.grabacion_id, acepta });
    setIsResponding(true);
    try {
      await recordingRepository.responderConsentimientoGrabacion(solicitud.grabacion_id, acepta);

      // Marcar notificación como leída (best-effort, no rompe el flujo)
      try {
        await recordingRepository.marcarNotificacionConsentimientoLeida(solicitud.grabacion_id);
      } catch (updateErr) {
        console.warn('⚠️ Error marcando notificación como leída:', updateErr);
      }

      console.log('✅ Consentimiento respondido exitosamente');
      onConsentimientoRespondido?.(solicitud.grabacion_id, acepta);
      setSolicitud(null);
    } catch (err) {
      console.error('❌ Error respondiendo consentimiento:', err);
      // Cerrar modal de todos modos después de un error
      setTimeout(() => {
        setSolicitud(null);
      }, 2000);
    } finally {
      setIsResponding(false);
    }
  }, [solicitud, onConsentimientoRespondido]);

  if (!solicitud) return null;

  const tipoInfo = TIPO_LABELS[solicitud.tipo_grabacion] || TIPO_LABELS.rrhh_entrevista;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/60 border border-[rgba(46,150,245,0.14)] rounded-3xl p-6 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Header con icono grande */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg">
            <span className="text-4xl">{tipoInfo.icono}</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Solicitud de Grabación
          </h2>
          <p className="text-[#4A6485] text-sm">
            Se requiere tu consentimiento para continuar
          </p>
        </div>

        {/* Información del solicitante */}
        <div className="bg-white/500 rounded-2xl p-4 mb-5">
          <p className="text-white text-center">
            <span className="font-bold text-[#1E86E5]">{solicitud.creador_nombre}</span>
            {' '}desea grabarte en una sesión de{' '}
            <span className="font-bold text-amber-400">{tipoInfo.titulo}</span>
          </p>
        </div>

        {/* Disclaimer importante */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">⚠️</span>
            <div>
              <h4 className="text-amber-300 font-bold mb-2">Información Importante</h4>
              <p className="text-amber-200/90 text-sm leading-relaxed">
                {tipoInfo.descripcion}
              </p>
              <ul className="mt-3 space-y-1.5 text-amber-200/80 text-xs">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                  El análisis incluye expresiones faciales y lenguaje corporal
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                  Los resultados serán visibles solo para {solicitud.creador_nombre}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                  Podrás acceder a la transcripción posteriormente
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Lo que recibirás */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6">
          <h5 className="text-green-400 font-semibold text-sm mb-2">✓ Si aceptas, tendrás acceso a:</h5>
          <ul className="text-green-300/80 text-xs space-y-1">
            <li>• Transcripción completa de la reunión</li>
            <li>• Resumen de los puntos clave discutidos</li>
          </ul>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3">
          <button
            onClick={() => responderConsentimiento(false)}
            disabled={isResponding}
            className="flex-1 px-5 py-3 bg-white hover:bg-[rgba(46,150,245,0.08)] text-[#1B3A5C] rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          >
            {isResponding ? '...' : '❌ Rechazar'}
          </button>
          <button
            onClick={() => responderConsentimiento(true)}
            disabled={isResponding}
            className="flex-1 px-5 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-green-500/25"
          >
            {isResponding ? 'Procesando...' : '✓ Aceptar Grabación'}
          </button>
        </div>

        {/* Nota de privacidad */}
        <p className="text-center text-[#4A6485] text-xs mt-4">
          🔒 Tu decisión se registrará de forma segura
        </p>
      </div>
    </div>
  );
};

export default ConsentimientoPendiente;
