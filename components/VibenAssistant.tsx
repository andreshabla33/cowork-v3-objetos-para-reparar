
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateChatResponse, ChatHistoryEntry } from '../services/geminiService';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { useAuthSession } from '../hooks/auth/useAuthSession';
import { TaskStatus, Task } from '../types';
import { loadProductivityContext, loadBehaviorContext, buildEnrichedPrompt, ProductivityContext, BehaviorContext } from '../services/monicaContextService';

interface Message {
  role: 'user' | 'monica';
  text: string;
  timestamp: number;
}

interface VibenAssistantProps {
  onClose: () => void;
}

const STORAGE_KEY = 'monica_chat_history';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const VibenAssistant: React.FC<VibenAssistantProps> = ({ onClose }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { tasks, currentUser, addTask, activeWorkspace, onlineUsers } = useStore();
  const { accessToken } = useAuthSession();
  const abortControllerRef = useRef<boolean>(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [enrichedContext, setEnrichedContext] = useState<string>('');
  const contextLoadedRef = useRef<boolean>(false);

  // Cargar canales del usuario
  useEffect(() => {
    const loadChannels = async () => {
      if (!activeWorkspace?.id || !currentUser?.id) return;
      const { data } = await supabase
        .from('grupos_chat')
        .select('nombre')
        .eq('espacio_id', activeWorkspace.id);
      if (data) setChannels(data.map((g: any) => g.nombre));
    };
    loadChannels();
  }, [activeWorkspace?.id, currentUser?.id]);

  // Capa 2+3: Cargar contexto enriquecido (productividad + comportamiento)
  useEffect(() => {
    const loadContext = async () => {
      if (!activeWorkspace?.id || !currentUser?.id || currentUser.id === 'guest' || contextLoadedRef.current) return;
      contextLoadedRef.current = true;
      try {
        const [productivity, behavior] = await Promise.all([
          loadProductivityContext(currentUser.id, activeWorkspace.id),
          loadBehaviorContext(currentUser.id, activeWorkspace.id),
        ]);
        const prompt = buildEnrichedPrompt(productivity, behavior);
        if (prompt) {
          console.log('Mónica: contexto enriquecido cargado', { resumenes: productivity.resumenes.length, actionItems: productivity.actionItemsPendientes.length, metricas: !!behavior.metricas });
          setEnrichedContext(prompt);
        }
      } catch (err) {
        console.error('Error loading enriched context:', err);
      }
    };
    loadContext();
  }, [activeWorkspace?.id, currentUser?.id]);

  // Click outside para minimizar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !isMinimized) {
        setIsMinimized(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMinimized]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const now = Date.now();
    
    if (saved) {
      try {
        const parsed: Message[] = JSON.parse(saved);
        const validMessages = parsed.filter(m => now - m.timestamp < THIRTY_DAYS_MS);
        
        if (validMessages.length > 0) {
          setMessages(validMessages);
        } else {
          setMessages([{ 
            role: 'monica', 
            text: '¡Hola! Soy Mónica, tu asistente de IA. ¿En qué puedo ayudarte hoy?', 
            timestamp: now 
          }]);
        }
      } catch (error) {
        console.error("Error parsing chat history:", error);
        localStorage.removeItem(STORAGE_KEY);
        setMessages([{ 
          role: 'monica', 
          text: '¡Hola! Soy Mónica, tu asistente de IA. ¿En qué puedo ayudarte hoy?', 
          timestamp: now 
        }]);
      }
    } else {
      setMessages([{ 
        role: 'monica', 
        text: '¡Hola! Soy Mónica, tu asistente de IA. ¿En qué puedo ayudarte hoy?', 
        timestamp: now 
      }]);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isMinimized]);

  const handleStopExecution = () => {
    abortControllerRef.current = true;
    setIsTyping(false);
    setStreamingText('');
    // Persist a "stopped" response so the user message isn't orphaned
    const stoppedMsg: Message = { role: 'monica', text: '⏹️ Respuesta detenida por el usuario.', timestamp: Date.now() };
    setMessages(prev => [...prev, stoppedMsg]);
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input;
    const now = Date.now();
    setInput('');
    abortControllerRef.current = false;
    
    const newUserMessage: Message = { role: 'user', text: userMsg, timestamp: now };
    setMessages(prev => [...prev, newUserMessage]);
    setIsTyping(true);
    setStreamingText('');

    try {
      const context = {
        tasks: tasks.map(t => `${t.title} (${t.status})`).join(', ') || 'Ninguna',
        userName: currentUser.name,
        role: currentUser.role,
        workspaceName: activeWorkspace?.name || 'No especificado',
        channels: channels.length > 0 ? channels.join(', ') : 'Ninguno',
        onlineMembers: onlineUsers.length > 0 ? onlineUsers.map((u: any) => u.name || u.user_name).join(', ') : 'Solo tú',
        enrichedContext,
      };

      // Build conversation history from persisted messages for AI context
      const history: ChatHistoryEntry[] = messages
        .filter(m => m.role === 'user' || m.role === 'monica')
        .map(m => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.text,
        }));
      
      const response = await generateChatResponse(userMsg, context, history, accessToken);
      
      if (abortControllerRef.current) {
        setStreamingText('');
        return;
      }

      if (response.functionCalls && response.functionCalls.length > 0) {
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
            
            const confirmationMsg: Message = {
              role: 'monica',
              text: `✅ He creado la tarea: "${newTask.title}".`,
              timestamp: Date.now()
            };
            setMessages(prev => [...prev, confirmationMsg]);
          }
        }
      } else {
        const textResponse = response.text || "Lo siento, no pude procesar tu solicitud.";
        const newVibenMessage: Message = { role: 'monica', text: textResponse, timestamp: Date.now() };
        setMessages(prev => [...prev, newVibenMessage]);
      }
    } catch (error) {
      if (abortControllerRef.current) {
        setStreamingText('');
        return;
      }
      const errorMessage: Message = { 
        role: 'monica', 
        text: 'Lo siento, tuve un problema. Intenta de nuevo.', 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setStreamingText('');
    }
  };

  const handleClearHistory = () => {
    const now = Date.now();
    localStorage.removeItem(STORAGE_KEY);
    setMessages([{ role: 'monica', text: '¡Hola! Soy Mónica, tu asistente de IA. ¿En qué puedo ayudarte hoy?', timestamp: now }]);
  };

  return (
    <div ref={containerRef} className={`flex flex-col rounded-2xl overflow-hidden transition-all duration-300 ease-in-out w-full border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${isMinimized ? 'h-[52px]' : 'h-[520px] max-h-[80vh]'}`}>
      {/* Header - Estilo consistente con el resto de la app */}
      <div 
        onClick={() => setIsMinimized(!isMinimized)}
        className="relative overflow-hidden bg-zinc-900/95 backdrop-blur-2xl p-3.5 flex items-center justify-between z-10 cursor-pointer group shrink-0 border-b border-white/5"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-base border border-indigo-500/30">
            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-white/90">Mónica AI</h3>
            <p className="text-[9px] text-emerald-400/80 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              En línea
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            title="Limpiar historial"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white/30 transition-transform duration-300 ${isMinimized ? 'rotate-180' : ''}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-950/95 backdrop-blur-2xl scroll-smooth custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'monica' && (
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1 border border-indigo-500/20">
                    <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-md shadow-lg shadow-indigo-500/10' 
                    : 'bg-white/[0.04] text-zinc-300 rounded-bl-md border border-white/[0.06]'
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <div className={`text-[8px] mt-1.5 opacity-40 font-medium ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-1 border border-indigo-500/20">
                  <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
                </div>
                <div className="flex flex-col gap-2">
                  {streamingText ? (
                    <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed bg-white/[0.04] text-zinc-300 rounded-bl-md border border-white/[0.06]">
                      <p className="whitespace-pre-wrap">{streamingText}</p>
                      <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5" />
                    </div>
                  ) : (
                    <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce [animation-delay:0.3s]"></span>
                    </div>
                  )}
                  <button 
                    onClick={handleStopExecution}
                    className="text-red-400/60 text-[8px] font-bold uppercase tracking-wider hover:text-red-400 transition-colors"
                  >
                    Detener
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 bg-zinc-900/95 backdrop-blur-2xl border-t border-white/5 shrink-0">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-zinc-200 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-zinc-600"
              />
              <button 
                onClick={handleSend} 
                disabled={isTyping || !input.trim()} 
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-lg shadow-indigo-500/20"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
