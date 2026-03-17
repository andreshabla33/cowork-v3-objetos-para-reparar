import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { ChatGroup, ChatMessage, User } from '../types';
import { useStore } from '../store/useStore';
import { ModalCrearGrupo } from './chat/ModalCrearGrupo';
import { AgregarMiembros } from './chat/AgregarMiembros';
import { ChatToast, ToastNotification } from './ChatToast';
import { MeetingRooms } from './MeetingRooms';
import { UserAvatar } from './UserAvatar';
import { PresenceStatus } from '../types';
import { getSettingsSection } from '../lib/userSettings';
import { audioManager } from '../services/audioManager';

// Helper para obtener color del estado
const getStatusColor = (status?: PresenceStatus) => {
  switch (status) {
    case PresenceStatus.AVAILABLE: return 'bg-green-500';
    case PresenceStatus.BUSY: return 'bg-red-500';
    case PresenceStatus.AWAY: return 'bg-yellow-500';
    case PresenceStatus.DND: return 'bg-purple-500';
    default: return 'bg-zinc-500';
  }
};

interface ChatPanelProps {
  sidebarOnly?: boolean;
  chatOnly?: boolean;
  onChannelSelect?: () => void;
  showNotifications?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ sidebarOnly = false, chatOnly = false, onChannelSelect, showNotifications = false }) => {
  const { activeWorkspace, currentUser, setActiveSubTab, theme, onlineUsers, incrementUnreadChat, activeSubTab, activeChatGroupId, setActiveChatGroupId, userRoleInActiveWorkspace } = useStore();
  const [grupos, setGrupos] = useState<ChatGroup[]>([]);
  const grupoActivo = activeChatGroupId;
  const setGrupoActivo = setActiveChatGroupId;
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [miembrosEspacio, setMiembrosEspacio] = useState<any[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [directChats, setDirectChats] = useState<any[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});
  const [showMeetingRooms, setShowMeetingRooms] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  
  const mensajesRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const globalNotifChannelRef = useRef<any>(null);
  const notificationSoundRef = useRef<HTMLAudioElement | null>(null);

  // Inicializar sonido de notificación
  useEffect(() => {
    notificationSoundRef.current = null;
  }, []);

  const playNotificationSound = () => {
    audioManager.playChatNotification().catch(() => {});
  };

  const refetchGrupos = async () => {
    if (!activeWorkspace) return;
    const { data, error } = await supabase
      .from('grupos_chat')
      .select('*')
      .eq('espacio_id', activeWorkspace.id)
      .order('creado_en', { ascending: true });
    if (!error && data) setGrupos(data);
    return data;
  };

  useEffect(() => {
    if (!activeWorkspace) return;
    const cargarGrupos = async () => {
      setLoading(true);
      const data = await refetchGrupos();
      if (data && data.length > 0 && !grupoActivo) {
        const canales = data.filter(g => g.tipo !== 'directo');
        const general = canales.find(g => g.nombre.toLowerCase() === 'general');
        setGrupoActivo(general ? general.id : (canales[0]?.id || data[0].id));
      }
      setLoading(false);
    };
    cargarGrupos();

    // Cargar miembros del espacio
    const cargarMiembros = async () => {
      // Obtener el usuario actual de la sesiÃ³n
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      
      // Query directa a usuarios a travÃ©s del usuario_id
      const { data, error } = await supabase
        .from('miembros_espacio')
        .select('usuario_id')
        .eq('espacio_id', activeWorkspace.id)
        .eq('aceptado', true);
      
      console.log('Miembros IDs:', data, 'Error:', error, 'CurrentUserId:', currentUserId);
      
      if (data && data.length > 0) {
        // Filtrar el usuario actual y obtener IDs Ãºnicos (evitar duplicados)
        const otrosIds = [...new Set(
          data
            .map((m: any) => m.usuario_id)
            .filter((id: string) => id !== currentUserId)
        )];
        
        if (otrosIds.length > 0) {
          const { data: usuarios } = await supabase
            .from('usuarios')
            .select('id, nombre, email, avatar_url')
            .in('id', otrosIds);
          
          console.log('Usuarios encontrados:', usuarios);
          // Eliminar posibles duplicados por ID
          const uniqueUsuarios = usuarios?.filter((u: any, index: number, self: any[]) => 
            index === self.findIndex((t: any) => t.id === u.id)
          ) || [];
          setMiembrosEspacio(uniqueUsuarios);
        }
      }
    };
    cargarMiembros();
  }, [activeWorkspace]);

  // Refetch grupos cuando grupoActivo cambia a un grupo que no está en el estado local
  // (ej: canal creado en la instancia sidebarOnly, pero chatOnly no lo tiene)
  useEffect(() => {
    if (grupoActivo && activeWorkspace && !grupos.find(g => g.id === grupoActivo)) {
      refetchGrupos();
    }
  }, [grupoActivo, activeWorkspace]);

  // Cargar miembros del canal activo
  useEffect(() => {
    if (!grupoActivo) return;
    const cargarMiembrosCanal = async () => {
      const { data: miembros } = await supabase
        .from('miembros_grupo')
        .select('usuario_id, rol, unido_en')
        .eq('grupo_id', grupoActivo);
      
      if (miembros && miembros.length > 0) {
        const userIds = miembros.map(m => m.usuario_id);
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, nombre, email')
          .in('id', userIds);
        
        const merged = miembros.map(m => ({
          ...m,
          usuario: usuarios?.find(u => u.id === m.usuario_id)
        }));
        setChannelMembers(merged);
      } else {
        setChannelMembers([]);
      }
    };
    cargarMiembrosCanal();
  }, [grupoActivo]);

  // SuscripciÃ³n global para toast notifications (todos los canales)
  useEffect(() => {
    if (!activeWorkspace || !currentUser.id || !showNotifications) return;
    
    if (globalNotifChannelRef.current) {
      supabase.removeChannel(globalNotifChannelRef.current);
    }

    const globalChannel = supabase.channel(`global_notif_${activeWorkspace.id}_${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes_chat'
      }, async (payload) => {
        // No notificar mis propios mensajes
        if (payload.new.usuario_id === currentUser.id) return;
        
        // Obtener info del grupo
        const { data: grupoData } = await supabase
          .from('grupos_chat')
          .select('nombre, tipo, espacio_id')
          .eq('id', payload.new.grupo_id)
          .single();
        
        // Solo notificar si es del mismo espacio
        if (grupoData?.espacio_id !== activeWorkspace.id) return;
        
        // Incrementar contador global y por canal
        incrementUnreadChat();
        setUnreadByChannel(prev => ({
          ...prev,
          [payload.new.grupo_id]: (prev[payload.new.grupo_id] || 0) + 1
        }));
        
        // Obtener info del usuario para el toast
        const { data: senderData } = await supabase
          .from('usuarios')
          .select('nombre')
          .eq('id', payload.new.usuario_id)
          .single();
        
        if (senderData) {
          const isDirect = grupoData?.tipo === 'directo';
          const menciones = payload.new.menciones || [];
          const isMentioned = menciones.includes(currentUser.id);
          
          console.log('🔔 Toast notification:', senderData.nombre, payload.new.contenido, isMentioned ? '(MENCIONADO)' : '');
          
          // Reproducir sonido de notificaciÃ³n
          playNotificationSound();
          
          addToastNotification(
            senderData.nombre,
            isMentioned ? `📢 Te mencionó: ${payload.new.contenido}` : payload.new.contenido,
            payload.new.grupo_id,
            isDirect ? undefined : grupoData?.nombre,
            isDirect
          );
        }
      }).subscribe((status) => {
        console.log('Global notification channel:', status);
      });

    globalNotifChannelRef.current = globalChannel;

    return () => {
      if (globalNotifChannelRef.current) {
        supabase.removeChannel(globalNotifChannelRef.current);
        globalNotifChannelRef.current = null;
      }
    };
  }, [activeWorkspace?.id, currentUser.id]);

  useEffect(() => {
    if (!grupoActivo) return;
    // Solo cargar mensajes y suscribirse a realtime si NO es sidebarOnly
    // Esto evita suscripciones duplicadas cuando hay dos instancias de ChatPanel
    if (sidebarOnly) return;
    
    const currentGrupo = grupoActivo; // Capturar para evitar stale closures
    console.log('Loading messages for grupo:', currentGrupo);
    const cargarMensajes = async () => {
      const { data, error } = await supabase
        .from('mensajes_chat')
        .select(`id, contenido, creado_en, usuario_id, tipo, respuesta_a, menciones, usuario:usuarios!mensajes_chat_usuario_id_fkey(id, nombre)`)
        .eq('grupo_id', currentGrupo)
        .is('respuesta_a', null)
        .order('creado_en', { ascending: true });
      
      console.log('Messages loaded:', data?.length, 'for grupo:', currentGrupo);
      if (!error && data) { 
        setMensajes(data as any); 
        scrollToBottom();
        
        // Cargar conteo de respuestas para cada mensaje
        const messageIds = data.map((m: any) => m.id);
        if (messageIds.length > 0) {
          const { data: replies } = await supabase
            .from('mensajes_chat')
            .select('respuesta_a')
            .in('respuesta_a', messageIds);
          
          if (replies) {
            const counts: Record<string, number> = {};
            replies.forEach((r: any) => {
              counts[r.respuesta_a] = (counts[r.respuesta_a] || 0) + 1;
            });
            setThreadCounts(counts);
          }
        }
      }
    };
    cargarMensajes();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    
    const channel = supabase.channel(`chat_realtime_${currentGrupo}_${Date.now()}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'mensajes_chat', 
        filter: `grupo_id=eq.${currentGrupo}` 
      }, async (payload) => {
        console.log('Nuevo mensaje recibido en canal activo:', payload.new);
        
        // Recargar todos los mensajes para asegurar consistencia
        const { data } = await supabase
          .from('mensajes_chat')
          .select(`id, contenido, creado_en, usuario_id, tipo, usuario:usuarios!mensajes_chat_usuario_id_fkey(id, nombre)`)
          .eq('grupo_id', currentGrupo)
          .order('creado_en', { ascending: true });
        
        if (data) {
          setMensajes(data as any);
          scrollToBottom();
        }
      }).subscribe((status) => {
        console.log('Chat realtime status:', status);
        if (status === 'CHANNEL_ERROR') {
          // Reintentar suscripción después de 2s
          setTimeout(() => {
            console.log('Retrying chat subscription for grupo:', currentGrupo);
            channel.subscribe();
          }, 2000);
        }
      });
    
    channelRef.current = channel;

    // Canal para typing indicator
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
    }
    const typingChannel = supabase.channel(`typing_${currentGrupo}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id !== currentUser.id) {
          setTypingUsers(prev => {
            if (!prev.includes(payload.user_name)) return [...prev, payload.user_name];
            return prev;
          });
          // Remover después de 3 segundos
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u !== payload.user_name));
          }, 3000);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    return () => { 
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
      }
    };
  }, [grupoActivo, sidebarOnly]);

  // Broadcast typing cuando el usuario escribe
  const handleTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUser.id, user_name: currentUser.name }
    });
    typingTimeoutRef.current = setTimeout(() => {}, 2000);
  };

  const scrollToBottom = () => {
    setTimeout(() => { if (mensajesRef.current) mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight; }, 150);
  };

  // Emojis comunes
  const emojis = ['😀', '😂', '🥰', '😎', '🤔', '👍', '👎', '❤️', '🔥', '🎉', '✅', '💯', '🚀', '💡', '⭐'];

  // Detectar menciones en el texto (@usuario)
  const detectMentions = (text: string): string[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const userName = match[1].toLowerCase();
      const user = miembrosEspacio.find(m => m.nombre?.toLowerCase().includes(userName));
      if (user) mentions.push(user.id);
    }
    return [...new Set(mentions)];
  };

  // Manejar input con detecciÃ³n de @
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNuevoMensaje(value);
    
    // Detectar si estamos escribiendo una menciÃ³n
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (atMatch) {
      setShowMentionPicker(true);
      setMentionFilter(atMatch[1].toLowerCase());
      setMentionCursorPos(cursorPos - atMatch[0].length);
    } else {
      setShowMentionPicker(false);
    }
    
    handleTyping();
  };

  // Insertar menciÃ³n seleccionada
  const insertMention = (user: any) => {
    const beforeMention = nuevoMensaje.substring(0, mentionCursorPos);
    const afterMention = nuevoMensaje.substring(mentionCursorPos).replace(/@\w*/, '');
    const newText = `${beforeMention}@${user.nombre} ${afterMention}`;
    setNuevoMensaje(newText);
    setShowMentionPicker(false);
    inputRef.current?.focus();
  };

  // Usuarios filtrados para el picker de menciones
  const filteredMentionUsers = miembrosEspacio.filter(u => 
    u.id !== currentUser.id && 
    u.nombre?.toLowerCase().includes(mentionFilter)
  );

  const enviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !grupoActivo || !currentUser.id) return;
    const content = nuevoMensaje.trim();
    const menciones = detectMentions(content);
    setNuevoMensaje('');
    setShowMentionPicker(false);
    
    const messageData: any = { 
      grupo_id: grupoActivo, 
      usuario_id: currentUser.id, 
      contenido: content, 
      tipo: 'texto',
      menciones: menciones.length > 0 ? menciones : null,
      respuesta_a: activeThread || null
    };
    
    const { data, error } = await supabase.from('mensajes_chat').insert(messageData).select(`id, contenido, creado_en, usuario_id, tipo, respuesta_a, menciones, usuario:usuarios!mensajes_chat_usuario_id_fkey(id, nombre)`).single();
    
    if (error) {
      console.error('Error enviando mensaje:', error);
      setNuevoMensaje(content);
    } else if (data) {
      // Agregar mensaje localmente inmediatamente (no esperar realtime)
      if (activeThread) {
        setThreadMessages(prev => [...prev, data as any]);
      } else {
        setMensajes(prev => [...prev, data as any]);
      }
      scrollToBottom();
    }
  };

  // Abrir hilo de un mensaje
  const openThread = async (messageId: string) => {
    setActiveThread(messageId);
    const { data } = await supabase
      .from('mensajes_chat')
      .select(`id, contenido, creado_en, usuario_id, tipo, menciones, usuario:usuarios!mensajes_chat_usuario_id_fkey(id, nombre)`)
      .or(`id.eq.${messageId},respuesta_a.eq.${messageId}`)
      .order('creado_en', { ascending: true });
    if (data) setThreadMessages(data as any);
  };

  // Cerrar hilo
  const closeThread = () => {
    setActiveThread(null);
    setThreadMessages([]);
  };

  // Renderizar contenido con menciones resaltadas
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const userName = part.substring(1).toLowerCase();
        const isMentioningMe = miembrosEspacio.find(m => 
          m.nombre?.toLowerCase() === userName && m.id === currentUser.id
        );
        return (
          <span key={i} className={`px-1 rounded ${isMentioningMe ? 'bg-yellow-500/30 text-yellow-300 font-bold' : 'bg-indigo-500/30 text-indigo-300'}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Eliminar canal (solo admin/super_admin o creador)
  const handleDeleteChannel = async (grupoId: string, grupoNombre: string) => {
    const confirmado = window.confirm(`¿Estás seguro de eliminar el canal "${grupoNombre}"? Se eliminarán todos los mensajes.`);
    if (!confirmado) return;

    // Eliminar mensajes del canal
    await supabase.from('mensajes_chat').delete().eq('grupo_id', grupoId);
    // Eliminar miembros del canal
    await supabase.from('miembros_grupo').delete().eq('grupo_id', grupoId);
    // Eliminar el canal
    const { error } = await supabase.from('grupos_chat').delete().eq('id', grupoId);
    if (error) {
      console.error('❌ Error eliminando canal:', error);
      alert('Error al eliminar el canal: ' + error.message);
      return;
    }
    // Actualizar estado local
    setGrupos(prev => prev.filter(g => g.id !== grupoId));
    // Si el canal eliminado era el activo, seleccionar otro
    if (grupoActivo === grupoId) {
      const restantes = grupos.filter(g => g.id !== grupoId && g.tipo !== 'directo');
      if (restantes.length > 0) {
        setGrupoActivo(restantes[0].id);
      } else {
        setGrupoActivo('');
      }
    }
  };

  const canDeleteChannel = (grupo: ChatGroup) => {
    if (!userRoleInActiveWorkspace) return false;
    const isAdmin = ['admin', 'super_admin'].includes(userRoleInActiveWorkspace);
    const isCreator = grupo.creado_por === currentUser.id;
    return isAdmin || isCreator;
  };

  const handleChannelSelect = (id: string) => {
    setGrupoActivo(id);
    setUnreadByChannel(prev => ({ ...prev, [id]: 0 })); // Limpiar no leÃ­dos del canal
    setActiveSubTab('chat' as any);
    if (onChannelSelect) onChannelSelect();
  };

  // Crear o abrir chat directo con un miembro
  const openDirectChat = async (targetUser: any) => {
    console.log('openDirectChat called with:', targetUser, 'currentUser:', currentUser.id);
    if (!activeWorkspace || !currentUser.id) {
      console.log('Missing workspace or currentUser');
      return;
    }
    if (targetUser.id === currentUser.id) {
      console.log('Cannot DM yourself');
      return;
    }
    // Respetar setting de privacidad: allowDirectMessages
    const privacyS = getSettingsSection('privacy');
    if (!privacyS.allowDirectMessages) {
      alert('Has desactivado los mensajes directos en tu configuración de privacidad.');
      return;
    }
    
    // Buscar si ya existe un chat directo entre estos dos usuarios
    const { data: existingChats } = await supabase
      .from('grupos_chat')
      .select('*')
      .eq('espacio_id', activeWorkspace.id)
      .eq('tipo', 'directo');
    
    // Buscar chat directo que incluya ambos usuarios
    let directChat = existingChats?.find(chat => {
      const participants = chat.nombre.split('|');
      return participants.includes(currentUser.id) && participants.includes(targetUser.id);
    });

    if (!directChat) {
      console.log('Creating new direct chat...');
      // Crear nuevo chat directo
      const { data, error } = await supabase
        .from('grupos_chat')
        .insert({
          espacio_id: activeWorkspace.id,
          nombre: `${currentUser.id}|${targetUser.id}`,
          tipo: 'directo',
          creado_por: currentUser.id,
          icono: '💬'
        })
        .select()
        .single();
      
      console.log('Create result:', data, error);
      if (!error && data) {
        directChat = data;
        // Recargar todos los grupos para incluir el nuevo
        const { data: allGroups } = await supabase
          .from('grupos_chat')
          .select('*')
          .eq('espacio_id', activeWorkspace.id)
          .order('creado_en', { ascending: true });
        if (allGroups) setGrupos(allGroups);
      }
    } else {
      console.log('Found existing chat:', directChat);
    }

    if (directChat) {
      console.log('Selecting chat:', directChat.id);
      setGrupoActivo(directChat.id);
      setActiveSubTab('chat');
    }
  };

  // Agregar toast notification
  const addToastNotification = (userName: string, message: string, groupId: string, channelName?: string, isDirect?: boolean) => {
    console.log('Adding toast notification:', userName, message);
    const newToast: ToastNotification = {
      id: `toast_${Date.now()}`,
      userName,
      userInitial: userName.charAt(0).toUpperCase(),
      message,
      channelName,
      isDirect,
      groupId,
      timestamp: new Date()
    };
    setToastNotifications(prev => {
      console.log('Toast notifications count:', prev.length + 1);
      return [...prev.slice(-4), newToast];
    });
  };

  const dismissToast = (id: string) => {
    setToastNotifications(prev => prev.filter(t => t.id !== id));
  };

  // Manejar archivo adjunto
  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !grupoActivo) return;
    
    // Subir a Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(`${activeWorkspace?.id}/${fileName}`, file);
    
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(data.path);
      // Enviar mensaje con el archivo
      await supabase.from('mensajes_chat').insert({
        grupo_id: grupoActivo,
        usuario_id: currentUser.id,
        contenido: `📎 [${file.name}](${urlData.publicUrl})`,
        tipo: 'archivo'
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const chatStyles = {
    dark: {
      sidebarBg: 'bg-[#19171d]',
      chatBg: 'bg-[#1a1d21]',
      bubbleOther: 'bg-[#2d3136] text-zinc-100',
      bubbleSelf: 'bg-indigo-600 text-white',
      input: 'bg-black/40 border-white/10 text-white',
      btn: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg',
      activeItem: 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20'
    },
    light: {
      sidebarBg: 'bg-zinc-100',
      chatBg: 'bg-white',
      bubbleOther: 'bg-zinc-200 text-zinc-900',
      bubbleSelf: 'bg-indigo-600 text-white',
      input: 'bg-zinc-50 border-zinc-300 text-zinc-900',
      btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md',
      activeItem: 'bg-white text-indigo-600 border border-zinc-200 shadow-md font-black'
    },
    space: {
      sidebarBg: 'bg-[#1e1b4b]',
      chatBg: 'bg-[#020617]',
      bubbleOther: 'bg-[#1e293b] text-indigo-100 border border-indigo-500/20',
      bubbleSelf: 'bg-cyan-700 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]',
      input: 'bg-indigo-950/50 border-indigo-900/50 text-indigo-100',
      btn: 'bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg',
      activeItem: 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]'
    },
    arcade: {
      sidebarBg: 'bg-black',
      chatBg: 'bg-black',
      bubbleOther: 'bg-black border-2 border-[#00ff41]/40 text-[#00ff41]',
      bubbleSelf: 'bg-[#00ff41] text-black font-black shadow-[0_0_20px_#00ff41]',
      input: 'bg-black border-2 border-[#00ff41] text-[#00ff41]',
      btn: 'bg-[#00ff41] hover:bg-white text-black font-black uppercase tracking-tighter',
      activeItem: 'bg-[#00ff41] text-black font-black shadow-[0_0_10px_#00ff41]'
    }
  };

  const s = chatStyles[theme] || chatStyles.dark;
  const grupoActivoData = grupos.find(g => g.id === grupoActivo);

  if (sidebarOnly) {
    return (
      <div className={`h-full flex flex-col overflow-hidden transition-all duration-500 ${s.sidebarBg}`}>
        {/* Workspace Header */}
        <div className={`p-5 border-b border-white/5 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors group`}>
          <h2 className={`font-black text-xs uppercase tracking-tight truncate ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{activeWorkspace?.name || 'Workspace'}</h2>
          <svg className="w-4 h-4 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Navegación Principal: Juntas, Calendario */}
          <div className="px-2 py-4 space-y-0.5">
            <button 
              onClick={() => setShowMeetingRooms(!showMeetingRooms)}
              className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${showMeetingRooms ? s.activeItem : 'hover:bg-white/5'}`}
            >
              <span className="w-4 text-center opacity-60">🎧</span>
              <span className="truncate">{t('sidebar.meetings')}</span>
              <svg className={`w-3 h-3 ml-auto opacity-50 transition-transform ${showMeetingRooms ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMeetingRooms && <MeetingRooms />}
            <button 
              onClick={() => setActiveSubTab('calendar')}
              className={`w-full text-left px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeSubTab === 'calendar' ? s.activeItem : 'hover:bg-white/5'}`}
            >
              <span className="w-4 text-center opacity-60">📅</span>
              <span className="truncate">{t('sidebar.calendar')}</span>
              <svg className="w-3 h-3 ml-auto opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="h-px bg-white/5 mx-4 my-2" />

          {/* Canales */}
          <div className="px-2 py-4">
            <div className="px-3 mb-2 group flex items-center justify-between">
              <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{t('sidebar.channels')}</h3>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowCreateModal(true); }}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${theme === 'arcade' ? 'bg-[#00ff41] text-black shadow-[0_0_10px_#00ff41]' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                title="Crear Canal"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
              </button>
            </div>
            <div className="space-y-0.5">
              {grupos.filter(g => g.tipo !== 'directo').map(g => {
                const unreadCount = unreadByChannel[g.id] || 0;
                return (
                <div key={g.id} className="group/channel relative flex items-center">
                  <button 
                    onClick={() => handleChannelSelect(g.id)} 
                    className={`w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${grupoActivo === g.id ? s.activeItem : (unreadCount > 0 ? 'opacity-100 bg-white/5' : 'opacity-50 hover:opacity-100 hover:bg-white/5')}`}
                  >
                    <span className="opacity-40">{g.tipo === 'privado' ? '🔒' : '#'}</span>
                    <span className="truncate flex-1">{g.nombre}</span>
                    {unreadCount > 0 && (
                      <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {canDeleteChannel(g) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteChannel(g.id, g.nombre); }}
                      className="absolute right-2 opacity-0 group-hover/channel:opacity-60 hover:!opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
                      title="Eliminar canal"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  )}
                </div>
              );})}
            </div>
          </div>

          <div className="h-px bg-white/5 mx-4 my-2" />

          {/* Mensajes Directos */}
          <div className="px-2 py-4">
            <div className="px-3 mb-2">
              <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>{t('sidebar.directMessages')}</h3>
            </div>
            <div className="space-y-0.5">
              {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).map(g => {
                const unreadCount = unreadByChannel[g.id] || 0;
                // Obtener el nombre del otro usuario del DM
                const otherUserId = g.nombre.split('|').find((id: string) => id !== currentUser.id);
                const otherUser = miembrosEspacio.find((m: any) => m.id === otherUserId);
                const isOnline = onlineUsers.some(ou => ou.id === otherUserId);
                return (
                <button 
                  key={g.id} 
                  onClick={() => handleChannelSelect(g.id)} 
                  className={`w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${grupoActivo === g.id ? s.activeItem : (unreadCount > 0 ? 'opacity-100 bg-white/5' : 'opacity-50 hover:opacity-100 hover:bg-white/5')}`}
                >
                  <div className="relative">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[8px] font-black">{otherUser?.nombre?.charAt(0) || '?'}</div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#19171d] ${isOnline ? getStatusColor(onlineUsers.find(ou => ou.id === otherUserId)?.status) : 'bg-zinc-500'}`} />
                  </div>
                  <span className="truncate flex-1">{otherUser?.nombre || 'Usuario'}</span>
                  {unreadCount > 0 && (
                    <span className="w-5 h-5 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              );})}
              {grupos.filter(g => g.tipo === 'directo' && g.nombre.includes(currentUser.id)).length === 0 && (
                <p className="px-4 py-2 text-[9px] opacity-30 italic font-bold">Sin mensajes directos</p>
              )}
            </div>
          </div>

          <div className="h-px bg-white/5 mx-4 my-2" />

          {/* Conectados */}
          <div className="px-2 py-4">
            <div className="px-3 mb-2">
              <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>CONECTADOS ({onlineUsers.length})</h3>
            </div>
            <div className="space-y-0.5">
              {miembrosEspacio.filter((u: any) => u.id !== currentUser.id).length > 0 ? miembrosEspacio.filter((u: any) => u.id !== currentUser.id).map((u: any) => {
                const isOnline = onlineUsers.some(ou => ou.id === u.id);
                return (
                <button 
                  key={u.id} 
                  onClick={() => { console.log('Opening DM with:', u); openDirectChat(u); }}
                  className="w-full text-left px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-white/5 transition-all flex items-center gap-3 cursor-pointer opacity-50 hover:opacity-100"
                >
                  <UserAvatar
                    name={u.nombre || ''}
                    profilePhoto={u.avatar_url}
                    size="xs"
                    showStatus
                    status={isOnline ? onlineUsers.find(ou => ou.id === u.id)?.status : undefined}
                  />
                  <span className="truncate flex-1">{u.nombre}</span>
                </button>
              );}) : (
                 <p className="px-4 py-2 text-[9px] opacity-30 italic font-bold">No hay otros miembros</p>
              )}
              {/* BotÃ³n para invitar - Solo visible para admin y super_admin */}
              {userRoleInActiveWorkspace && !['member', 'miembro'].includes(userRoleInActiveWorkspace) && (
                <button 
                  onClick={() => setActiveSubTab('miembros')}
                  className="w-full text-left px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 hover:bg-indigo-500/10 transition-all flex items-center gap-3 mt-2"
                >
                  <span className="w-5 h-5 flex items-center justify-center bg-indigo-500/20 rounded-lg text-lg">+</span>
                  {t('sidebar.invitePeople')}
                </button>
              )}
            </div>
          </div>
        </div>

        {showCreateModal && <ModalCrearGrupo onClose={() => setShowCreateModal(false)} onCreate={async (nombre, tipo, contrasena) => {
          console.log('📢 Creando canal:', nombre, tipo, 'espacio:', activeWorkspace?.id, 'user:', currentUser.id);
          const insertData: any = { espacio_id: activeWorkspace!.id, nombre, tipo, creado_por: currentUser.id, icono: tipo === 'privado' ? '🔒' : '#' };
          if (contrasena) insertData.contrasena = contrasena;
          const { data, error } = await supabase.from('grupos_chat').insert(insertData).select().single();
          if (error) { console.error('❌ Error creando canal:', error); alert('Error al crear el canal: ' + error.message); return; }
          if (data) {
            // Agregar al creador como miembro del canal
            await supabase.from('miembros_grupo').insert({ grupo_id: data.id, usuario_id: currentUser.id, rol: 'admin' });
            setGrupos(prev => [...prev, data]);
            handleChannelSelect(data.id);
            setShowCreateModal(false);
          }
        }} />}
        
        {/* Toast Notifications */}
        {showNotifications && (
          <ChatToast 
            notifications={toastNotifications}
            onDismiss={dismissToast}
            onOpen={handleChannelSelect}
            theme={theme}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col transition-all duration-500 overflow-hidden ${s.chatBg}`}>
      <div className={`px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0 shadow-sm`}>
         <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className={`text-xl opacity-40 ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>
              {grupoActivoData?.tipo === 'directo' ? '💬' : (grupoActivoData?.tipo === 'privado' ? '🔒' : '#')}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={`font-black text-sm uppercase tracking-widest truncate ${theme === 'arcade' ? 'text-[#00ff41] neon-text' : ''}`}>
                {grupoActivoData?.tipo === 'directo' 
                  ? miembrosEspacio.find(m => grupoActivoData?.nombre.includes(m.id) && m.id !== currentUser.id)?.nombre || 'Chat Directo'
                  : (grupoActivoData?.nombre || 'General')
                }
              </h3>
              <p className="text-[9px] font-bold opacity-30 uppercase tracking-tighter">
                {grupoActivoData?.tipo === 'directo' 
                  ? t('chat.directMessage')
                  : grupoActivoData?.tipo === 'privado'
                    ? `Canal privado · ${channelMembers.length} miembro${channelMembers.length !== 1 ? 's' : ''}`
                    : `Canal · ${channelMembers.length} miembro${channelMembers.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
         </div>
         <div className="flex items-center gap-2 shrink-0">
           {/* Ver miembros del canal */}
           {grupoActivoData?.tipo !== 'directo' && (
             <button 
               onClick={() => setShowMembersPanel(!showMembersPanel)} 
               className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 ${showMembersPanel ? (theme === 'arcade' ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'bg-indigo-500/20 text-indigo-400') : 'bg-white/5 hover:bg-white/10 opacity-60 hover:opacity-100'}`}
               title="Ver miembros"
             >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
               <span className="text-[10px] font-bold">{channelMembers.length}</span>
             </button>
           )}
           {/* Agregar miembros */}
           <button 
             onClick={() => setShowAddMembers(true)} 
             className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 group ${theme === 'arcade' ? 'bg-[#00ff41] text-black font-black' : 'bg-indigo-600 text-white hover:bg-indigo-500'}`}
             title="Agregar miembros"
           >
              <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
           </button>
         </div>
      </div>

      <div ref={mensajesRef} className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
        {mensajes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
             <span className="text-6xl mb-4">💬</span>
             <p className="font-black uppercase tracking-[0.3em] text-[10px]">{t('chat.noMessages')}</p>
          </div>
        ) : mensajes.map((m, idx) => {
          const prevMsg = mensajes[idx - 1];
          const sameUser = prevMsg?.usuario_id === m.usuario_id;
          const timeDiff = prevMsg ? (new Date(m.creado_en).getTime() - new Date(prevMsg.creado_en).getTime()) / 60000 : Infinity;
          const showHeader = !sameUser || timeDiff > 5;
          
          return (
            <div key={m.id} className={`group hover:bg-white/[0.02] px-4 py-1 -mx-4 rounded-lg transition-colors ${showHeader ? 'mt-4' : 'mt-0.5'}`}>
              <div className="flex gap-3">
                {showHeader ? (
                  <div className="shrink-0">
                    <UserAvatar
                      name={m.usuario?.nombre || ''}
                      profilePhoto={m.usuario_id === currentUser.id ? currentUser.profilePhoto : miembrosEspacio.find((u: any) => u.id === m.usuario_id)?.avatar_url}
                      size="sm"
                    />
                  </div>
                ) : (
                  <div className="w-9 shrink-0 flex items-center justify-center">
                    <span className="text-[9px] opacity-0 group-hover:opacity-30 font-mono transition-opacity">
                      {new Date(m.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className={`text-[13px] font-bold ${theme === 'arcade' ? 'text-[#00ff41]' : (m.usuario_id === currentUser.id ? 'text-indigo-400' : '')}`}>
                        {m.usuario?.nombre}
                      </span>
                      <span className="text-[10px] opacity-30 font-medium">
                        {new Date(m.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )}
                  {m.tipo === 'archivo' && m.contenido.includes('](') ? (() => {
                    const match = m.contenido.match(/📎 \[(.+?)\]\((.+?)\)/);
                    if (match) {
                      const [, fileName, fileUrl] = match;
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                      return (
                        <div className="mt-1">
                          {isImage ? (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={fileUrl} alt={fileName} className="max-w-[300px] max-h-[200px] rounded-lg border border-white/10 hover:border-indigo-500/50 transition-colors cursor-pointer" />
                              <span className="text-[11px] opacity-50 mt-1 block">{fileName}</span>
                            </a>
                          ) : (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 transition-all group max-w-[300px]">
                              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium truncate group-hover:text-indigo-400 transition-colors">{fileName}</p>
                                <p className="text-[10px] opacity-40">Clic para descargar</p>
                              </div>
                            </a>
                          )}
                        </div>
                      );
                    }
                    return <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">{renderMessageContent(m.contenido)}</p>;
                  })() : (
                    <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">{renderMessageContent(m.contenido)}</p>
                  )}
                  
                  {/* BotÃ³n de hilo */}
                  <button 
                    onClick={() => openThread(m.id)}
                    className={`mt-2 flex items-center gap-1 text-[10px] transition-opacity ${threadCounts[m.id] ? 'opacity-80 text-indigo-400' : 'opacity-40 hover:opacity-100'}`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    <span>{threadCounts[m.id] ? `${threadCounts[m.id]} ${threadCounts[m.id] === 1 ? 'respuesta' : 'respuestas'}` : 'Responder en hilo'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 pb-6 pt-2 shrink-0">
        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-2 py-1 mb-2 text-[11px] opacity-50 italic flex items-center gap-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? t('state.typingSingular') : t('state.typingPlural')}</span>
          </div>
        )}
        
        {/* Mention picker */}
        {showMentionPicker && filteredMentionUsers.length > 0 && (
          <div className="mb-2 p-2 rounded-xl bg-black/80 border border-indigo-500/30 backdrop-blur-xl max-h-40 overflow-y-auto">
            <p className="text-[9px] uppercase tracking-widest opacity-40 px-2 mb-2">{t('chat.mention')}</p>
            {filteredMentionUsers.map(user => (
              <button
                key={user.id}
                type="button"
                onClick={() => insertMention(user)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-500/20 transition-colors flex items-center gap-3"
              >
                <UserAvatar name={user.nombre || ''} profilePhoto={user.avatar_url} size="xs" />
                <span className="text-[13px] font-medium">@{user.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {/* Indicador de hilo activo */}
        {activeThread && (
          <div className="mb-2 p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
              <span className="text-[12px] text-indigo-300">{t('chat.replyingInThread')}</span>
            </div>
            <button onClick={closeThread} className="text-[10px] opacity-60 hover:opacity-100">âœ• {t('action.close')}</button>
          </div>
        )}

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="mb-2 p-2 rounded-xl bg-black/40 border border-white/10 flex flex-wrap gap-1">
            {emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { setNuevoMensaje(prev => prev + emoji); setShowEmojiPicker(false); }}
                className="w-8 h-8 hover:bg-white/10 rounded-lg transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        
        <form onSubmit={enviarMensaje} className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all focus-within:border-indigo-500/50 ${s.input}`}>
          <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" accept="image/*,.pdf,.doc,.docx,.txt" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg hover:bg-white/10 transition-colors opacity-40 hover:opacity-100" title="Adjuntar archivo">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          </button>
          <input 
            ref={inputRef}
            type="text" 
            value={nuevoMensaje} 
            onChange={handleInputChange} 
            placeholder={activeThread 
              ? t('chat.replyInThread')
              : (grupoActivoData?.tipo === 'directo' 
                ? `${t('chat.messageTo')} ${miembrosEspacio.find(m => grupoActivoData?.nombre.includes(m.id) && m.id !== currentUser.id)?.nombre || t('chat.user')}`
                : `${t('chat.messageIn')} #${grupoActivoData?.nombre || t('chat.channel')}`)} 
            className="flex-1 bg-transparent border-none text-[14px] focus:outline-none py-2 placeholder:opacity-30" 
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${showEmojiPicker ? 'opacity-100 bg-white/10' : 'opacity-40 hover:opacity-100'}`} title="Emojis">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
            <button 
              type="submit" 
              disabled={!nuevoMensaje.trim()} 
              className={`p-2 rounded-lg disabled:opacity-20 transition-all ${nuevoMensaje.trim() ? s.btn : 'opacity-30'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
          </div>
        </form>
      </div>
      {showAddMembers && grupoActivo && <AgregarMiembros grupoId={grupoActivo} espacioId={activeWorkspace!.id} onClose={() => { setShowAddMembers(false); /* Refrescar miembros */ const refresh = async () => { const { data: miembros } = await supabase.from('miembros_grupo').select('usuario_id, rol, unido_en').eq('grupo_id', grupoActivo); if (miembros && miembros.length > 0) { const uids = miembros.map(m => m.usuario_id); const { data: usrs } = await supabase.from('usuarios').select('id, nombre, email').in('id', uids); setChannelMembers(miembros.map(m => ({ ...m, usuario: usrs?.find(u => u.id === m.usuario_id) }))); } }; refresh(); }} />}

      {/* Panel Lateral de Miembros - Estilo Slack/Discord */}
      <div className={`fixed top-0 right-0 h-full w-[320px] bg-[#0d0d15]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-out ${showMembersPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${theme === 'arcade' ? 'bg-[#00ff41]/20' : 'bg-indigo-500/20'} flex items-center justify-center`}>
                <svg className={`w-4 h-4 ${theme === 'arcade' ? 'text-[#00ff41]' : 'text-indigo-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              </div>
              <div>
                <h3 className={`font-black text-[11px] uppercase tracking-widest ${theme === 'arcade' ? 'text-[#00ff41]' : ''}`}>Miembros</h3>
                <p className="text-[9px] opacity-50">{channelMembers.length} en este canal</p>
              </div>
            </div>
            <button onClick={() => setShowMembersPanel(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all hover:rotate-90 duration-200">
              <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {channelMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 opacity-30">
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <p className="text-[10px] font-bold uppercase tracking-widest">Sin miembros</p>
              </div>
            ) : channelMembers.map((member: any) => {
              const isOnline = onlineUsers.some(ou => ou.id === member.usuario_id);
              const isMe = member.usuario_id === currentUser.id;
              return (
                <div key={member.usuario_id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group">
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black ${isMe ? (theme === 'arcade' ? 'bg-[#00ff41]/20 text-[#00ff41]' : 'bg-indigo-500/20 text-indigo-400') : 'bg-white/10'}`}>
                      {member.usuario?.nombre?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0d0d15] ${isOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold truncate">{member.usuario?.nombre || 'Usuario'}</span>
                      {isMe && <span className="text-[8px] opacity-40 font-bold uppercase">(tu)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {member.rol === 'admin' && (
                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${theme === 'arcade' ? 'bg-[#00ff41]/15 text-[#00ff41]' : 'bg-indigo-500/15 text-indigo-400'}`}>Admin</span>
                      )}
                      <span className={`text-[9px] ${isOnline ? 'text-green-400' : 'opacity-30'}`}>{isOnline ? 'En linea' : 'Desconectado'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-white/5">
            <button 
              onClick={() => { setShowMembersPanel(false); setShowAddMembers(true); }}
              className={`w-full p-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${theme === 'arcade' ? 'bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41]/20' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
              Agregar miembro
            </button>
          </div>
        </div>
      </div>
      
      {/* Panel Lateral de Hilo - Estilo 2026 */}
      <div className={`fixed top-0 right-0 h-full w-[400px] bg-[#0d0d15]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 transform transition-transform duration-300 ease-out ${activeThread ? 'translate-x-0' : 'translate-x-full'}`}>
        {activeThread && (
          <div className="h-full flex flex-col">
            {/* Header del hilo */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                </div>
                <div>
                  <h3 className="font-black text-[11px] uppercase tracking-widest">{t('chat.thread')}</h3>
                  <p className="text-[9px] opacity-50">{threadMessages.length} {threadMessages.length === 1 ? t('chat.message') : t('chat.messages')}</p>
                </div>
              </div>
              <button onClick={closeThread} className="p-2 hover:bg-white/10 rounded-xl transition-all hover:rotate-90 duration-200">
                <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            {/* Mensajes del hilo */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {threadMessages.map((tm: any, idx) => (
                <div key={tm.id} className={`group ${idx === 0 ? 'pb-4 mb-4 border-b border-white/5' : ''}`}>
                  <div className="flex gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold shrink-0 ${idx === 0 ? 'bg-indigo-500/30 ring-2 ring-indigo-500/50' : 'bg-white/10'}`}>
                      {tm.usuario?.nombre?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[12px]">{tm.usuario?.nombre || 'Usuario'}</span>
                        <span className="text-[9px] opacity-30">{new Date(tm.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        {idx === 0 && <span className="text-[8px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full uppercase tracking-wider">{t('chat.original')}</span>}
                      </div>
                      <p className="text-[13px] leading-relaxed break-words text-white/80">{renderMessageContent(tm.contenido)}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {threadMessages.length === 1 && (
                <div className="text-center py-8 opacity-30">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  <p className="text-[11px] font-medium">{t('chat.beFirstToReply')}</p>
                </div>
              )}
            </div>
            
            {/* Input del hilo */}
            <div className="p-4 border-t border-white/5 bg-black/20">
              <form onSubmit={enviarMensaje}>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={nuevoMensaje}
                    onChange={handleInputChange}
                    placeholder={t('chat.replyInThread')}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition-all placeholder:opacity-30"
                  />
                  <button 
                    type="submit" 
                    disabled={!nuevoMensaje.trim()} 
                    className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[11px] font-black uppercase tracking-wider disabled:opacity-20 disabled:hover:bg-indigo-600 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      
      {/* Overlay para cerrar el panel */}
      {activeThread && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={closeThread} />
      )}
      {/* Toast Notifications */}
      {showNotifications && (
        <ChatToast 
          notifications={toastNotifications}
          onDismiss={dismissToast}
          onOpen={(groupId) => { setGrupoActivo(groupId); }}
          theme={theme}
        />
      )}
    </div>
  );
};
