/**
 * @module hooks/chat/useChatMentions
 * @description Sub-hook for @mention detection, picker state, and insertion.
 *
 * Clean Architecture: Presentation layer — pure UI logic, no infrastructure.
 * F4 refactor: extracted from useChatPanel monolith.
 */

import { useState, useCallback } from 'react';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseChatMentionsReturn {
  showMentionPicker: boolean;
  mentionFilter: string;

  setMentionFilter: (filter: string) => void;

  detectMentions: (text: string) => string[];
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>,
    handleTyping: () => void,
  ) => void;
  insertMention: (
    user: MiembroChatData,
    setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatMentions({
  miembrosEspacio,
}: {
  miembrosEspacio: MiembroChatData[];
}): UseChatMentionsReturn {
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  // ── Detect mention user IDs in text ────────────────────────────────────────

  const detectMentions = useCallback(
    (text: string): string[] => {
      const mentionRegex = /@(\w+)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        const userName = match[1].toLowerCase();
        const user = miembrosEspacio.find((m) =>
          m.nombre?.toLowerCase().includes(userName),
        );
        if (user) mentions.push(user.id);
      }
      return [...new Set(mentions)];
    },
    [miembrosEspacio],
  );

  // ── Input change with mention detection ────────────────────────────────────

  const handleInputChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>,
      handleTyping: () => void,
    ) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setNuevoMensaje(value);

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
    },
    [],
  );

  // ── Insert selected mention ────────────────────────────────────────────────

  const insertMention = useCallback(
    (
      user: MiembroChatData,
      setNuevoMensaje: React.Dispatch<React.SetStateAction<string>>,
      inputRef: React.RefObject<HTMLInputElement | null>,
    ) => {
      setNuevoMensaje((prev) => {
        const beforeMention = prev.substring(0, mentionCursorPos);
        const afterMention = prev.substring(mentionCursorPos).replace(/@\w*/, '');
        return `${beforeMention}@${user.nombre} ${afterMention}`;
      });
      setShowMentionPicker(false);
      inputRef.current?.focus();
    },
    [mentionCursorPos],
  );

  return {
    showMentionPicker,
    mentionFilter,
    setMentionFilter,
    detectMentions,
    handleInputChange,
    insertMention,
  };
}
