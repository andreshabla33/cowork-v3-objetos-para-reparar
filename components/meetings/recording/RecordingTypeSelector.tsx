/**
 * RecordingTypeSelector v2.0 - Selector de tipo de grabación con UX 2026
 * 
 * Características UX 2026:
 * - Micro-interacciones avanzadas con motion design
 * - Interfaces adaptativas según cargo del usuario
 * - Diseño emocional con feedback visual
 * - Minimalismo con profundidad y capas
 * - Accesibilidad first
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  TipoGrabacionDetallado, 
  CargoLaboral,
  type ConfiguracionGrabacion,
  CONFIGURACIONES_GRABACION_DETALLADO,
  getTiposGrabacionDisponibles,
  puedeIniciarGrabacionConAnalisis,
  INFO_CARGOS,
} from './types/analysis';

interface RecordingTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tipo: TipoGrabacionDetallado, conAnalisis: boolean) => void;
  cargoUsuario: CargoLaboral;
}

export const RecordingTypeSelector: React.FC<RecordingTypeSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  cargoUsuario,
}) => {
  const [selectedType, setSelectedType] = useState<TipoGrabacionDetallado | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hoveredType, setHoveredType] = useState<TipoGrabacionDetallado | null>(null);

  // Tipos disponibles según cargo
  const tiposDisponibles = useMemo(() => 
    getTiposGrabacionDisponibles(cargoUsuario), 
    [cargoUsuario]
  );
  
  const puedeAnalizar = useMemo(() => 
    puedeIniciarGrabacionConAnalisis(cargoUsuario),
    [cargoUsuario]
  );

  // Animación de entrada
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTypeClick = (tipo: TipoGrabacionDetallado) => {
    const config = CONFIGURACIONES_GRABACION_DETALLADO[tipo];
    setSelectedType(tipo);
    
    if (config.requiereDisclaimer) {
      setShowDisclaimer(true);
      setDisclaimerAccepted(false);
    } else {
      onSelect(tipo, true);
      resetState();
    }
  };

  const handleDisclaimerAccept = () => {
    if (selectedType) {
      onSelect(selectedType, true);
      resetState();
    }
  };

  const handleDisclaimerCancel = () => {
    setShowDisclaimer(false);
    setSelectedType(null);
    setDisclaimerAccepted(false);
  };

  const handleGrabarSinAnalisis = () => {
    // Grabación simple sin análisis conductual
    onSelect('equipo', false);
    resetState();
  };

  const resetState = () => {
    setSelectedType(null);
    setShowDisclaimer(false);
    setDisclaimerAccepted(false);
    setHoveredType(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Modal de disclaimer para RRHH
  if (showDisclaimer && selectedType) {
    const config = CONFIGURACIONES_GRABACION_DETALLADO[selectedType];
    
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl max-w-lg w-full border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className={`p-4 bg-gradient-to-r ${config.color}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{config.icono}</span>
              <div>
                <h3 className="text-white font-bold text-lg">{config.titulo}</h3>
                <p className="text-white/80 text-sm">Análisis conductual</p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-5">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
              <pre className="text-amber-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {config.disclaimerTexto}
              </pre>
            </div>

            {/* Checkbox de aceptación */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  checked={disclaimerAccepted}
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  disclaimerAccepted 
                    ? 'bg-blue-600 border-blue-600' 
                    : 'border-white/30 group-hover:border-white/50'
                }`}>
                  {disclaimerAccepted && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-white/80 text-sm">
                Confirmo que el participante ha sido informado y ha dado su consentimiento para el análisis conductual
              </span>
            </label>
          </div>

          {/* Botones */}
          <div className="p-4 border-t border-white/10 flex gap-3 justify-end">
            <button
              onClick={handleDisclaimerCancel}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDisclaimerAccept}
              disabled={!disclaimerAccepted}
              className={`px-4 py-2 rounded-lg text-white text-sm transition-all flex items-center gap-2 ${
                disclaimerAccepted
                  ? 'bg-blue-600 hover:bg-blue-500 cursor-pointer'
                  : 'bg-white/10 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-lg">🔴</span>
              Iniciar Grabación
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Selector principal de tipo
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl max-w-2xl w-full border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">¿Qué tipo de reunión vas a grabar?</h3>
            <p className="text-white/60 text-sm">Selecciona para optimizar el análisis conductual</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Opciones */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.values(CONFIGURACIONES_GRABACION_DETALLADO) as ConfiguracionGrabacion[]).map((config) => (
            <button
              key={config.tipo}
              onClick={() => handleTypeClick(config.tipo)}
              className={`group relative p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-gradient-to-br ${config.color} hover:border-transparent transition-all duration-300 text-left`}
            >
              {/* Icono */}
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">
                {config.icono}
              </div>
              
              {/* Título */}
              <h4 className="text-white font-bold text-lg mb-1">
                {config.titulo}
              </h4>
              
              {/* Descripción */}
              <p className="text-white/60 group-hover:text-white/80 text-sm mb-3">
                {config.descripcion}
              </p>

              {/* Métricas preview */}
              <div className="flex flex-wrap gap-1">
                {config.metricas.slice(0, 3).map((metrica, i) => (
                  <span 
                    key={i}
                    className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/50 group-hover:text-white/70"
                  >
                    {metrica.replace(/_/g, ' ')}
                  </span>
                ))}
                {config.metricas.length > 3 && (
                  <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/50">
                    +{config.metricas.length - 3} más
                  </span>
                )}
              </div>

              {/* Badge de disclaimer */}
              {config.requiereDisclaimer && (
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1">
                    <span>⚠️</span>
                    Requiere consentimiento
                  </span>
                </div>
              )}

              {/* Hover indicator */}
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-2xl">→</span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-white/10 bg-white/5">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <span>🔒</span>
            <span>Todo el análisis se procesa localmente en tu navegador. No se envían datos biométricos a servidores externos.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingTypeSelector;
