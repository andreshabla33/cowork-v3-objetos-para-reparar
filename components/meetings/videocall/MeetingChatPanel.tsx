import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';

interface MeetingChatMessage {
  id?: string;
  message?: string;
  timestamp: number;
  from?: {
    identity?: string;
    name?: string;
  };
}

interface MeetingChatPanelProps {
  isOpen: boolean;
  messages: MeetingChatMessage[];
  isSending?: boolean;
  localParticipantIdentity?: string;
  onClose: () => void;
  onSendMessage: (message: string) => Promise<unknown> | unknown;
}

export const MeetingChatPanel: React.FC<MeetingChatPanelProps> = ({
  isOpen,
  messages,
  isSending = false,
  localParticipantIdentity,
  onClose,
  onSendMessage,
}) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const normalizedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const senderIdentity = message.from?.identity;
      const senderName = message.from?.name || senderIdentity || 'Participante';
      const isOwn = !!localParticipantIdentity && senderIdentity === localParticipantIdentity;
      const timestamp = new Date(message.timestamp);
      const timeLabel = Number.isNaN(timestamp.getTime())
        ? ''
        : timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      return {
        id: message.id || `${message.timestamp}-${index}`,
        text: typeof message.message === 'string' ? message.message.trim() : '',
        senderName,
        timeLabel,
        isOwn,
      };
    }).filter((message) => message.text.length > 0);
  }, [localParticipantIdentity, messages]);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [isOpen, normalizedMessages.length]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = draft.trim();

    if (!nextMessage || isSending) {
      return;
    }

    await onSendMessage(nextMessage);
    setDraft('');
  };

  return (
    <div
      aria-hidden={!isOpen}
      className={`absolute inset-0 z-[260] flex w-full flex-col bg-zinc-950/98 backdrop-blur-xl transition-all duration-300 md:inset-y-0 md:right-0 md:left-auto md:w-80 md:border-l md:border-white/10 ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0 md:translate-x-0'
          : 'pointer-events-none opacity-0 translate-y-full md:translate-y-0 md:translate-x-full'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h3 className="text-base font-semibold text-white">Chat de la reunión</h3>
          <p className="mt-1 text-xs text-white/45">Los mensajes se guardan como historial de la reunión.</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          type="button"
          aria-label="Cerrar chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
        {normalizedMessages.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm text-white/45">
            Envía el primer mensaje para iniciar la conversación.
          </div>
        ) : (
          normalizedMessages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-1 ${message.isOwn ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex w-full max-w-full items-center gap-2 text-[11px] ${message.isOwn ? 'justify-end' : 'justify-between'}`}>
                {!message.isOwn && (
                  <span className="truncate rounded-full bg-indigo-500/10 px-2.5 py-1 font-semibold text-indigo-300">
                    {message.senderName}
                  </span>
                )}
                <span className="shrink-0 text-white/35">{message.timeLabel}</span>
              </div>
              <div
                className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.isOwn
                    ? 'bg-indigo-500 text-white rounded-br-md'
                    : 'bg-white/10 text-white/92 rounded-bl-md'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-3 border-t border-white/10 bg-zinc-950/95 px-4 py-4 pb-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))]">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escribe un mensaje..."
          className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-indigo-400/60 focus:bg-white/12"
        />
        <button
          type="submit"
          disabled={isSending || draft.trim().length === 0}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white transition-all hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Enviar mensaje"
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
};

export default MeetingChatPanel;
