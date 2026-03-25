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
import { supabase } from '../../../lib/supabase';
import { 
  TipoGrabacionDetallado, 
  CargoLaboral,
  CONFIGURACIONES_GRABACION_DETALLADO,
  getTiposGrabacionDisponibles,
  puedeIniciarGrabacionConAnalisis,
  INFO_CARGOS,
  ConfiguracionGrabacion,
} from './types/analysis';

interface UsuarioEnLlamada {
  id: string;
  nombre: string;
  email?: string;
}

interface RecordingTypeSelectorV2Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tipo: TipoGrabacionDetallado, conAnalisis: boolean, evaluadoId?: string, evaluadoNombre?: string, evaluadoEmail?: string) => void;
  cargoUsuario: CargoLaboral;
  usuariosEnLlamada?: UsuarioEnLlamada[]; // Usuarios disponibles para seleccionar como evaluado
  currentUserId?: string; // ID del usuario actual (grabador)
  preselectedType?: TipoGrabacionDetallado; // Tipo preseleccionado (ir directo a disclaimer si aplica)
}

export const RecordingTypeSelectorV2: React.FC<RecordingTypeSelectorV2Props> = ({
  isOpen,
  onClose,
  onSelect,
  cargoUsuario,
  usuariosEnLlamada = [],
  currentUserId,
  preselectedType,
}) => {
  const [selectedType, setSelectedType] = useState<TipoGrabacionDetallado | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hoveredType, setHoveredType] = useState<TipoGrabacionDetallado | null>(null);
  const [selectedEvaluado, setSelectedEvaluado] = useState<string | null>(null);
  const [isSendingConsent, setIsSendingConsent] = useState(false);

  // Filtrar usuarios disponibles como evaluados (excluir al grabador)
  const evaluadosDisponibles = useMemo(() => 
    usuariosEnLlamada.filter(u => u.id !== currentUserId),
    [usuariosEnLlamada, currentUserId]
  );

  // Tipos disponibles según cargo
  const tiposDisponibles = useMemo(() => 
    getTiposGrabacionDisponibles(cargoUsuario), 
    [cargoUsuario]
  );
  
  const puedeAnalizar = useMemo(() => 
    puedeIniciarGrabacionConAnalisis(cargoUsuario),
    [cargoUsuario]
  );

  const cargoInfo = INFO_CARGOS[cargoUsuario];

  // Animación de entrada + auto-selección de tipo predefinido
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      
      // Si hay tipo preseleccionado que requiere disclaimer, ir directo
      if (preselectedType && !selectedType && !showDisclaimer) {
        const preConfig = CONFIGURACIONES_GRABACION_DETALLADO[preselectedType];
        if (preConfig?.requiereDisclaimer) {
          setSelectedType(preselectedType);
          setShowDisclaimer(true);
          setDisclaimerAccepted(false);
        }
      }
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, preselectedType]);

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

  const handleDisclaimerAccept = async () => {
    if (!selectedType) return;
    
    // Si hay evaluados disponibles y se seleccionó uno, enviar solicitud de consentimiento
    if (evaluadosDisponibles.length > 0 && selectedEvaluado) {
      // Pasar el evaluado seleccionado + su nombre
      const evaluado = evaluadosDisponibles.find(u => u.id === selectedEvaluado);
      onSelect(selectedType, true, selectedEvaluado, evaluado?.nombre, evaluado?.email);
      resetState();
    } else if (evaluadosDisponibles.length === 0) {
      // No hay otros usuarios, grabar sin evaluado específico
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
    onSelect('equipo', false);
    resetState();
  };

  const resetState = () => {
    setSelectedType(null);
    setShowDisclaimer(false);
    setDisclaimerAccepted(false);
    setHoveredType(null);
    setSelectedEvaluado(null);
    setIsSendingConsent(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Modal de disclaimer para RRHH
  if (showDisclaimer && selectedType) {
    const config = CONFIGURACIONES_GRABACION_DETALLADO[selectedType];
    
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
        <div 
          className={`bg-zinc-900 rounded-3xl max-w-lg w-full border border-white/10 shadow-2xl overflow-hidden transform transition-all duration-300 ${
            isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          {/* Header con gradiente */}
          <div className={`p-6 bg-gradient-to-r ${config.color} relative overflow-hidden`}>
            {/* Patrón de fondo sutil */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }} />
            </div>
            
            <div className="relative flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <span className="text-4xl">{config.icono}</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-xl">{config.titulo}</h3>
                <p className="text-white/80 text-sm">Análisis conductual avanzado</p>
              </div>
            </div>
          </div>

          {/* Contenido del disclaimer */}
          <div className="p-6">
            {/* Selector de persona a evaluar */}
            {evaluadosDisponibles.length > 0 ? (
              <div className="mb-5">
                <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">
                  🎯 Selecciona a la persona a evaluar
                </label>
                <div className="grid gap-2">
                  {evaluadosDisponibles.map((usuario) => (
                    <button
                      key={usuario.id}
                      onClick={() => setSelectedEvaluado(usuario.id)}
                      className={`p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                        selectedEvaluado === usuario.id
                          ? 'bg-indigo-600/30 border-2 border-indigo-500 text-white'
                          : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                        selectedEvaluado === usuario.id ? 'bg-indigo-500' : 'bg-white/10'
                      }`}>
                        {usuario.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{usuario.nombre}</p>
                        <p className="text-xs text-white/40">Recibirá solicitud de consentimiento</p>
                      </div>
                      {selectedEvaluado === usuario.id && (
                        <svg className="w-5 h-5 ml-auto text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5 text-center">
                <span className="text-2xl mb-2 block">👤</span>
                <p className="text-amber-200/90 text-sm">
                  No hay otros participantes en la llamada.
                  <br />
                  <span className="text-xs text-amber-200/60">La grabación continuará sin evaluado específico.</span>
                </p>
              </div>
            )}

            {/* Disclaimer legal */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="text-amber-300 font-semibold text-sm mb-1">Aviso Legal</h4>
                  <p className="text-amber-200/80 text-xs leading-relaxed">
                    {config.disclaimerTexto}
                  </p>
                </div>
              </div>
            </div>

            {/* Info sobre el flujo - solo si hay evaluado seleccionado */}
            {evaluadosDisponibles.length > 0 && selectedEvaluado && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl">📨</span>
                  <div>
                    <h4 className="text-green-300 font-semibold text-sm mb-1">Listo para enviar solicitud</h4>
                    <p className="text-green-200/80 text-xs leading-relaxed">
                      Al hacer clic en "Enviar Solicitud", <strong>{evaluadosDisponibles.find(u => u.id === selectedEvaluado)?.nombre}</strong> recibirá 
                      una notificación en pantalla para aceptar o rechazar la grabación.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="p-6 pt-0 flex gap-3">
            <button
              onClick={handleDisclaimerCancel}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/80 text-sm transition-all border border-white/10"
            >
              Cancelar
            </button>
            <button
              onClick={handleDisclaimerAccept}
              disabled={(evaluadosDisponibles.length > 0 && !selectedEvaluado) || isSendingConsent}
              className={`flex-1 px-4 py-3 rounded-xl text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                (evaluadosDisponibles.length === 0 || selectedEvaluado)
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-500/25 cursor-pointer'
                  : 'bg-white/10 cursor-not-allowed opacity-50'
              }`}
            >
              {isSendingConsent ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <span className="text-lg">📨</span>
              )}
              {evaluadosDisponibles.length > 0 && selectedEvaluado 
                ? `Enviar Solicitud a ${evaluadosDisponibles.find(u => u.id === selectedEvaluado)?.nombre.split(' ')[0]}`
                : 'Iniciar Grabación'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Selector principal de tipo
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
      <div 
        className={`bg-zinc-900/95 rounded-3xl max-w-3xl w-full border border-white/10 shadow-2xl overflow-hidden transform transition-all duration-300 ${
          isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-xl mb-1">Iniciar Grabación</h3>
              <p className="text-white/50 text-sm flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs">
                  {cargoInfo.icono} {cargoInfo.nombre}
                </span>
                <span>•</span>
                <span>
                  {puedeAnalizar 
                    ? `${tiposDisponibles.length} tipo${tiposDisponibles.length > 1 ? 's' : ''} de análisis disponible${tiposDisponibles.length > 1 ? 's' : ''}`
                    : 'Solo transcripción disponible'
                  }
                </span>
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 text-white/60 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Opciones con análisis conductual */}
        {puedeAnalizar && (
          <div className="p-6">
            <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px]">🧠</span>
              Con Análisis Conductual
            </h4>
            
            <div className={`grid gap-4 ${
              tiposDisponibles.length === 1 ? 'grid-cols-1 max-w-md' :
              tiposDisponibles.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
              tiposDisponibles.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
              'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            }`}>
              {tiposDisponibles.map((tipo) => {
                const config = CONFIGURACIONES_GRABACION_DETALLADO[tipo];
                const isHovered = hoveredType === tipo;
                
                return (
                  <button
                    key={tipo}
                    onClick={() => handleTypeClick(tipo)}
                    onMouseEnter={() => setHoveredType(tipo)}
                    onMouseLeave={() => setHoveredType(null)}
                    className={`group relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden ${
                      isHovered 
                        ? `border-transparent bg-gradient-to-br ${config.color} shadow-lg` 
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                    style={{
                      boxShadow: isHovered ? `0 20px 40px -15px ${config.colorAccent}40` : undefined
                    }}
                  >
                    {/* Efecto de brillo en hover */}
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500`}>
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent" />
                    </div>
                    
                    {/* Contenido */}
                    <div className="relative">
                      {/* Icono con animación */}
                      <div className={`text-4xl mb-4 transition-transform duration-300 ${isHovered ? 'scale-110' : ''}`}>
                        {config.icono}
                      </div>
                      
                      {/* Título */}
                      <h4 className="text-white font-bold text-lg mb-1">
                        {config.titulo}
                      </h4>
                      
                      {/* Descripción */}
                      <p className={`text-sm mb-4 transition-colors ${isHovered ? 'text-white/90' : 'text-white/50'}`}>
                        {config.descripcion}
                      </p>

                      {/* Métricas preview con animación escalonada */}
                      <div className="flex flex-wrap gap-1.5">
                        {config.metricas.slice(0, 3).map((metrica, i) => (
                          <span 
                            key={i}
                            className={`px-2 py-1 rounded-lg text-xs transition-all duration-300 ${
                              isHovered 
                                ? 'bg-white/20 text-white' 
                                : 'bg-white/5 text-white/40'
                            }`}
                            style={{ transitionDelay: `${i * 50}ms` }}
                          >
                            {metrica.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {config.metricas.length > 3 && (
                          <span className={`px-2 py-1 rounded-lg text-xs ${
                            isHovered ? 'bg-white/10 text-white/70' : 'bg-white/5 text-white/30'
                          }`}>
                            +{config.metricas.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Badge de disclaimer */}
                      {config.requiereDisclaimer && (
                        <div className="absolute top-0 right-0">
                          <span className={`px-2 py-1 text-xs rounded-lg flex items-center gap-1 transition-colors ${
                            isHovered 
                              ? 'bg-amber-400/30 text-amber-200' 
                              : 'bg-amber-500/10 text-amber-400/80'
                          }`}>
                            ⚠️
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Indicador de acción */}
                    <div className={`absolute bottom-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center transition-all duration-300 ${
                      isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                    }`}>
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Separador */}
        {puedeAnalizar && (
          <div className="px-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-zinc-900 px-4 text-xs text-white/30 uppercase tracking-wider">o</span>
              </div>
            </div>
          </div>
        )}

        {/* Opción de grabar sin análisis */}
        <div className="p-6">
          <button
            onClick={handleGrabarSinAnalisis}
            className="w-full p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left flex items-center gap-4 group"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <span className="text-2xl">📝</span>
            </div>
            <div className="flex-1">
              <h4 className="text-white font-semibold mb-0.5">Solo Transcripción</h4>
              <p className="text-white/50 text-sm">Grabar sin análisis conductual - Solo texto de la reunión</p>
            </div>
            <div className="text-white/30 group-hover:text-white/60 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        {/* Footer info */}
        <div className="px-6 pb-6">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-start gap-3 text-white/40 text-xs">
              <span className="text-lg">🔒</span>
              <p className="leading-relaxed">
                <strong className="text-white/60">Privacidad garantizada:</strong> Todo el análisis facial y corporal se procesa localmente en tu navegador. 
                No se envían datos biométricos a servidores externos. Solo la transcripción y resumen se almacenan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingTypeSelectorV2;
