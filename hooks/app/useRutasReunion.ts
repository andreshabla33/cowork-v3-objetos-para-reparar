import { useCallback, useEffect, useState } from 'react';

export function useRutasReunion() {
  const [meetingToken, setMeetingToken] = useState<string | null>(null);
  const [directSalaId, setDirectSalaId] = useState<string | null>(() => sessionStorage.getItem('pending_sala_id'));
  const [inMeeting, setInMeeting] = useState(false);
  const [meetingNombre, setMeetingNombre] = useState('');
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

  const iniciarLobbyInvitacion = useCallback((token: string, nombre: string) => {
    setMeetingToken(token);
    setMeetingNombre(nombre);
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
    showThankYou,
    cerrarAgradecimiento,
    iniciarLobbyInvitacion,
    mostrarAgradecimiento,
    salirSalaDirecta,
  };
}
