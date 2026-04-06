/**
 * @module hooks/meetings/useCalendarPanel
 * @description Hook that extracts ALL business logic from CalendarPanel.tsx
 * Manages all meeting state and delegates to Clean Architecture use cases.
 * Replaces all direct Supabase access in CalendarPanel.
 *
 * Architecture: Presentation layer hook consuming Application layer use cases.
 * Zero direct Supabase access — all data flows through repository ports.
 *
 * Ref: Clean Architecture — Presentation layer depends on Application layer only.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import { getSettingsSection } from '@/lib/userSettings';
import { googleCalendar, GoogleCalendarEvent } from '@/lib/googleCalendar';
import { APP_URL } from '@/lib/supabase';
import type { ScheduledMeeting } from '@/types';
import type {
  TipoReunionUnificado,
  InvitadoExterno,
} from '@/types/meeting-types';
import type { CargoLaboral } from '@/components/meetings/recording/types/analysis';
import { getTiposReunionPorCargo, TIPOS_REUNION_CONFIG } from '@/types/meeting-types';

// Adapters (singleton instances per Dependency Injection pattern)
import { meetingRepository } from '@/src/core/infrastructure/adapters/MeetingSupabaseRepository';
import { meetingRealtimeService } from '@/src/core/infrastructure/adapters/MeetingRealtimeSupabaseService';

// Use cases
import { CargarReunionesUseCase } from '@/src/core/application/usecases/CargarReunionesUseCase';
import { CrearReunionCompletaUseCase } from '@/src/core/application/usecases/CrearReunionCompletaUseCase';
import { EliminarReunionUseCase } from '@/src/core/application/usecases/EliminarReunionUseCase';
import { ResponderInvitacionReunionUseCase } from '@/src/core/application/usecases/ResponderInvitacionReunionUseCase';
import { CargarMiembrosEspacioUseCase } from '@/src/core/application/usecases/CargarMiembrosEspacioUseCase';

const log = logger.child('calendar-panel');

// Singleton use case instances
const cargarReuniones = new CargarReunionesUseCase(meetingRepository);
const crearReunionCompleta = new CrearReunionCompletaUseCase(meetingRepository);
const eliminarReunion = new EliminarReunionUseCase(meetingRepository);
const responderInvitacion = new ResponderInvitacionReunionUseCase(meetingRepository);
const cargarMiembros = new CargarMiembrosEspacioUseCase(meetingRepository);

interface ActiveMeeting {
  salaId: string;
  titulo: string;
}

interface NewMeetingForm {
  titulo: string;
  descripcion: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  participantes: string[];
  recordatorio_minutos: number;
  tipo_reunion: TipoReunionUnificado;
}

interface NuevoInvitadoForm {
  email: string | undefined;
  nombre: string | undefined;
  empresa: string | undefined;
  puesto_aplicado: string | undefined;
}

/**
 * Return type for useCalendarPanel hook.
 */
export interface UseCalendarPanelReturn {
  // State - UI
  loading: boolean;
  activeTab: 'scheduled' | 'notes';
  searchQuery: string;
  showScheduleModal: boolean;
  showInviteModal: string | null;
  copiedLink: string | null;
  selectedDate: Date;
  selectedMeeting: ScheduledMeeting | null;
  activeMeeting: ActiveMeeting | null;
  googleConnected: boolean;
  syncingGoogle: boolean;
  showroomHabilitado: boolean;
  showroomDuracion: number;
  cargoUsuario: CargoLaboral;

  // State - Meetings
  meetings: ScheduledMeeting[];
  googleEvents: GoogleCalendarEvent[];
  miembrosEspacio: any[];

  // State - New Meeting Form
  newMeeting: NewMeetingForm;
  invitadosExternos: InvitadoExterno[];
  nuevoInvitado: NuevoInvitadoForm;
  erroresInvitado: string[];

  // State Setters
  setActiveTab: (tab: 'scheduled' | 'notes') => void;
  setSearchQuery: (query: string) => void;
  setShowScheduleModal: (show: boolean) => void;
  setShowInviteModal: (salaId: string | null) => void;
  setCopiedLink: (meetingId: string | null) => void;
  setSelectedDate: (date: Date) => void;
  setSelectedMeeting: (meeting: ScheduledMeeting | null) => void;
  setActiveMeeting: (meeting: ActiveMeeting | null) => void;
  setShowroomHabilitado: (enabled: boolean) => void;
  setShowroomDuracion: (duracion: number) => void;
  setNewMeeting: (meeting: NewMeetingForm) => void;
  setInvitadosExternos: (invitados: InvitadoExterno[]) => void;
  setNuevoInvitado: (invitado: NuevoInvitadoForm) => void;
  setErroresInvitado: (errores: string[]) => void;

