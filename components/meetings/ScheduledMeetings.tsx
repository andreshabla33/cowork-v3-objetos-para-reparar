import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabase';
import { ScheduledMeeting, MeetingParticipant } from '../../types';
import { googleCalendar } from '../../lib/googleCalendar';

interface ScheduledMeetingsProps {
  onJoinMeeting?: (salaId: string) => void;
}

export const ScheduledMeetings: React.FC<ScheduledMeetingsProps> = ({ onJoinMeeting }) => {
  const { currentUser, activeWorkspace, theme } = useStore();
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [miembrosEspacio, setMiembrosEspacio] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(googleCalendar.isConnected());

  const [newMeeting, setNewMeeting] = useState({
    titulo: '',
    descripcion: '',
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    participantes: [] as string[],
    recordatorio_minutos: 15
  });

  const loadMeetings = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('reuniones_programadas')
      .select(`
        *,
        creador:usuarios!reuniones_programadas_creado_por_fkey(id, nombre),
        sala:salas_reunion(id, nombre),
        participantes:reunion_participantes(
          id, usuario_id, estado, notificado,
          usuario:usuarios(id, nombre)
        )
      `)
      .eq('espacio_id', activeWorkspace.id)
      .gte('fecha_fin', new Date().toISOString())
      .order('fecha_inicio', { ascending: true });

    if (!error && data) {
      setMeetings(data);
    }
    setLoading(false);
  }, [activeWorkspace?.id]);

  const loadMiembros = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    
    const { data } = await supabase
      .from('miembros_espacio')
      .select('usuario_id')
      .eq('espacio_id', activeWorkspace.id)
      .eq('aceptado', true);

    if (data) {
      const ids = data.map((m: any) => m.usuario_id);
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', ids);
      
      if (usuarios) setMiembrosEspacio(usuarios);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    loadMeetings();
    loadMiembros();

    if (!activeWorkspace?.id) return;
    
    const channel = supabase.channel(`meetings_${activeWorkspace.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'reuniones_programadas',
        filter: `espacio_id=eq.${activeWorkspace.id}`
      }, () => loadMeetings())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeWorkspace?.id, loadMeetings, loadMiembros]);

  const createMeeting = async () => {
    if (!newMeeting.titulo.trim() || !newMeeting.fecha || !newMeeting.hora_inicio || !activeWorkspace?.id) return;

    const fechaInicio = new Date(`${newMeeting.fecha}T${newMeeting.hora_inicio}`);
    const fechaFin = newMeeting.hora_fin 
      ? new Date(`${newMeeting.fecha}T${newMeeting.hora_fin}`)
      : new Date(fechaInicio.getTime() + 60 * 60 * 1000);

    // Variables para Google Calendar
    const meetingCode = Math.random().toString(36).substring(2, 10);
    let meetingLink = `${window.location.origin}/meet/${meetingCode}`;
    let googleEventId: string | null = null;

    // Obtener emails de participantes para invitaciones
    let participantesEmails: string[] = [];
    if (newMeeting.participantes.length > 0) {
      const { data: usuariosData } = await supabase
        .from('usuarios')
        .select('id, email')
        .in('id', newMeeting.participantes);
      
      if (usuariosData) {
        participantesEmails = usuariosData
          .map((u: any) => u.email)
          .filter((email: any): email is string => !!email);
      }
    }

    // Crear evento en Google Calendar si está conectado
    if (googleConnected) {
      try {
        const descripcionCompleta = newMeeting.descripcion.trim() 
          ? `${newMeeting.descripcion.trim()}\n\n---\nReunión creada en Cowork Virtual`
          : 'Reunión creada en Cowork Virtual';

        const googleEvent = await googleCalendar.createEvent({
          summary: newMeeting.titulo.trim(),
          description: descripcionCompleta,
          start: fechaInicio.toISOString(),
          end: fechaFin.toISOString(),
          attendees: participantesEmails,
          sendUpdates: 'all'
        });
        
        if (googleEvent) {
          googleEventId = googleEvent.id;
          if (googleEvent.hangoutLink) {
            meetingLink = googleEvent.hangoutLink;
          }
        }
      } catch (err) {
        console.error('Error creando evento en Google Calendar:', err);
      }
    }

    const { data: meeting, error } = await supabase
      .from('reuniones_programadas')
      .insert({
        espacio_id: activeWorkspace.id,
        titulo: newMeeting.titulo.trim(),
        descripcion: newMeeting.descripcion.trim() || null,
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
        creado_por: currentUser.id,
        recordatorio_minutos: newMeeting.recordatorio_minutos,
        meeting_link: meetingLink,
        google_event_id: googleEventId
      })
      .select()
      .single();

    if (!error && meeting) {
      if (newMeeting.participantes.length > 0) {
        const participantesData = newMeeting.participantes.map(uid => ({
          reunion_id: meeting.id,
          usuario_id: uid,
          estado: 'pendiente'
        }));
        await supabase.from('reunion_participantes').insert(participantesData);
      }

      setShowScheduleModal(false);
      setNewMeeting({
        titulo: '',
        descripcion: '',
        fecha: '',
        hora_inicio: '',
        hora_fin: '',
        participantes: [],
        recordatorio_minutos: 15
      });
      loadMeetings();
    }
  };

  const respondToMeeting = async (meetingId: string, estado: 'aceptado' | 'rechazado' | 'tentativo') => {
    await supabase
      .from('reunion_participantes')
      .update({ estado })
      .eq('reunion_id', meetingId)
      .eq('usuario_id', currentUser.id);
    
    loadMeetings();
  };

  const deleteMeeting = async (meetingId: string, googleEventId?: string) => {
    // Eliminar de Google Calendar primero (notifica a invitados)
    if (googleConnected && googleEventId) {
      try {
        await googleCalendar.deleteEvent(googleEventId, 'all');
      } catch (err) {
        console.error('Error eliminando de Google Calendar:', err);
      }
    }
    
    // Eliminar de Supabase
    await supabase.from('reuniones_programadas').delete().eq('id', meetingId);
    loadMeetings();
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
    return date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const isCreator = (meeting: ScheduledMeeting) => meeting.creado_por === currentUser.id;
  
  const getMyParticipation = (meeting: ScheduledMeeting) => 
    meeting.participantes?.find(p => p.usuario_id === currentUser.id);

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

  const toggleParticipant = (userId: string) => {
    setNewMeeting(prev => ({
      ...prev,
      participantes: prev.participantes.includes(userId)
        ? prev.participantes.filter(id => id !== userId)
        : [...prev.participantes, userId]
    }));
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const getMeetingsForDate = (date: Date) => {
    return meetings.filter(m => {
      const meetingDate = new Date(m.fecha_inicio);
      return meetingDate.toDateString() === date.toDateString();
    });
  };

  const themeStyles = {
    dark: {
      card: 'bg-white/5 border-white/10 hover:bg-white/10',
      cardActive: 'bg-indigo-500/20 border-indigo-500/50',
      btn: 'bg-indigo-600 hover:bg-indigo-500',
      modal: 'bg-[#1a1a2e] border-white/10'
    },
    arcade: {
      card: 'bg-black border-[#00ff41]/30 hover:border-[#00ff41]/60',
      cardActive: 'bg-[#00ff41]/10 border-[#00ff41]',
      btn: 'bg-[#00ff41] text-black hover:bg-white',
      modal: 'bg-black border-[#00ff41]/50'
    }
  };

  const s = themeStyles[theme as keyof typeof themeStyles] || themeStyles.dark;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-sm">Reuniones Programadas</h3>
            <p className="text-[10px] opacity-50">{meetings.length} próximas</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'opacity-50 hover:opacity-100'}`}
            >
              Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'opacity-50 hover:opacity-100'}`}
            >
              Calendario
            </button>
          </div>

          <button
            onClick={() => setShowScheduleModal(true)}
            className={`flex items-center gap-2 px-4 py-2 ${s.btn} rounded-xl text-[11px] font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Programar
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewMode === 'list' ? (
          /* Vista Lista */
          meetings.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-bold text-sm mb-1">Sin reuniones programadas</h4>
              <p className="text-[11px] opacity-50">Programa tu primera reunión para comenzar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map(meeting => {
                const participation = getMyParticipation(meeting);
                const isNow = isMeetingNow(meeting);
                const isSoon = isMeetingSoon(meeting);

                return (
                  <div
                    key={meeting.id}
                    className={`relative p-4 rounded-2xl border transition-all ${
                      isNow ? 'bg-green-500/20 border-green-500/50 animate-pulse' : 
                      isSoon ? 'bg-amber-500/10 border-amber-500/30' : 
                      s.card
                    }`}
                  >
                    {/* Badge de estado */}
                    {isNow && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-500 rounded-full text-[9px] font-black uppercase animate-bounce">
                        EN VIVO
                      </div>
                    )}
                    {isSoon && !isNow && (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-amber-500 text-black rounded-full text-[9px] font-black uppercase">
                        PRONTO
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-sm truncate">{meeting.titulo}</h4>
                          {isCreator(meeting) && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[8px] font-bold">
                              ORGANIZADOR
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-[11px] opacity-60 mb-2">
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDate(meeting.fecha_inicio)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatTime(meeting.fecha_inicio)} - {formatTime(meeting.fecha_fin)}
                          </span>
                        </div>

                        {meeting.descripcion && (
                          <p className="text-[11px] opacity-50 mb-2 line-clamp-2">{meeting.descripcion}</p>
                        )}

                        {/* Participantes */}
                        {meeting.participantes && meeting.participantes.length > 0 && (
                          <div className="flex items-center gap-2 mt-3">
                            <div className="flex -space-x-2">
                              {meeting.participantes.slice(0, 5).map(p => (
                                <div
                                  key={p.id}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2 border-[#1a1a2e] ${
                                    p.estado === 'aceptado' ? 'bg-green-500/30 text-green-300' :
                                    p.estado === 'rechazado' ? 'bg-red-500/30 text-red-300' :
                                    p.estado === 'tentativo' ? 'bg-amber-500/30 text-amber-300' :
                                    'bg-white/10'
                                  }`}
                                  title={`${p.usuario?.nombre} (${p.estado})`}
                                >
                                  {p.usuario?.nombre?.charAt(0) || '?'}
                                </div>
                              ))}
                            </div>
                            <span className="text-[10px] opacity-50">
                              {meeting.participantes.filter(p => p.estado === 'aceptado').length} confirmados
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-col gap-2">
                        {isNow && meeting.sala_id && (
                          <button
                            onClick={() => onJoinMeeting?.(meeting.sala_id!)}
                            className="px-4 py-2 bg-green-500 hover:bg-green-400 rounded-xl text-[10px] font-bold transition-all animate-pulse"
                          >
                            Unirse Ahora
                          </button>
                        )}

                        {participation && !isCreator(meeting) && participation.estado === 'pendiente' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => respondToMeeting(meeting.id, 'aceptado')}
                              className="p-2 bg-green-500/20 hover:bg-green-500/40 text-green-400 rounded-lg transition-all"
                              title="Aceptar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => respondToMeeting(meeting.id, 'tentativo')}
                              className="p-2 bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 rounded-lg transition-all"
                              title="Quizás"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => respondToMeeting(meeting.id, 'rechazado')}
                              className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition-all"
                              title="Rechazar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {isCreator(meeting) && (
                          <button
                            onClick={() => deleteMeeting(meeting.id, meeting.google_event_id)}
                            className="p-2 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg transition-all"
                            title="Cancelar reunión"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Vista Calendario */
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            {/* Navegación del mes */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h4 className="font-bold text-sm">
                {selectedDate.toLocaleDateString('es', { month: 'long', year: 'numeric' })}
              </h4>
              <button
                onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 border-b border-white/10">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                <div key={day} className="p-2 text-center text-[10px] font-bold opacity-50">
                  {day}
                </div>
              ))}
            </div>

            {/* Días del mes */}
            <div className="grid grid-cols-7">
              {getDaysInMonth(selectedDate).map((date, i) => {
                if (!date) return <div key={i} className="p-2 min-h-[80px]" />;
                
                const dayMeetings = getMeetingsForDate(date);
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={i}
                    className={`p-2 min-h-[80px] border-r border-b border-white/5 hover:bg-white/5 transition-colors ${
                      isToday ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <div className={`text-[11px] font-bold mb-1 ${isToday ? 'text-indigo-400' : 'opacity-60'}`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayMeetings.slice(0, 2).map(m => (
                        <div
                          key={m.id}
                          className="px-1.5 py-0.5 bg-indigo-500/30 rounded text-[8px] truncate cursor-pointer hover:bg-indigo-500/50 transition-colors"
                          title={`${m.titulo} - ${formatTime(m.fecha_inicio)}`}
                        >
                          {formatTime(m.fecha_inicio)} {m.titulo}
                        </div>
                      ))}
                      {dayMeetings.length > 2 && (
                        <div className="text-[8px] text-indigo-400 pl-1">+{dayMeetings.length - 2} más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal Programar Reunión */}
      {showScheduleModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setShowScheduleModal(false)}
        >
          <div 
            className={`w-full max-w-lg rounded-3xl ${s.modal} border shadow-2xl overflow-hidden`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="p-6 border-b border-white/10 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold">Programar Reunión</h3>
                  <p className="text-[11px] opacity-50">Crea una nueva reunión y envía invitaciones</p>
                </div>
              </div>
            </div>

            {/* Contenido del modal */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Título */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                  Título de la reunión *
                </label>
                <input
                  type="text"
                  value={newMeeting.titulo}
                  onChange={e => setNewMeeting({ ...newMeeting, titulo: e.target.value })}
                  placeholder="Ej: Daily Standup, Revisión de Sprint..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              {/* Fecha y Hora */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={newMeeting.fecha}
                    onChange={e => setNewMeeting({ ...newMeeting, fecha: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                    Hora inicio *
                  </label>
                  <input
                    type="time"
                    value={newMeeting.hora_inicio}
                    onChange={e => setNewMeeting({ ...newMeeting, hora_inicio: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                    Hora fin
                  </label>
                  <input
                    type="time"
                    value={newMeeting.hora_fin}
                    onChange={e => setNewMeeting({ ...newMeeting, hora_fin: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                  Descripción
                </label>
                <textarea
                  value={newMeeting.descripcion}
                  onChange={e => setNewMeeting({ ...newMeeting, descripcion: e.target.value })}
                  placeholder="Agenda o detalles de la reunión..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                />
              </div>

              {/* Recordatorio */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                  Recordatorio
                </label>
                <select
                  value={newMeeting.recordatorio_minutos}
                  onChange={e => setNewMeeting({ ...newMeeting, recordatorio_minutos: parseInt(e.target.value) })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                >
                  <option value={5}>5 minutos antes</option>
                  <option value={10}>10 minutos antes</option>
                  <option value={15}>15 minutos antes</option>
                  <option value={30}>30 minutos antes</option>
                  <option value={60}>1 hora antes</option>
                </select>
              </div>

              {/* Participantes */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">
                  Invitar participantes
                </label>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 max-h-40 overflow-y-auto">
                  {miembrosEspacio.filter(m => m.id !== currentUser.id).length === 0 ? (
                    <p className="text-[11px] opacity-40 text-center py-2">No hay otros miembros</p>
                  ) : (
                    <div className="space-y-1">
                      {miembrosEspacio.filter(m => m.id !== currentUser.id).map(member => (
                        <button
                          key={member.id}
                          onClick={() => toggleParticipant(member.id)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                            newMeeting.participantes.includes(member.id)
                              ? 'bg-indigo-500/20 border border-indigo-500/50'
                              : 'hover:bg-white/5'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            newMeeting.participantes.includes(member.id) ? 'bg-indigo-500' : 'bg-white/10'
                          }`}>
                            {member.nombre?.charAt(0) || '?'}
                          </div>
                          <span className="text-[12px] font-medium flex-1 text-left">{member.nombre}</span>
                          {newMeeting.participantes.includes(member.id) && (
                            <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {newMeeting.participantes.length > 0 && (
                  <p className="text-[10px] text-indigo-400 mt-2">
                    {newMeeting.participantes.length} participante(s) seleccionado(s)
                  </p>
                )}
              </div>
            </div>

            {/* Footer del modal */}
            <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[12px] font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={createMeeting}
                disabled={!newMeeting.titulo.trim() || !newMeeting.fecha || !newMeeting.hora_inicio}
                className={`flex-1 px-4 py-3 ${s.btn} disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-[12px] font-bold transition-all shadow-lg`}
              >
                Programar Reunión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledMeetings;
