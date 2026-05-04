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
          {/* Backdrop con blur profundo */}
          <div
            className="absolute inset-0 bg-[#0B2240]/35 backdrop-blur-[10px]"
            onClick={() => setShowAvatarModal(false)}
          />

          {/* Modal - Aurora GLASS */}
          <div
            className="relative w-full max-w-[960px] h-[90vh] max-h-[720px] sm:max-h-[95vh] bg-white/75 backdrop-blur-[28px] saturate-[160%] rounded-3xl sm:rounded-2xl border border-white/70 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_30px_80px_-20px_rgba(46,100,175,0.25),0_8px_32px_-10px_rgba(46,100,175,0.15)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between px-5 py-3 border-b border-[rgba(46,150,245,0.14)] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#6FBBFF] to-[#2E96F5] flex items-center justify-center shadow-[0_4px_10px_-3px_rgba(46,150,245,0.5)]">
                  <svg
                    className="w-3.5 h-3.5 text-white"
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
                  <h2 className="text-xs font-bold text-[#0B2240] tracking-wide">
                    Mi Perfil y Avatar
                  </h2>
                  <p className="text-[9px] text-[#4A6485]">
                    Personaliza tu apariencia en el espacio
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="w-7 h-7 rounded-lg bg-[rgba(46,150,245,0.08)] hover:bg-[rgba(46,150,245,0.15)] flex items-center justify-center transition-all group border border-[rgba(46,150,245,0.16)] hover:border-[rgba(46,150,245,0.3)]"
              >
                <svg
                  className="w-3.5 h-3.5 text-[#4A6485] group-hover:text-[#1E86E5] transition-colors"
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
