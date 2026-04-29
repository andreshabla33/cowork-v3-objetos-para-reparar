/**
 * @module components/chat/MessageContent
 * @description Pure presentational component for rendering chat message text
 * with mention highlighting.
 *
 * Clean Architecture: Presentation layer — zero business logic, zero side effects.
 * Extracted from useChatPanel.tsx (F2 refactor) to remove JSX from hook layer.
 *
 * Ref: react.dev — "Extracting components" for reusability and separation of concerns.
 */

import React, { memo, useMemo } from 'react';
import type { MiembroChatData } from '@/src/core/domain/ports/IChatRepository';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MessageContentProps {
  /** Raw message text (may contain @mentions). */
  content: string;
  /** Current user ID — used to highlight self-mentions. */
  currentUserId: string;
  /** Space members list — used to resolve @mention names. */
  miembrosEspacio: MiembroChatData[];
  /** Optional extra CSS class for the wrapping <p>. */
  className?: string;
}

// ─── Mention pattern ─────────────────────────────────────────────────────────

const MENTION_REGEX = /(@\w+)/g;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders message text, splitting @mentions into highlighted spans.
 * - Self-mentions: yellow highlight (bg-yellow-500/30).
 * - Other mentions: indigo highlight (bg-blue-600/30).
 * - Plain text: rendered as-is.
 *
 * Memoised to avoid re-renders when parent list re-renders with same props.
 */
export const MessageContent: React.FC<MessageContentProps> = memo(
  function MessageContent({ content, currentUserId, miembrosEspacio, className }) {
    const rendered = useMemo(() => {
      const parts = content.split(MENTION_REGEX);
      return parts.map((part, i) => {
        if (part.startsWith('@')) {
          const userName = part.substring(1).toLowerCase();
          const isMentioningMe = miembrosEspacio.some(
            (m) => m.nombre?.toLowerCase() === userName && m.id === currentUserId,
          );
          return (
            <span
              key={i}
              className={`px-1 rounded ${
                isMentioningMe
                  ? 'bg-yellow-500/30 text-yellow-300 font-bold'
                  : 'bg-blue-600/30 text-sky-600'
              }`}
            >
              {part}
            </span>
          );
        }
        return part;
      });
    }, [content, currentUserId, miembrosEspacio]);

    return (
      <p className={className ?? 'text-[14px] leading-relaxed break-words whitespace-pre-wrap'}>
        {rendered}
      </p>
    );
  },
);
