'use client';

/**
 * @module components/space3d/root/VirtualSpace3DModals
 *
 * Subcomponente del root `VirtualSpace3D` que agrupa los modales del espacio:
 *   - `RecordingManager` (modo headless, se activa solo durante llamadas)
 *   - `ConsentimientoPendiente` (dialog de consentimiento de evaluación)
 *   - Modal de perfil + avatar (`AvatarCustomizer3D` envuelto en su chrome)
 *
 * ════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE — Capa de Presentation (descomposición F4)
 * ════════════════════════════════════════════════════════════════
 *
 * No contiene lógica de negocio — recibe callbacks y state por props
 * desde el root. Su única responsabilidad es el render condicional de
 * los tres modales y su chrome UI.
 *
 * Parte de la descomposición incremental del god-component de 1600+ líneas.
 */

import React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { RecordingManager } from '@/components/meetings/recording/RecordingManager';
import type { CargoLaboral } from '@/components/meetings/recording/types/analysis';
import { ConsentimientoPendiente } from '@/components/meetings/recording/ConsentimientoPendiente';
import { AvatarCustomizer3D } from '@/components/AvatarCustomizer3D';
import type { CatalogoObjeto3D } from '@/types/objetos3d';
import { logger } from '@/lib/logger';

const log = logger.child('VirtualSpace3DModals');

// ─── Contrato público ─────────────────────────────────────────────────────────

export interface VirtualSpace3DModalsProps {
  // Recording
  hasActiveCall: boolean;
  espacioId: string;
  userId: string;
  userName: string;
  stream: MediaStream | null;
  cargoUsuario: CargoLaboral | null;
  usuariosEnLlamada: Array<{ id: string; nombre: string }>;
  recordingTrigger: boolean;
  setIsRecording: (recording: boolean) => void;
  setRecordingDuration: (duration: number) => void;
  setConsentimientoAceptado: (aceptado: boolean) => void;
  setTipoGrabacionActual: (tipo: string | null) => void;
  setRecordingTrigger: Dispatch<SetStateAction<boolean>>;

  // Avatar / perfil
  showAvatarModal: boolean;
  setShowAvatarModal: (show: boolean) => void;
  handlePrepararObjeto: (catalogo: CatalogoObjeto3D) => void;
  objetoEnColocacionActivo: boolean;
  modoReemplazoActivo: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const VirtualSpace3DModals: React.FC<VirtualSpace3DModalsProps> = ({
  hasActiveCall,
  espacioId,
  userId,
  userName,
  stream,
  cargoUsuario,
  usuariosEnLlamada,
  recordingTrigger,
  setIsRecording,
  setRecordingDuration,
  setConsentimientoAceptado,
  setTipoGrabacionActual,
  setRecordingTrigger,
  showAvatarModal,
  setShowAvatarModal,
  handlePrepararObjeto,
  objetoEnColocacionActivo,
  modoReemplazoActivo,
}) => {
  return (
    <>
      {/* Recording Manager headless con análisis conductual */}
      {hasActiveCall && (
        <RecordingManager
          espacioId={espacioId}
          userId={userId}
          userName={userName}
          reunionTitulo={`Reunión ${new Date().toLocaleDateString()}`}
          stream={stream}
          cargoUsuario={cargoUsuario as CargoLaboral}
          usuariosEnLlamada={usuariosEnLlamada}
          onRecordingStateChange={(recording) => {
            setIsRecording(recording);
            if (!recording) {
              setRecordingDuration(0);
              setConsentimientoAceptado(false);
              setTipoGrabacionActual(null);
            }
          }}
          onDurationChange={(duration) => setRecordingDuration(duration)}
          onTipoGrabacionChange={(tipo) => setTipoGrabacionActual(tipo)}
          onProcessingComplete={(resultado) => {
            log.info('✅ Análisis conductual completado', {
              tipoGrabacion: resultado?.tipo_grabacion,
              analisis: resultado?.analisis,
            });
          }}
          headlessMode={true}
          externalTrigger={recordingTrigger}
          onExternalTriggerHandled={() => setRecordingTrigger(false)}
        />
      )}

      {/* Modal de consentimiento para usuarios evaluados */}
      <ConsentimientoPendiente
        onConsentimientoRespondido={(grabacionId, acepto) => {
          log.info('📝 Consentimiento respondido para grabación', {
            grabacionId,
            aceptado: acepto,
          });
        }}
      />

      {/* Modal de Avatar/Perfil - Glassmorphism 2.0 */}
      {showAvatarModal && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-2"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setShowAvatarModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAvatarModal(false);
          }}
        >
          {/* Backdrop — misma familia que el workspace (#F1F5FA, slate soft) */}
          <div
            className="absolute inset-0 bg-[#CBD5E1]/55 backdrop-blur-xl backdrop-saturate-150"
            onClick={() => setShowAvatarModal(false)}
          />

          {/* Modal — superficie clara como el resto de la app */}
          <div
            className="relative w-full max-w-[960px] h-[90vh] max-h-[720px] sm:max-h-[95vh] bg-[#F1F5FA]/96 backdrop-blur-2xl rounded-3xl sm:rounded-2xl border border-[#E3EAF2] shadow-[0_24px_64px_-12px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Acento sutil tipo glass — sky/cyan muy suaves */}
            <div className="absolute -inset-px rounded-3xl sm:rounded-2xl bg-gradient-to-r from-sky-500/[0.06] via-blue-500/[0.04] to-cyan-500/[0.05] pointer-events-none" />

            {/* Header */}
            <div className="relative flex items-center justify-between px-5 py-3 border-b border-[#E3EAF2]/90 flex-shrink-0 bg-white/50">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-sky-100/90 flex items-center justify-center border border-sky-200/80 shadow-sm shadow-sky-900/5">
                  <svg
                    className="w-3.5 h-3.5 text-sky-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-slate-800 tracking-wide">
                    Mi Perfil y Avatar
                  </h2>
                  <p className="text-[9px] text-slate-500">
                    Personaliza tu apariencia en el espacio
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="w-7 h-7 rounded-lg bg-white/70 hover:bg-slate-100 flex items-center justify-center transition-all group border border-[#E3EAF2] hover:border-sky-300/60 shadow-sm shadow-slate-900/5"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Body - AvatarCustomizer3D */}
            <div className="relative flex-1 overflow-hidden">
              <AvatarCustomizer3D
                onClose={() => setShowAvatarModal(false)}
                onPrepararObjeto={handlePrepararObjeto}
                modoColocacionActivo={objetoEnColocacionActivo}
                modoReemplazoActivo={modoReemplazoActivo}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
