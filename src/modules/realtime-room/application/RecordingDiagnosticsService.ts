export type RecordingProcessingStep = 'idle' | 'selecting_type' | 'recording' | 'stopping' | 'processing' | 'complete' | 'error';

export interface RecordingDiagnosticsSnapshot {
  step: RecordingProcessingStep;
  message: string;
  duration: number;
  hasStream: boolean;
  canStartRecording: boolean;
}

export type RecordingDiagnosticsSeverity = 'info' | 'warn' | 'error' | 'success';

export type RecordingDiagnosticsCode =
  | 'recording_active'
  | 'recording_stopping'
  | 'recording_processing'
  | 'recording_completed'
  | 'insufficient_participants'
  | 'missing_stream'
  | 'create_record_failed'
  | 'processing_failed'
  | 'start_failed';

export interface RecordingDiagnostics {
  code: RecordingDiagnosticsCode;
  severity: RecordingDiagnosticsSeverity;
  title: string;
  message: string;
  visible: boolean;
}

export class RecordingDiagnosticsService {
  build(snapshot: RecordingDiagnosticsSnapshot | null): RecordingDiagnostics | null {
    if (!snapshot) {
      return null;
    }

    if (snapshot.step === 'recording') {
      return {
        code: 'recording_active',
        severity: 'info',
        title: 'Grabación activa',
        message: snapshot.message || 'La reunión se está grabando.',
        visible: false,
      };
    }

    if (snapshot.step === 'stopping') {
      return {
        code: 'recording_stopping',
        severity: 'warn',
        title: 'Deteniendo grabación',
        message: snapshot.message || 'Estamos cerrando la grabación de forma segura.',
        visible: true,
      };
    }

    if (snapshot.step === 'processing') {
      return {
        code: 'recording_processing',
        severity: 'info',
        title: 'Procesando grabación',
        message: snapshot.message || 'Estamos procesando la grabación.',
        visible: true,
      };
    }

    if (snapshot.step === 'complete') {
      return {
        code: 'recording_completed',
        severity: 'success',
        title: 'Grabación completada',
        message: snapshot.message || 'La grabación y el análisis quedaron listos.',
        visible: true,
      };
    }

    if (snapshot.step !== 'error') {
      return null;
    }

    const normalizedMessage = snapshot.message.toLowerCase();

    if (!snapshot.canStartRecording || normalizedMessage.includes('al menos 2 personas')) {
      return {
        code: 'insufficient_participants',
        severity: 'warn',
        title: 'Grabación bloqueada',
        message: snapshot.message || 'Necesitas al menos dos participantes para grabar.',
        visible: true,
      };
    }

    if (!snapshot.hasStream || normalizedMessage.includes('stream') || normalizedMessage.includes('audio/video disponible')) {
      return {
        code: 'missing_stream',
        severity: 'error',
        title: 'Sin media disponible',
        message: snapshot.message || 'No encontramos audio o video listos para grabar.',
        visible: true,
      };
    }

    if (normalizedMessage.includes('creando grabación')) {
      return {
        code: 'create_record_failed',
        severity: 'error',
        title: 'No se pudo crear la grabación',
        message: snapshot.message,
        visible: true,
      };
    }

    if (normalizedMessage.includes('procesamiento')) {
      return {
        code: 'processing_failed',
        severity: 'error',
        title: 'Falló el procesamiento',
        message: snapshot.message,
        visible: true,
      };
    }

    return {
      code: 'start_failed',
      severity: 'error',
      title: 'No se pudo iniciar la grabación',
      message: snapshot.message || 'Ocurrió un error al iniciar la grabación.',
      visible: true,
    };
  }
}
