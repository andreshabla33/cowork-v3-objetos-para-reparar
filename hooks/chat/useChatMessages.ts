/**
 * @module hooks/chat/useChatMessages
 * @description Sub-hook for chat message operations.
 * Handles message loading, sending, threads, file upload, and realtime subscriptions.
 *
 * Clean Architecture: Presentation layer — delegates to Application use cases.
 * F4 refactor: extracted from useChatPanel monolith.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import type { ChatMessage } from '@/types';
import type { ChatRealtimeSubscription } from '@/src/core/domain/ports/IChatRealtimeService';

import { chatRepository } from '@/src/core/infrastructure/adapters/ChatSupabaseRepository';
import { chatRealtimeService } from '@/src/core/infrastructure/adapters/ChatRealtimeSupabaseService';
import { CargarMensajesChatUseCase } from '@/src/core/application/usecases/CargarMensajesChatUseCase';
import { EnviarMensajeChatUseCase } from '@/src/core/application/usecases/EnviarMensajeChatUseCase';
import { SubirArchivoChatUseCase } from '@/src/core/application/usecases/SubirArchivoChatUseCase';
import { CargarHiloMensajeUseCase } from '@/src/core/application/usecases/CargarHiloMensajeUseCase';

const log = logger.child('chat-messages');

// Module-level singletons (Composition Root pattern)
const cargarMensajes = new CargarMensajesChatUseCase(chatRepository);
const enviarMensajeUC = new EnviarMensajeChatUseCase(chatRepository);
const subirArchivo = new SubirArchivoChatUseCase(chatRepository);
const cargarHilo = new CargarHiloMensajeUseCase(chatRepository);

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseChatMessagesReturn {
  mensajes: ChatMessage[];
  nuevoMensaje: string;
  activeThread: string | null;
  threadMessages: ChatMessage[];
  threadCounts: Record<string, number>;

  fileInputRef: React.RefObject<HTMLInputElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  mensajesRef: React.RefObject<HTMLDivElement | null>;

  setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>;

  enviarMensaje: (e: React.FormEvent) => Promise<void>;
  openThread: (messageId: string) => Promise<void>;
  closeThread: () => void;
  handleFileAttach: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  scrollToBottom: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatMessages({
  grupoActivo,
  sidebarOnly,
  detectMentions,
}: {
  grupoActivo: string | null;
  sidebarOnly: boolean;
  detectMentions: (text: string) => string[];
}): UseChatMessagesReturn {
  const { activeWorkspace, currentUser } = useStore();

  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ChatRealtimeSubscription | null>(null);
  const chatRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scroll helper ──────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (mensajesRef.current) {
        mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
      }
    }, 150);
  }, []);

  // ── Load messages + realtime subscription ──────────────────────────────────

  useEffect(() => {
    if (!grupoActivo) return;
    if (sidebarOnly) return;

    if (chatRetryTimeoutRef.current) {
      clearTimeout(chatRetryTimeoutRef.current);
      chatRetryTimeoutRef.current = null;
    }

    const currentGrupo = grupoActivo;

    const cargarMensajesYContar = async () => {
      try {
        log.debug('Loading messages', { grupoId: currentGrupo });
        const resultado = await cargarMensajes.ejecutar(currentGrupo);
        setMensajes(resultado.mensajes as unknown as ChatMessage[]);
        setThreadCounts(resultado.conteoReplicas);
        scrollToBottom();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to load messages', { error: message, grupoId: currentGrupo });
      }
    };

    cargarMensajesYContar();

    // Setup message subscription
    try {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }

      log.debug('Subscribing to message channel', { grupoId: currentGrupo });

      const messageSubscription = chatRealtimeService.suscribirMensajesCanal(
        currentGrupo,
        async () => {
          const resultado = await cargarMensajes.ejecutar(currentGrupo);
          setMensajes(resultado.mensajes as unknown as ChatMessage[]);
          setThreadCounts(resultado.conteoReplicas);
          scrollToBottom();
        },
        (status) => {
          log.debug('Message channel subscription status', { status, grupoId: currentGrupo });
          if (status === 'CHANNEL_ERROR' && !chatRetryTimeoutRef.current) {
            chatRetryTimeoutRef.current = setTimeout(() => {
              log.debug('Retrying message subscription', { grupoId: currentGrupo });
              chatRetryTimeoutRef.current = null;
            }, 2000);
          }
        },
      );

      channelRef.current = messageSubscription;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to subscribe to messages', { error: message });
    }

    return () => {
      if (chatRetryTimeoutRef.current) {
        clearTimeout(chatRetryTimeoutRef.current);
        chatRetryTimeoutRef.current = null;
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [grupoActivo, sidebarOnly, scrollToBottom]);

  // ── Send message ───────────────────────────────────────────────────────────

  const enviarMensaje = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nuevoMensaje.trim() || !grupoActivo || !currentUser.id) return;

      const content = nuevoMensaje.trim();
      const menciones = detectMentions(content);

      setNuevoMensaje('');

      try {
        log.debug('Sending message', { grupoId: grupoActivo, mentions: menciones.length });

        const resultado = await enviarMensajeUC.ejecutar({
          grupoId: grupoActivo,
          usuarioId: currentUser.id,
          contenido: content,
          tipo: 'texto',
          menciones: menciones.length > 0 ? menciones : null,
          respuestaA: activeThread || null,
        });

        if (resultado) {
          if (activeThread) {
            setThreadMessages((prev) => [...prev, resultado as unknown as ChatMessage]);
          } else {
            setMensajes((prev) => [...prev, resultado as unknown as ChatMessage]);
          }
          scrollToBottom();
        } else {
          log.error('Message send returned null');
          setNuevoMensaje(content);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to send message', { error: message });
        setNuevoMensaje(content);
      }
    },
    [nuevoMensaje, grupoActivo, currentUser.id, detectMentions, activeThread, scrollToBottom],
  );

  // ── Thread operations ──────────────────────────────────────────────────────

  const openThread = useCallback(async (messageId: string) => {
    setActiveThread(messageId);
    try {
      log.debug('Loading thread', { messageId });
      const threadData = await cargarHilo.ejecutar(messageId);
      setThreadMessages(threadData as unknown as ChatMessage[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Failed to load thread', { error: message });
    }
  }, []);

  const closeThread = useCallback(() => {
    setActiveThread(null);
    setThreadMessages([]);
  }, []);

  // ── File upload ────────────────────────────────────────────────────────────

  const handleFileAttach = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !grupoActivo || !activeWorkspace) return;

      try {
        log.debug('Uploading file', { fileName: file.name, fileSize: file.size });

        const resultado = await subirArchivo.ejecutar({
          grupoId: grupoActivo,
          usuarioId: currentUser.id,
          archivo: file,
          espacioId: activeWorkspace.id,
        });

        if (resultado) {
          const resultadoMensajes = await cargarMensajes.ejecutar(grupoActivo);
          setMensajes(resultadoMensajes.mensajes as unknown as ChatMessage[]);
          scrollToBottom();
          log.debug('File uploaded successfully', { fileSize: file.size });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Failed to upload file', { error: message, fileName: file.name });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [grupoActivo, activeWorkspace, currentUser.id, scrollToBottom],
  );

  return {
    mensajes,
    nuevoMensaje,
    activeThread,
    threadMessages,
    threadCounts,

    fileInputRef,
    inputRef,
    mensajesRef,

    setNuevoMensaje,

    enviarMensaje,
    openThread,
    closeThread,
    handleFileAttach,
    scrollToBottom,
  };
}
