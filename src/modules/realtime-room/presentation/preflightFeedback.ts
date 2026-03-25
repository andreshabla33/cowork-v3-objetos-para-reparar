import type { PreflightError } from '../domain/types';

export interface PreflightFeedback {
  title: string;
  message: string;
  variant: 'error' | 'warning' | 'info';
  steps: string[];
  ctaLabel?: string;
}

const PRIORITY: Record<PreflightError['type'], number> = {
  'permission-denied': 3,
  'no-device': 2,
  'track-error': 1,
  'browser-not-supported': 4,
};

export function getPrimaryPreflightError(errors: PreflightError[]): PreflightError | null {
  if (errors.length === 0) return null;

  return [...errors].sort((left, right) => PRIORITY[right.type] - PRIORITY[left.type])[0] ?? null;
}

export function getPreflightFeedback(errors: PreflightError[]): PreflightFeedback | null {
  const error = getPrimaryPreflightError(errors);
  if (!error) return null;

  if (error.type === 'permission-denied') {
    const deviceText = error.device === 'camera'
      ? 'la cámara'
      : error.device === 'microphone'
      ? 'el micrófono'
      : 'la cámara y el micrófono';

    return {
      title: 'Permiso bloqueado',
      message: `No pudimos usar ${deviceText}. Revisa el permiso del navegador y vuelve a intentarlo cuando estés listo.`,
      variant: 'warning',
      steps: [
        'Haz clic en el candado o icono de permisos de tu navegador para este sitio.',
        `Permite el acceso a ${deviceText}.`,
        'Vuelve a intentar el ingreso o recarga la vista si el navegador lo pide.',
      ],
      ctaLabel: 'Revisar permisos del navegador',
    };
  }

  if (error.type === 'no-device') {
    const deviceText = error.device === 'camera'
      ? 'cámara'
      : error.device === 'microphone'
      ? 'micrófono'
      : 'cámara o micrófono';

    return {
      title: 'Dispositivo no disponible',
      message: `No encontramos un ${deviceText} disponible para continuar.`,
      variant: 'error',
      steps: [
        `Conecta o habilita un ${deviceText} en tu sistema.`,
        'Verifica que el navegador detecte el dispositivo correcto.',
        'Vuelve a abrir esta pantalla para refrescar la lista de dispositivos.',
      ],
      ctaLabel: 'Conectar dispositivo y reintentar',
    };
  }

  if (error.type === 'browser-not-supported') {
    return {
      title: 'Navegador no compatible',
      message: 'Tu navegador no expone correctamente los permisos o dispositivos requeridos para la sala.',
      variant: 'error',
      steps: [
        'Prueba con una versión actualizada de Chrome, Edge o un navegador Chromium reciente.',
        'Evita modos restringidos o navegadores embebidos con soporte parcial de media.',
      ],
      ctaLabel: 'Abrir con navegador compatible',
    };
  }

  return {
    title: 'No se pudo iniciar el dispositivo',
    message: 'No pudimos inicializar tu dispositivo de media. Suele pasar cuando otra app lo está usando o el navegador quedó en mal estado.',
    variant: 'warning',
    steps: [
      'Cierra otras apps que puedan estar usando la cámara o el micrófono.',
      'Desactiva y vuelve a activar el dispositivo desde esta pantalla.',
      'Si persiste, recarga la vista e inténtalo otra vez.',
    ],
    ctaLabel: 'Liberar dispositivo y reintentar',
  };
}

export function getPreflightFeedbackMessage(errors: PreflightError[]): string | null {
  const feedback = getPreflightFeedback(errors);
  if (!feedback) return null;

  const primaryStep = feedback.steps[0];
  return primaryStep ? `${feedback.message} ${primaryStep}` : feedback.message;
}
