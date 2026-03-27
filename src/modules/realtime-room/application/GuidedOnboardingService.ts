export interface GuidedOnboardingStep {
  id: string;
  title: string;
  description: string;
  focusLabel?: string;
  selector?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

interface MeetingOnboardingStorage {
  completed: boolean;
  dismissed: boolean;
  shownCount: number;
  updatedAt: string | null;
}

export class GuidedOnboardingService {
  private readonly version = 'v2';

  buildMeetingSteps(input: { showRecordingStep: boolean }): GuidedOnboardingStep[] {
    const steps: GuidedOnboardingStep[] = [
      {
        id: 'stage',
        title: 'Escenario principal',
        description: 'Aquí ves la reunión en vivo: galería, orador o pantalla compartida. Es la zona principal para seguir la conversación y detectar quién tiene la atención.',
        focusLabel: 'Vista principal de la sala',
        selector: '[data-tour-step="meeting-stage"]',
        side: 'bottom',
        align: 'center',
      },
      {
        id: 'controls',
        title: 'Controles básicos',
        description: 'Activa micrófono y cámara cuando estés listo. Si necesitas pedir turno, usa la mano levantada para priorizar tu tile en la reunión.',
        focusLabel: 'Micrófono · Cámara · Mano levantada',
        selector: '[data-tour-step="meeting-mic-group"]',
        side: 'top',
        align: 'center',
      },
      {
        id: 'devices',
        title: 'Dispositivos y fondo',
        description: 'Abre la flecha junto a micrófono o cámara para cambiar dispositivo, elegir altavoz, activar reducción de ruido y configurar desenfoque o fondo personalizado.',
        focusLabel: 'Flechas junto a micrófono y cámara',
        selector: '[data-tour-step="meeting-camera-group"]',
        side: 'top',
        align: 'center',
      },
      {
        id: 'layout',
        title: 'Vistas de la reunión',
        description: 'Cambia entre galería, orador y lateral. El contador te muestra cuántas personas están conectadas y puedes fijar participantes tocando su tile.',
        focusLabel: 'Galería · Orador · Lateral · Contador',
        selector: '[data-tour-step="meeting-layout-switcher"]',
        side: 'bottom',
        align: 'start',
      },
      {
        id: 'connected',
        title: 'Personas conectadas',
        description: 'Este badge compacto abre la lista de participantes conectados. Así puedes confirmar quién está dentro sin tapar la sala completa.',
        focusLabel: 'Badge de conectados',
        selector: '[data-tour-step="meeting-connected-badge"]',
        side: 'left',
        align: 'start',
      },
      {
        id: 'collaboration',
        title: 'Colaboración rápida',
        description: 'Usa chat y reacciones para intervenir sin interrumpir. Las reacciones aparecen con burst visual para que se vean incluso en salas activas.',
        focusLabel: 'Chat · Reacciones · Fijar participante',
        selector: '[data-tour-step="meeting-collaboration-group"]',
        side: 'top',
        align: 'center',
      },
      {
        id: 'screen-share',
        title: 'Compartir pantalla con audio',
        description: 'Antes de compartir, puedes activar el botón Audio para intentar incluir el sonido del sistema si tu navegador lo soporta.',
        focusLabel: 'Compartir pantalla · Audio',
        selector: '[data-tour-step="meeting-share-group"]',
        side: 'top',
        align: 'center',
      },
    ];

    if (input.showRecordingStep) {
      steps.push({
        id: 'recording',
        title: 'Grabación y análisis',
        description: 'Cuando haya suficientes participantes, puedes grabar la reunión. Si algo falla, verás diagnósticos claros arriba de la barra de controles.',
        selector: '[data-tour-step="meeting-recording-group"]',
        side: 'top',
        align: 'center',
      });
    }

    return steps;
  }

  shouldShowMeetingOnboarding(userId: string, isExternalGuest: boolean): boolean {
    const state = this.readMeetingState(userId, isExternalGuest);
    // Mostrar hasta 3 veces si no está completado ni descartado
    const maxShows = 3;
    return !state.completed && !state.dismissed && state.shownCount < maxShows;
  }

  completeMeetingOnboarding(userId: string, isExternalGuest: boolean): void {
    const currentState = this.readMeetingState(userId, isExternalGuest);
    this.writeMeetingState(userId, isExternalGuest, {
      ...currentState,
      completed: true,
      dismissed: false,
      updatedAt: new Date().toISOString(),
    });
  }

  dismissMeetingOnboarding(userId: string, isExternalGuest: boolean): void {
    const currentState = this.readMeetingState(userId, isExternalGuest);
    this.writeMeetingState(userId, isExternalGuest, {
      ...currentState,
      completed: false,
      dismissed: true,
      updatedAt: new Date().toISOString(),
    });
  }

  incrementShownCount(userId: string, isExternalGuest: boolean): void {
    const currentState = this.readMeetingState(userId, isExternalGuest);
    this.writeMeetingState(userId, isExternalGuest, {
      ...currentState,
      shownCount: currentState.shownCount + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  private getMeetingStorageKey(userId: string): string {
    return `meeting-guided-onboarding:${this.version}:${userId}`;
  }

  private readMeetingState(userId: string, isExternalGuest: boolean): MeetingOnboardingStorage {
    if (typeof window === 'undefined') {
      return { completed: false, dismissed: false, shownCount: 0, updatedAt: null };
    }

    const key = this.getMeetingStorageKey(userId);
    // Usar sessionStorage para invitados externos (cada sesión es nueva)
    const storage = isExternalGuest ? window.sessionStorage : window.localStorage;
    const raw = storage.getItem(key);
    
    if (!raw) {
      return { completed: false, dismissed: false, shownCount: 0, updatedAt: null };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<MeetingOnboardingStorage>;
      return {
        completed: Boolean(parsed.completed),
        dismissed: Boolean(parsed.dismissed),
        shownCount: Number(parsed.shownCount) || 0,
        updatedAt: parsed.updatedAt ?? null,
      };
    } catch {
      return { completed: false, dismissed: false, shownCount: 0, updatedAt: null };
    }
  }

  private writeMeetingState(userId: string, isExternalGuest: boolean, state: MeetingOnboardingStorage): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.getMeetingStorageKey(userId);
    // Usar sessionStorage para invitados externos (cada sesión es nueva)
    const storage = isExternalGuest ? window.sessionStorage : window.localStorage;
    storage.setItem(key, JSON.stringify(state));
  }
}
