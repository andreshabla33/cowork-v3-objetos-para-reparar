import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY_PREFERENCIAS_REUNION = 'meeting_join_preferences';

export interface PreferenciasIngresoReunion {
  microfonoActivo: boolean;
  camaraActiva: boolean;
}

export function useRutasReunion() {
  const [meetingToken, setMeetingToken] = useState<string | null>(null);
  const [directSalaId, setDirectSalaId] = useState<string | null>(() => sessionStorage.getItem('pending_sala_id'));
  const [inMeeting, setInMeeting] = useState(false);
  const [meetingNombre, setMeetingNombre] = useState('');
  const [preferenciasIngresoReunion, setPreferenciasIngresoReunion] = useState<PreferenciasIngresoReunion>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PREFERENCIAS_REUNION);
      if (!raw) {
        return { microfonoActivo: false, camaraActiva: false };
      }

      const parsed = JSON.parse(raw) as Partial<PreferenciasIngresoReunion>;
      return {
        microfonoActivo: parsed.microfonoActivo ?? false,
        camaraActiva: parsed.camaraActiva ?? false,
      };
    } catch {
      return { microfonoActivo: false, camaraActiva: false };
    }
  });
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/join/')) {
      const token = path.replace('/join/', '');
      if (token) {
        setMeetingToken(token);
      }
    } else if (path.startsWith('/sala/')) {
      const salaId = path.replace('/sala/', '');
      if (salaId) {
        setDirectSalaId(salaId);
        sessionStorage.setItem('pending_sala_id', salaId);
      }
    }
  }, []);

  const iniciarLobbyInvitacion = useCallback((token: string, nombre: string, preferencias?: PreferenciasIngresoReunion) => {
    const preferenciasFinales = preferencias ?? { microfonoActivo: false, camaraActiva: false };
    setMeetingToken(token);
    setMeetingNombre(nombre);
    setPreferenciasIngresoReunion(preferenciasFinales);
    sessionStorage.setItem(STORAGE_KEY_PREFERENCIAS_REUNION, JSON.stringify(preferenciasFinales));
    setInMeeting(true);
  }, []);

  const mostrarAgradecimiento = useCallback(() => {
    setInMeeting(false);
    setShowThankYou(true);
  }, []);

  const cerrarAgradecimiento = useCallback(() => {
    setShowThankYou(false);
    setMeetingToken(null);
    setMeetingNombre('');
    setInMeeting(false);
    setPreferenciasIngresoReunion({ microfonoActivo: false, camaraActiva: false });
    sessionStorage.removeItem(STORAGE_KEY_PREFERENCIAS_REUNION);
    window.history.pushState({}, '', '/');
  }, []);

  const salirSalaDirecta = useCallback(() => {
    setDirectSalaId(null);
    sessionStorage.removeItem('pending_sala_id');
    window.history.pushState({}, '', '/');
  }, []);

  return {
    directSalaId,
    inMeeting,
    meetingNombre,
    meetingToken,
    preferenciasIngresoReunion,
    showThankYou,
    cerrarAgradecimiento,
    iniciarLobbyInvitacion,
    mostrarAgradecimiento,
    salirSalaDirecta,
  };
}
