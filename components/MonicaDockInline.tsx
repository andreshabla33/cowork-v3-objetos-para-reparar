/**
 * @module components/MonicaDockInline
 * @description Mónica AI inline dentro del dock bar — versión compacta.
 *
 * Calm Design: solo un input. Al enviar, la respuesta aparece como un toast
 * efímero encima del dock (no abre panel gigante). Minimal footprint.
 *
 * Reutiliza toda la lógica de VibenAssistant (geminiService, contexto enriquecido)
 * pero la UI es un input + respuesta flotante.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateChatResponse, type ChatHistoryEntry } from '../services/geminiService';
import { useStore } from '../store/useStore';
import { useAuthSession } from '../hooks/auth/useAuthSession';
import { TaskStatus, type Task } from '../types';
import {
  loadProductivityContext,
  loadBehaviorContext,
  buildEnrichedPrompt,
} from '../services/monicaContextService';

interface Props {
  onClose: () => void;
}

interface Message {
  role: 'user' | 'monica';
  text: string;
  timestamp: number;
}

const STORAGE_KEY = 'monica_chat_history';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const MonicaDockInline: React.FC<Props> = ({ onClose }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const contextLoadedRef = useRef(false);
  const [enrichedContext, setEnrichedContext] = useState('');
  const [channels, setChannels] = useState<string[]>([]);

  const { tasks, currentUser, addTask, activeWorkspace, onlineUsers } = useStore();
  const { accessToken } = useAuthSession();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Message[] = JSON.parse(saved);
        setMessages(parsed.filter(m => Date.now() - m.timestamp < THIRTY_DAYS_MS));
      } catch { /* noop */ }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const load = async () => {
      if (!activeWorkspace?.id || !currentUser?.id) return;
      const { data } = await (await import('../lib/supabase')).supabase
        .from('grupos_chat')
        .select('nombre')
        .eq('espacio_id', activeWorkspace.id);
      if (data) setChannels(data.map((g: any) => g.nombre));
    };
    load();
  }, [activeWorkspace?.id, currentUser?.id]);

  useEffect(() => {
    const load = async () => {
      if (!activeWorkspace?.id || !currentUser?.id || currentUser.id === 'guest' || contextLoadedRef.current) return;
      contextLoadedRef.current = true;
      try {
        const [prod, beh] = await Promise.all([
          loadProductivityContext(currentUser.id, activeWorkspace.id),
          loadBehaviorContext(currentUser.id, activeWorkspace.id),
        ]);
        const prompt = buildEnrichedPrompt(prod, beh);
        if (prompt) setEnrichedContext(prompt);
      } catch { /* noop */ }
    };
    load();
  }, [activeWorkspace?.id, currentUser?.id]);

  // Auto-hide response after 8s
  useEffect(() => {
    if (!lastResponse) return;
    const t = setTimeout(() => setLastResponse(null), 8000);
    return () => clearTimeout(t);
  }, [lastResponse]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    setInput('');
    abortRef.current = false;
    const now = Date.now();
    const userMsg: Message = { role: 'user', text, timestamp: now };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setLastResponse(null);

    try {
      const context = {
        tasks: tasks.map(t => `${t.title} (${t.status})`).join(', ') || 'Ninguna',
        userName: currentUser.name,
        role: currentUser.role,
        workspaceName: activeWorkspace?.name || 'No especificado',
        channels: channels.length > 0 ? channels.join(', ') : 'Ninguno',
        onlineMembers: onlineUsers.length > 0
          ? onlineUsers.map((u: any) => u.name || u.user_name).join(', ')
          : 'Solo tú',
        enrichedContext,
      };

      const history: ChatHistoryEntry[] = messages
        .slice(-10)
        .map(m => ({
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.text,
        }));

      const response = await generateChatResponse(text, context, history, accessToken);
      if (abortRef.current) return;

      if (response.functionCalls?.length) {
        for (const fc of response.functionCalls) {
          if (fc.name === 'createTask') {
            const args = fc.args as any;
            const newTask: Task = {
              id: Math.random().toString(36).substr(2, 9),
              title: args.title || 'Nueva Tarea',
              description: args.description || '',
              startDate: args.startDate,
              dueDate: args.dueDate,
              status: TaskStatus.TODO,
              attachments: [],
            };
            addTask(newTask);
            const reply = `Tarea creada: "${newTask.title}"`;
            setLastResponse(reply);
            setMessages(prev => [...prev, { role: 'monica', text: reply, timestamp: Date.now() }]);
          }
        }
      } else {
        const reply = response.text || 'No pude procesar tu solicitud.';
        setLastResponse(reply);
        setMessages(prev => [...prev, { role: 'monica', text: reply, timestamp: Date.now() }]);
      }
    } catch {
      if (!abortRef.current) {
        const errText = 'Error al procesar. Intenta de nuevo.';
        setLastResponse(errText);
        setMessages(prev => [...prev, { role: 'monica', text: errText, timestamp: Date.now() }]);
      }
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, tasks, currentUser, activeWorkspace, channels, onlineUsers, enrichedContext, accessToken, messages, addTask]);

  return (
    <>
      {/* Respuesta flotante encima del dock — efímera 8s */}
      {(lastResponse || isTyping) && (
        <div className="ag-monica-dock__response">
          {isTyping ? (
            <span className="ag-monica-dock__typing">
              <span /><span /><span />
            </span>
          ) : (
            <p className="ag-monica-dock__response-text">{lastResponse}</p>
          )}
          {lastResponse && (
            <button
              type="button"
              className="ag-monica-dock__response-close"
              onClick={() => setLastResponse(null)}
              aria-label="Cerrar respuesta"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Input real dentro del dock bar */}
      <input
        ref={inputRef}
        type="text"
        className="ag-monica-dock__input"
        placeholder="Pídele algo a Mónica... o describe qué necesitas"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
        disabled={isTyping}
      />
    </>
  );
};

export default MonicaDockInline;