  // Actions
  loadMeetings: () => Promise<void>;
  loadMiembros: () => Promise<void>;
  createMeeting: () => Promise<void>;
  respondToMeeting: (meetingId: string, estado: 'aceptado' | 'rechazado' | 'tentativo') => Promise<void>;
  deleteMeeting: (meetingId: string, googleEventId?: string) => Promise<void>;
  connectGoogleCalendar: () => void;
  disconnectGoogleCalendar: () => void;
  syncGoogleEvents: () => Promise<void>;
  copyMeetingLink: (meetingLink: string, meetingId: string) => Promise<void>;
  toggleParticipant: (userId: string) => void;
  resetNewMeeting: () => void;

  // Computed values
  filteredMeetings: ScheduledMeeting[];
  visibleGoogleEvents: GoogleCalendarEvent[];
  tiposReunionDisponibles: TipoReunionUnificado[];
  getDaysInMonth: (date: Date) => (Date | null)[];
  getMeetingsForDate: (date: Date) => ScheduledMeeting[];
  formatTime: (dateStr: string) => string;
  formatDate: (dateStr: string) => string;
  formatDateShort: (dateStr: string) => string;
  isCreator: (meeting: ScheduledMeeting) => boolean;
  getMyParticipation: (meeting: ScheduledMeeting) => any;
  isMeetingNow: (meeting: ScheduledMeeting) => boolean;
  isMeetingSoon: (meeting: ScheduledMeeting) => boolean;
  configTipoActual: any;
  currentUserId: string | undefined;
}

/**
 * Custom hook for CalendarPanel.
 * Manages all state and business logic, delegating to Clean Architecture use cases.
 * Provides zero-Supabase interface for the component layer.
 */
