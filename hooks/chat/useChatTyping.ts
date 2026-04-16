/**
 * @module hooks/chat/useChatTyping
 * @description Sub-hook for typing indicator management.
 * Handles typing subscription per channel and broadcasting typing events.
 *
 * Clean Architecture: Presentation layer — delegates to IChatRealtimeService port.
 * F4 refactor: extracted from useChatPanel monolith.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { logger } from '@/lib/logger';
import type { ChatRealtimeSubscription } from '@/src/core/domain/ports/IChatRealtimeService';

import { chatRealtimeService } from '@/src/core/infrastructure/adapters/ChatRealtimeSupabaseService';

const log = logger.child('chat-typing');

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseChatTypingReturn {
  typingUsers: string[];
  handleTyping: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatTyping({
  grupoActivo,
  sidebarOnly,
}: {
  grupoActivo: string | null;
  sidebarOnly: boolean;
}): UseChatTypingReturn {
  const { currentUser } = useStore();

  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingChannelRef = useRef<ChatRealtimeSubscription | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Typing subscription per channel ────────────────────────────────────────

  useEffect(() => {
    if (!grupoActivo || sidebarOnly) return;

    try {
      if (typingChannelRef.current) {
        typingChannelRef.current.unsubscribe();
      }

      log.debug('Subscribing to typing channel', { grupoId: grupoActivo });

      const typingSubscription = chatRealtimeService.suscribirTyping(
        grupoActivo,
        ({ user_name }) => {
          if (user_name !== currentUser.name) {
            setTypingUsers((prev) => {
              if (!prev.includes(user_name)) {
                return [...prev, user_name];
              }
              return prev;
            });

            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((u) => u !== user_name));
            }, 3000);
          }
        },
      );

      typingChannelRef.current = typingSubscription;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to subscribe to typing', { error: message });
    }

    return () => {
      if (typingChannelRef.current) {
        typingChannelRef.current.unsubscribe();
        typingChannelRef.current = null;
      }
    };
  }, [grupoActivo, sidebarOnly, currentUser.name]);

  // ── Broadcast typing ───────────────────────────────────────────────────────

  const handleTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      if (grupoActivo) {
        chatRealtimeService.enviarTyping(grupoActivo, currentUser.id, currentUser.name);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Failed to broadcast typing', { error: message });
    }

    typingTimeoutRef.current = setTimeout(() => {}, 2000);
  }, [grupoActivo, currentUser.id, currentUser.name]);

  return {
    typingUsers,
    handleTyping,
  };
}
