// =====================================================
// BACKUP - Google Calendar Service con Google Meet
// Fecha: 2026-02-05
// Descripción: Versión original que crea Google Meet automáticamente
// Para restaurar: renombrar este archivo a googleCalendar.ts
// =====================================================

const GOOGLE_CLIENT_ID = '628870318014-35io6nhdj8rld9de0ng5voorrmr2neq4.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string; responseStatus: string; displayName?: string }[];
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType: string; uri: string }[];
  };
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  location?: string;
}

export interface CreateEventResponse extends GoogleCalendarEvent {
  hangoutLink?: string;
}

export const googleCalendar = {
  getAuthUrl: () => {
    // IMPORTANTE: La URI debe coincidir EXACTAMENTE con la registrada en Google Cloud Console
    let redirectUri = window.location.origin;
    
    // Si NO estamos en localhost, forzamos la URL de producción autorizada
    // Esto es necesario porque Google no acepta las URLs dinámicas de preview de Vercel
    if (!redirectUri.includes('localhost') && !redirectUri.includes('127.0.0.1')) {
      redirectUri = 'https://mvp-cowork.vercel.app/';
    } else {
      // Para localhost, aseguramos trailing slash si es necesario
      if (!redirectUri.endsWith('/')) {
        redirectUri += '/';
      }
    }

    console.log('[GoogleCalendar] Auth Config:', {
      origin: window.location.origin,
      finalRedirectUri: redirectUri
    });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
      prompt: 'consent'
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log('[GoogleCalendar] Full Auth URL:', authUrl);
    
    return authUrl;
  },

  parseHashToken: (hash: string): string | null => {
    const params = new URLSearchParams(hash.replace('#', ''));
    return params.get('access_token');
  },

  saveToken: (token: string) => {
    localStorage.setItem('google_calendar_token', token);
  },

  getToken: (): string | null => {
    return localStorage.getItem('google_calendar_token');
  },

  removeToken: () => {
    localStorage.removeItem('google_calendar_token');
  },

  isConnected: (): boolean => {
    return !!localStorage.getItem('google_calendar_token');
  },

  fetchEvents: async (timeMin?: string, timeMax?: string): Promise<GoogleCalendarEvent[]> => {
    const token = googleCalendar.getToken();
    if (!token) throw new Error('No hay token de Google Calendar');

    const params = new URLSearchParams({
      maxResults: '50',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        googleCalendar.removeToken();
        throw new Error('Token expirado');
      }
      throw new Error('Error al obtener eventos');
    }

    const data = await response.json();
    return data.items || [];
  },

  /**
   * Crea un evento en Google Calendar con soporte para:
   * - Google Meet automático
   * - Invitaciones por email a participantes
   * - Notificaciones automáticas
   */
  createEvent: async (event: CreateEventParams): Promise<CreateEventResponse> => {
    const token = googleCalendar.getToken();
    if (!token) throw new Error('No hay token de Google Calendar');

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const body: Record<string, any> = {
      summary: event.summary,
      description: event.description || '',
      start: { dateTime: event.start, timeZone },
      end: { dateTime: event.end, timeZone },
      // Crear Google Meet automáticamente
      conferenceData: {
        createRequest: {
          requestId: `cowork-meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      // Configurar recordatorios
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    // Agregar ubicación si se proporciona
    if (event.location) {
      body.location = event.location;
    }

    // Agregar invitados si hay emails
    if (event.attendees && event.attendees.length > 0) {
      body.attendees = event.attendees.map(email => ({ 
        email,
        responseStatus: 'needsAction'
      }));
      // Configurar para enviar notificaciones a invitados
      body.guestsCanModify = false;
      body.guestsCanInviteOthers = false;
      body.guestsCanSeeOtherGuests = true;
    }

    // Parámetro para enviar notificaciones por email
    const sendUpdates = event.sendUpdates || 'all';
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${sendUpdates}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 401) {
        googleCalendar.removeToken();
        throw new Error('Token expirado');
      }
      const errorData = await response.json();
      console.error('Google Calendar API Error:', errorData);
      throw new Error(`Error al crear evento: ${errorData.error?.message || 'Desconocido'}`);
    }

    return response.json();
  },

  /**
   * Actualiza un evento existente en Google Calendar
   */
  updateEvent: async (eventId: string, event: Partial<CreateEventParams>): Promise<CreateEventResponse> => {
    const token = googleCalendar.getToken();
    if (!token) throw new Error('No hay token de Google Calendar');

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const body: Record<string, any> = {};
    
    if (event.summary) body.summary = event.summary;
    if (event.description !== undefined) body.description = event.description;
    if (event.start) body.start = { dateTime: event.start, timeZone };
    if (event.end) body.end = { dateTime: event.end, timeZone };
    if (event.location) body.location = event.location;
    if (event.attendees) {
      body.attendees = event.attendees.map(email => ({ email }));
    }

    const sendUpdates = event.sendUpdates || 'all';
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 401) {
        googleCalendar.removeToken();
        throw new Error('Token expirado');
      }
      throw new Error('Error al actualizar evento');
    }

    return response.json();
  },

  /**
   * Elimina un evento de Google Calendar
   * @param eventId - ID del evento en Google Calendar
   * @param sendUpdates - 'all' para notificar a invitados, 'none' para no notificar
   */
  deleteEvent: async (eventId: string, sendUpdates: 'all' | 'none' = 'all'): Promise<void> => {
    const token = googleCalendar.getToken();
    if (!token) throw new Error('No hay token de Google Calendar');

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // 204 = eliminado exitosamente, 410 = ya no existe
    if (!response.ok && response.status !== 204 && response.status !== 410) {
      if (response.status === 401) {
        googleCalendar.removeToken();
        throw new Error('Token expirado');
      }
      throw new Error('Error al eliminar evento');
    }
  },

  /**
   * Obtiene un evento específico por ID
   */
  getEvent: async (eventId: string): Promise<GoogleCalendarEvent | null> => {
    const token = googleCalendar.getToken();
    if (!token) throw new Error('No hay token de Google Calendar');

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 404 || response.status === 410) {
      return null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        googleCalendar.removeToken();
        throw new Error('Token expirado');
      }
      throw new Error('Error al obtener evento');
    }

    return response.json();
  },

  /**
   * Obtiene el email del usuario autenticado
   */
  getUserEmail: async (): Promise<string | null> => {
    const token = googleCalendar.getToken();
    if (!token) return null;

    try {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!response.ok) return null;
      
      const data = await response.json();
      return data.email || null;
    } catch {
      return null;
    }
  }
};

export default googleCalendar;