export function useCalendarPanel(): UseCalendarPanelReturn {
  const { currentUser, activeWorkspace, theme, addNotification } = useStore();

  // State - UI
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'notes'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<ScheduledMeeting | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null);
  const [googleConnected, setGoogleConnected] = useState(googleCalendar.isConnected());
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [showroomHabilitado, setShowroomHabilitado] = useState(false);
  const [showroomDuracion, setShowroomDuracion] = useState(5);
  const [cargoUsuario, setCargoUsuario] = useState<CargoLaboral>('colaborador');

  // State - Meetings
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [miembrosEspacio, setMiembrosEspacio] = useState<any[]>([]);

  // State - New Meeting Form
  const [newMeeting, setNewMeeting] = useState<NewMeetingForm>({
    titulo: '',
    descripcion: '',
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    participantes: [],
    recordatorio_minutos: 15,
    tipo_reunion: 'equipo',
  });
  const [invitadosExternos, setInvitadosExternos] = useState<InvitadoExterno[]>([]);
  const [nuevoInvitado, setNuevoInvitado] = useState<NuevoInvitadoForm>({
    email: '',
    nombre: '',
    empresa: '',
    puesto_aplicado: '',
  });
  const [erroresInvitado, setErroresInvitado] = useState<string[]>([]);

  // Refs
  const creatingMeetingRef = useRef(false);
  const realtimeChannelRef = useRef<import('@/src/core/domain/ports/IMeetingRealtimeService').MeetingRealtimeSubscription | null>(null);

  /**
   * Load all meetings for the active workspace
   */
  const loadMeetings = useCallback(async () => {
    if (!activeWorkspace?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const result = await cargarReuniones.ejecutar({
        espacioId: activeWorkspace.id,
      });
      setMeetings(result.reuniones);
      log.debug('Meetings loaded', { count: result.reuniones.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load meetings', { error: message });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  /**
   * Load workspace members and user's cargo
   */
  const loadMiembros = useCallback(async () => {
    if (!activeWorkspace?.id || !currentUser?.id) return;

    try {
      const result = await cargarMiembros.ejecutar({
        espacioId: activeWorkspace.id,
      });
      setMiembrosEspacio(result.miembros);
      log.debug('Members loaded', { count: result.miembros.length });

      // TODO: Fetch user's cargo from miembros_espacio + cargos tables
      // For now, using default value
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load members', { error: message });
    }
  }, [activeWorkspace?.id, currentUser?.id]);

  /**
   * Initialize: load meetings and members on mount and when workspace changes
   */
  useEffect(() => {
    loadMeetings();
    loadMiembros();

    // Subscribe to realtime changes on reuniones_programadas
    if (!activeWorkspace?.id) return;

    const setupRealtime = () => {
      try {
        const channel = meetingRealtimeService.suscribirReuniones(
          activeWorkspace.id,
          () => {
            log.debug('Meetings changed via realtime, reloading');
            loadMeetings();
          }
        );
        realtimeChannelRef.current = channel;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Failed to subscribe to realtime', { error: message });
      }
    };

    setupRealtime();

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, [activeWorkspace?.id, currentUser?.id, loadMeetings, loadMiembros]);

  /**
   * Copy meeting link to clipboard
   */
  const copyMeetingLink = useCallback(
    async (meetingLink: string, meetingId: string) => {
      try {
        await navigator.clipboard.writeText(meetingLink);
        setCopiedLink(meetingId);
        setTimeout(() => setCopiedLink(null), 2000);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Error copying link', { error: message });
      }
    },
    []
  );

  /**
   * Reset new meeting form to initial state
   */
  const resetNewMeeting = useCallback(() => {
    const tiposDisponibles = getTiposReunionPorCargo(cargoUsuario);
    const primerTipo = tiposDisponibles[0] || 'equipo';

    setNewMeeting({
      titulo: '',
      descripcion: '',
      fecha: '',
      hora_inicio: '',
      hora_fin: '',
      participantes: [],
      recordatorio_minutos: getSettingsSection('calendar').defaultReminder || 15,
      tipo_reunion: primerTipo,
    });
    setInvitadosExternos([]);
    setNuevoInvitado({ email: '', nombre: '', empresa: '', puesto_aplicado: '' });
    setErroresInvitado([]);
  }, [cargoUsuario]);

  /**
   * Create a complete meeting with all components
   */
  const createMeeting = useCallback(async () => {
    log.debug('createMeeting called', {
      titulo: newMeeting.titulo,
      fecha: newMeeting.fecha,
      hora_inicio: newMeeting.hora_inicio,
      workspace: activeWorkspace?.id,
      user: currentUser?.id,
    });

    if (!newMeeting.titulo.trim() || !newMeeting.fecha || !newMeeting.hora_inicio || !activeWorkspace?.id || !currentUser?.id) {
      log.warn('Validation failed for createMeeting');
      addNotification('Completa todos los campos obligatorios (título, fecha y hora)', 'error');
      return;
    }

    // Guard against double-click
    if (creatingMeetingRef.current) {
      log.warn('Create meeting already in progress, ignoring double-click');
      return;
    }
    creatingMeetingRef.current = true;

    try {
      const fechaInicio = new Date(`${newMeeting.fecha}T${newMeeting.hora_inicio}`);
      const fechaFin = newMeeting.hora_fin
        ? new Date(`${newMeeting.fecha}T${newMeeting.hora_fin}`)
        : new Date(fechaInicio.getTime() + 60 * 60 * 1000);

      // Generate unique meeting code
      const meetingCode = Math.random().toString(36).substring(2, 10);
      let meetingLink = `${APP_URL}/meet/${meetingCode}`;
      let googleEventId: string | null = null;

      // Create event in Google Calendar if connected
      const calSettings = getSettingsSection('calendar');
      const shouldCreateGoogle = calSettings.autoCreateGoogleEvent !== false;

      if (googleConnected && shouldCreateGoogle) {
        try {
          const googleEvent = await googleCalendar.createEvent({
            summary: newMeeting.titulo.trim(),
            description: newMeeting.descripcion.trim() || 'Reunión creada en Cowork Virtual',
            start: fechaInicio.toISOString(),
            end: fechaFin.toISOString(),
            attendees: newMeeting.participantes.length > 0 ? [] : undefined, // TODO: fetch emails
            sendUpdates: 'all',
            meetingLink: meetingLink,
          });

          if (googleEvent) {
            googleEventId = googleEvent.id;
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Failed to create Google Calendar event', { error: message });
        }
      }

      // Map reunion type to database type
      const tipoReunionBDMap: Record<TipoReunionUnificado, 'equipo' | 'deal' | 'entrevista'> = {
        equipo: 'equipo',
        one_to_one: 'equipo',
        cliente: 'deal',
        candidato: 'entrevista',
      };
      const tipoReunionBD = tipoReunionBDMap[newMeeting.tipo_reunion] || 'equipo';

      // Prepare participants data
      const participantesInternos = newMeeting.participantes.map((uid) => ({
        usuario_id: uid,
        estado: 'pendiente' as const,
      }));

      // Prepare external participants
      let todosLosInvitados = [...invitadosExternos];
      if (nuevoInvitado.email && nuevoInvitado.nombre) {
        const yaExiste = invitadosExternos.some((inv) => inv.email === nuevoInvitado.email);
        if (!yaExiste) {
          todosLosInvitados.push(nuevoInvitado as InvitadoExterno);
        }
      }

      // Use case: Create complete meeting
      const result = await crearReunionCompleta.ejecutar({
        espacioId: activeWorkspace.id,
        titulo: newMeeting.titulo.trim(),
        descripcion: newMeeting.descripcion.trim() || null,
        fechaInicio: fechaInicio.toISOString(),
        fechaFin: fechaFin.toISOString(),
        creadorId: currentUser.id,
        tipoReunion: tipoReunionBD,
        participantesInternos,
        participantesExternos: todosLosInvitados,
        recordatorioMinutos: newMeeting.recordatorio_minutos,
        meetingLink,
        googleEventId,
        crearSala: true,
        tipoSala: newMeeting.tipo_reunion === 'cliente' ? 'deal' : newMeeting.tipo_reunion === 'candidato' ? 'entrevista' : 'general',
      });

      if (!result.success) {
        log.error('Failed to create meeting', { error: result.error });
        addNotification('Error al crear la reunión. Intenta de nuevo.', 'error');
        return;
      }

      log.info('Meeting created successfully', { reunionId: result.reunion?.id });
      addNotification(`Reunión "${newMeeting.titulo.trim()}" programada con éxito`, 'success');

      // Reset UI
      setShowScheduleModal(false);
      resetNewMeeting();
      await loadMeetings();
      await syncGoogleEvents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Exception in createMeeting', { error: message });
      addNotification('Error inesperado al crear la reunión', 'error');
    } finally {
      creatingMeetingRef.current = false;
    }
  }, [newMeeting, activeWorkspace?.id, currentUser?.id, googleConnected, invitadosExternos, nuevoInvitado, resetNewMeeting, loadMeetings, addNotification]);

  /**
   * Respond to a meeting invitation
   */
  const respondToMeeting = useCallback(
    async (meetingId: string, estado: 'aceptado' | 'rechazado' | 'tentativo') => {
      if (!currentUser?.id) return;

      try {
        const result = await responderInvitacion.ejecutar({
          reunionId: meetingId,
          usuarioId: currentUser.id,
          estado,
        });

        if (result.success) {
          log.debug('Response recorded', { meetingId, estado });
          await loadMeetings();
        } else {
          log.warn('Failed to respond to invitation', { error: result.error });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Exception responding to invitation', { error: message });
      }
    },
    [currentUser?.id, loadMeetings]
  );

  /**
   * Delete a meeting
   */
  const deleteMeeting = useCallback(
    async (meetingId: string, googleEventId?: string) => {
      log.debug('Deleting meeting', { meetingId, googleEventId });

      // Delete from Google Calendar first if connected
      if (googleConnected && googleEventId) {
        try {
          await googleCalendar.deleteEvent(googleEventId, 'all');
          log.debug('Event deleted from Google Calendar', { googleEventId });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          log.warn('Failed to delete from Google Calendar', { error: message });
        }
      }

      // Optimistic update
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));

      try {
        const result = await eliminarReunion.ejecutar({ reunionId: meetingId });

        if (result.success) {
          log.info('Meeting deleted successfully', { meetingId });
          await syncGoogleEvents();
        } else {
          log.error('Failed to delete meeting', { error: result.error });
          // Rollback optimistic update
          await loadMeetings();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Exception deleting meeting', { error: message });
        // Rollback optimistic update
        await loadMeetings();
      }
    },
    [googleConnected, loadMeetings]
  );

  /**
   * Connect Google Calendar
   */
  const connectGoogleCalendar = useCallback(() => {
    window.location.href = googleCalendar.getAuthUrl();
  }, []);

  /**
   * Disconnect Google Calendar
   */
  const disconnectGoogleCalendar = useCallback(() => {
    googleCalendar.removeToken();
    setGoogleConnected(false);
    setGoogleEvents([]);
  }, []);

  /**
   * Sync Google Calendar events
   */
  const syncGoogleEvents = useCallback(async () => {
    if (!googleCalendar.isConnected()) return;

    setSyncingGoogle(true);
    try {
      const events = await googleCalendar.fetchEvents();
      setGoogleEvents(events);
      log.debug('Google events synced', { count: events.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Error syncing Google Calendar', { error: message });
      if (message === 'Token expirado') {
        setGoogleConnected(false);
      }
    } finally {
      setSyncingGoogle(false);
    }
  }, []);

  /**
   * Handle Google Calendar auth token from URL hash
   */
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('access_token')) {
      const token = googleCalendar.parseHashToken(hash);
      if (token) {
        googleCalendar.saveToken(token);
        setGoogleConnected(true);
        window.history.replaceState(null, '', window.location.pathname);
        syncGoogleEvents();
      }
    }
  }, [syncGoogleEvents]);

  /**
   * Auto-sync Google Calendar periodically
   */
  useEffect(() => {
    if (googleConnected) {
      syncGoogleEvents();

      const calS = getSettingsSection('calendar');
      if (calS.syncEnabled !== false) {
        const interval = setInterval(syncGoogleEvents, 5 * 60 * 1000); // every 5 min
        return () => clearInterval(interval);
      }
    }
  }, [googleConnected, syncGoogleEvents]);

  /**
   * Toggle participant selection
   */
  const toggleParticipant = useCallback((userId: string) => {
    setNewMeeting((prev) => ({
      ...prev,
      participantes: prev.participantes.includes(userId)
        ? prev.participantes.filter((id) => id !== userId)
        : [...prev.participantes, userId],
    }));
  }, []);

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const tiposReunionDisponibles = getTiposReunionPorCargo(cargoUsuario);
  const configTipoActual = TIPOS_REUNION_CONFIG[newMeeting.tipo_reunion];

  const filteredMeetings = meetings.filter(
    (m) =>
      m.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.descripcion?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const calSettingsForFilter = getSettingsSection('calendar');
  const visibleGoogleEvents = calSettingsForFilter.showGoogleEvents !== false ? googleEvents : [];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const getMeetingsForDate = (date: Date) => {
    return meetings.filter((m) => {
      const meetingDate = new Date(m.fecha_inicio);
      return meetingDate.toDateString() === date.toDateString();
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
    return date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const isCreator = (meeting: ScheduledMeeting) => meeting.creado_por === currentUser?.id;

  const getMyParticipation = (meeting: ScheduledMeeting) => meeting.participantes?.find((p) => p.usuario_id === currentUser?.id);

  const isMeetingNow = (meeting: ScheduledMeeting) => {
    const now = new Date();
    const start = new Date(meeting.fecha_inicio);
    const end = new Date(meeting.fecha_fin);
    return now >= start && now <= end;
  };

  const isMeetingSoon = (meeting: ScheduledMeeting) => {
    const now = new Date();
    const start = new Date(meeting.fecha_inicio);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes > 0 && diffMinutes <= 15;
  };

  return {
    // State - UI
    loading,
    activeTab,
    searchQuery,
    showScheduleModal,
    showInviteModal,
    copiedLink,
    selectedDate,
    selectedMeeting,
    activeMeeting,
    googleConnected,
    syncingGoogle,
    showroomHabilitado,
    showroomDuracion,
    cargoUsuario,

    // State - Meetings
    meetings,
    googleEvents,
    miembrosEspacio,

    // State - New Meeting Form
    newMeeting,
    invitadosExternos,
    nuevoInvitado,
    erroresInvitado,

    // State Setters
    setActiveTab,
    setSearchQuery,
    setShowScheduleModal,
    setShowInviteModal,
    setCopiedLink,
    setSelectedDate,
    setSelectedMeeting,
    setActiveMeeting,
    setShowroomHabilitado,
    setShowroomDuracion,
    setNewMeeting,
    setInvitadosExternos,
    setNuevoInvitado,
    setErroresInvitado,

    // Actions
    loadMeetings,
    loadMiembros,
    createMeeting,
    respondToMeeting,
    deleteMeeting,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    syncGoogleEvents,
    copyMeetingLink,
    toggleParticipant,
    resetNewMeeting,

    // Computed values
    filteredMeetings,
    visibleGoogleEvents,
    tiposReunionDisponibles,
    configTipoActual,
    getDaysInMonth,
    getMeetingsForDate,
    formatTime,
    formatDate,
    formatDateShort,
    isCreator,
    getMyParticipation,
    isMeetingNow,
    isMeetingSoon,
    currentUserId: currentUser?.id,
  };
}
