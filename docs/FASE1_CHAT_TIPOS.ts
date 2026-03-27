// =====================================================
// FASE 1: CHAT AVANZADO - TIPOS TYPESCRIPT
// Fecha: 15 de Enero 2026
// Descripción: Interfaces y tipos para el sistema de chat
// =====================================================

// Canal de chat
export interface Canal {
  id: string;
  espacio_id: string;
  nombre: string;
  descripcion?: string;
  es_privado: boolean;
  icono: string;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
  // Campos calculados (no en DB)
  mensajes_no_leidos?: number;
  ultimo_mensaje?: MensajeChat;
}

// Miembro de canal privado
export interface CanalMiembro {
  id: string;
  canal_id: string;
  usuario_id: string;
  rol: 'admin' | 'miembro';
  agregado_en: string;
  agregado_por?: string;
  // Join con usuarios
  usuario?: {
    id: string;
    nombre: string;
    avatar_url?: string;
  };
}

// Mensaje de chat
export interface MensajeChat {
  id: string;
  canal_id: string;
  usuario_id: string;
  contenido: string;
  thread_padre_id?: string;
  menciones: string[];
  tiene_respuestas: boolean;
  cantidad_respuestas: number;
  editado: boolean;
  creado_en: string;
  editado_en?: string;
  // Joins
  usuario?: {
    id: string;
    nombre: string;
    avatar_url?: string;
    avatar_config?: any;
  };
  reacciones?: ReaccionMensaje[];
}

// Reacción a mensaje
export interface ReaccionMensaje {
  id: string;
  mensaje_id: string;
  usuario_id: string;
  emoji: string;
  creado_en: string;
  // Agregado para UI
  usuarios?: string[]; // Lista de nombres de usuarios que reaccionaron
  count?: number;
}

// Estado de lectura
export interface MensajeLeido {
  id: string;
  usuario_id: string;
  canal_id: string;
  ultimo_mensaje_id?: string;
  ultimo_acceso: string;
}

// =====================================================
// TIPOS PARA EL STORE (Zustand)
// =====================================================

export interface ChatState {
  // Estado
  canales: Canal[];
  canalActivo: Canal | null;
  mensajes: Record<string, MensajeChat[]>; // canal_id -> mensajes
  threadActivo: MensajeChat | null;
  mensajesThread: MensajeChat[];
  cargandoMensajes: boolean;
  
  // Acciones
  fetchCanales: (espacioId: string) => Promise<void>;
  crearCanal: (canal: Partial<Canal>) => Promise<Canal>;
  seleccionarCanal: (canal: Canal) => void;
  
  fetchMensajes: (canalId: string, limit?: number) => Promise<void>;
  enviarMensaje: (contenido: string, threadPadreId?: string) => Promise<void>;
  editarMensaje: (mensajeId: string, contenido: string) => Promise<void>;
  eliminarMensaje: (mensajeId: string) => Promise<void>;
  
  abrirThread: (mensaje: MensajeChat) => void;
  cerrarThread: () => void;
  
  agregarReaccion: (mensajeId: string, emoji: string) => Promise<void>;
  quitarReaccion: (mensajeId: string, emoji: string) => Promise<void>;
  
  marcarComoLeido: (canalId: string) => Promise<void>;
  
  // Realtime
  suscribirACanal: (canalId: string) => void;
  desuscribirDeCanal: (canalId: string) => void;
}

// =====================================================
// TIPOS PARA COMPONENTES
// =====================================================

// Props para ChannelList
export interface ChannelListProps {
  canales: Canal[];
  canalActivo: Canal | null;
  onSelectCanal: (canal: Canal) => void;
  onCrearCanal: () => void;
}

// Props para MessageList
export interface MessageListProps {
  mensajes: MensajeChat[];
  onOpenThread: (mensaje: MensajeChat) => void;
  onReaccionar: (mensajeId: string, emoji: string) => void;
  cargando: boolean;
}

// Props para MessageItem
export interface MessageItemProps {
  mensaje: MensajeChat;
  esThread?: boolean;
  onOpenThread?: (mensaje: MensajeChat) => void;
  onReaccionar: (mensajeId: string, emoji: string) => void;
  onEditar?: (mensajeId: string) => void;
  onEliminar?: (mensajeId: string) => void;
}

// Props para MessageInput
export interface MessageInputProps {
  onEnviar: (contenido: string) => void;
  placeholder?: string;
  disabled?: boolean;
  usuarios: { id: string; nombre: string }[]; // Para menciones
}

// Props para ThreadPanel
export interface ThreadPanelProps {
  mensajePadre: MensajeChat;
  respuestas: MensajeChat[];
  onCerrar: () => void;
  onEnviarRespuesta: (contenido: string) => void;
}

// Props para CreateChannelModal
export interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCrear: (canal: { nombre: string; descripcion?: string; es_privado: boolean }) => void;
  miembrosEspacio: { id: string; nombre: string }[];
}

// =====================================================
// TIPOS PARA EVENTOS REALTIME
// =====================================================

export type ChatRealtimeEvent = 
  | { type: 'mensaje_nuevo'; payload: MensajeChat }
  | { type: 'mensaje_editado'; payload: MensajeChat }
  | { type: 'mensaje_eliminado'; payload: { id: string } }
  | { type: 'reaccion_agregada'; payload: ReaccionMensaje }
  | { type: 'reaccion_eliminada'; payload: { mensaje_id: string; emoji: string; usuario_id: string } }
  | { type: 'canal_creado'; payload: Canal }
  | { type: 'canal_actualizado'; payload: Canal }
  | { type: 'usuario_escribiendo'; payload: { canal_id: string; usuario_id: string; nombre: string } };

// =====================================================
// HELPERS
// =====================================================

// Parser de menciones en texto
export interface MencionParseResult {
  texto: string;
  menciones: { userId: string; startIndex: number; endIndex: number }[];
}

// Función para parsear menciones (implementar en utils)
// export function parsearMenciones(texto: string, usuarios: {id: string, nombre: string}[]): MencionParseResult

// Emojis comunes para reacciones rápidas
export const REACCIONES_RAPIDAS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🚀', '👀'];
