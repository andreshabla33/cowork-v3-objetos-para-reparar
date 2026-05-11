export type RecordingStatus =
  | 'idle'
  | 'requesting_consent'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'uploading'
  | 'processing'
  | 'transcribing'
  | 'analyzing'
  | 'error';

export interface RecordingConfig {
  includeVideo: boolean;
  includeAudio: boolean;
  includeScreenShare: boolean;
  maxDurationSeconds?: number;
  mimeType?: string;
}

export interface RecordingMetadata {
  id: string;
  reunion_id?: string;
  espacio_id: string;
  creado_por: string;
  duracion_segundos: number;
  formato: string;
  estado: string;
  progreso_porcentaje?: number;
  tipo?: string;
  tiene_video?: boolean;
  tiene_audio?: boolean;
  inicio_grabacion: string;
  fin_grabacion?: string;
  archivo_url?: string;
  archivo_nombre?: string;
  tamano_bytes?: number;
  evaluado_id?: string | null;
  evaluado_nombre?: string | null;
  evaluado_email?: string | null;
}

export interface RecordingState {
  status: RecordingStatus;
  duration: number;
  error: string | null;
  metadata: RecordingMetadata | null;
  blob: Blob | null;
}

export interface TranscriptionSegment {
  id: string;
  grabacion_id: string;
  texto: string;
  inicio_segundos: number;
  fin_segundos: number;
  idioma?: string;
  confianza?: number;
  speaker_id?: string;
  speaker_nombre?: string;
}

export interface TranscriptionState {
  isLoading: boolean;
  isTranscribing: boolean;
  error: string | null;
  segments: TranscriptionSegment[];
  fullTranscript: string;
  currentSegment: string;
}

export type EmotionType =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'fearful'
  | 'disgusted'
  | 'neutral';

export interface EmotionAnalysis {
  id: string;
  grabacion_id: string;
  timestamp_segundos: number;
  participante_id?: string;
  participante_nombre?: string;
  emocion_dominante: EmotionType;
  emocion_confianza: number;
  emociones_detalle: Record<EmotionType, number>;
  engagement_score: number;
  mirando_camara: boolean;
  action_units?: Record<string, number>;
}

export interface BehaviorInsight {
  minuto: number;
  tipo: 'pico_engagement' | 'baja_atencion' | 'observacion';
  descripcion: string;
  score?: number;
}

export interface EmotionState {
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  currentEmotion: EmotionType;
  emotionConfidence: number;
  engagementScore: number;
  lookingAtCamera: boolean;
  emotionHistory: EmotionAnalysis[];
  insights: BehaviorInsight[];
}

export interface ActionItem {
  id?: string;
  tarea: string;
  responsable?: string;
  prioridad: 'alta' | 'media' | 'baja';
  fecha_limite?: string;
  completado?: boolean;
}

export interface AISummary {
  id: string;
  grabacion_id: string;
  resumen_corto: string;
  resumen_detallado: string;
  puntos_clave: string[];
  action_items: ActionItem[];
  sentimiento_general: 'positivo' | 'neutral' | 'negativo' | 'mixto';
  duracion_reunion: number;
  participantes_activos: number;
  momentos_clave: BehaviorInsight[];
  metricas_conductuales?: {
    engagement_promedio?: number;
    emocion_dominante?: EmotionType;
  };
  modelo_usado?: string;
  tokens_usados?: number;
  created_at?: string;
}

export interface AISummaryState {
  isLoading: boolean;
  error: string | null;
  summary: AISummary | null;
}
