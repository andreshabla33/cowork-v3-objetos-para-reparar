
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { TaskStatus, Task, Attachment } from '../types';
import { getThemeStyles } from '@/lib/theme';

export const TaskBoard: React.FC = () => {
  const { tasks, updateTaskStatus, addTask, theme } = useStore();
  const s = getThemeStyles(theme);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [newTask, setNewTask] = useState<{
    title: string;
    description: string;
    startDate: string;
    dueDate: string;
    attachments: Attachment[];
  }>({ title: '', description: '', startDate: '', dueDate: '', attachments: [] });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // ── Column metadata ───────────────────────────────────────────────────
  const columns = [
    { id: TaskStatus.TODO,        label: 'Pendientes',  dot: 'bg-slate-400'   },
    { id: TaskStatus.IN_PROGRESS, label: 'En Progreso', dot: 'bg-sky-500'     },
    { id: TaskStatus.DONE,        label: 'Completado',  dot: 'bg-emerald-500' },
  ];

  // ── Handlers ──────────────────────────────────────────────────────────
  const toggleTaskCollapse = (taskId: string) => {
    setCollapsedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    const task: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      description: newTask.description,
      status: TaskStatus.TODO,
      startDate: newTask.startDate,
      dueDate: newTask.dueDate,
      attachments: newTask.attachments,
    };
    addTask(task);
    setNewTask({ title: '', description: '', startDate: '', dueDate: '', attachments: [] });
    setIsModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).map((file: File) => ({
        name: file.name, url: '#', type: file.type,
      }));
      setNewTask(prev => ({ ...prev, attachments: [...prev.attachments, ...filesArray] }));
    }
  };

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) updateTaskStatus(taskId, status);
    setDraggedTaskId(null);
  };

  return (
    <div className={`p-8 h-full overflow-y-auto relative ${s.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${s.text}`}>Project Dashboard</h2>
          <p className={`mt-1 text-sm ${s.textMuted}`}>Gestiona tareas. Haz clic en el icono para contraer/expandir tarjetas.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`px-5 py-2.5 rounded-xl text-sm transition-all active:scale-95 ${s.btn}`}
        >
          + Nueva Tarea
        </button>
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-[calc(100vh-250px)]">
        {columns.map(col => (
          <div
            key={col.id}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, col.id)}
            className={`flex flex-col rounded-xl border overflow-hidden ${s.surface} ${s.border}`}
          >
            {/* Column header */}
            <div className={`p-3.5 border-b ${s.borderSubtle} ${s.surfaceMuted} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <h3 className={`font-bold text-[11px] uppercase tracking-wider ${s.text}`}>{col.label}</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.surface} ${s.border} ${s.textMuted}`}>
                {tasks.filter(task => task.status === col.id).length}
              </span>
            </div>

            {/* Cards */}
            <div className="p-3 flex-1 space-y-3 overflow-y-auto">
              {tasks.filter(task => task.status === col.id).map(task => {
                const isCollapsed = collapsedTaskIds.has(task.id);
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    className={`border p-4 rounded-xl transition-all duration-150 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md ${s.surface} ${s.border} ${draggedTaskId === task.id ? 'opacity-40 grayscale' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`font-semibold text-sm ${s.text} ${isCollapsed ? 'truncate flex-1' : ''}`}>{task.title}</h4>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleTaskCollapse(task.id); }}
                        className={`p-1 rounded-lg shrink-0 transition-colors ${s.btnGhost}`}
                        title={isCollapsed ? 'Expandir' : 'Contraer'}
                      >
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className={`text-xs line-clamp-2 ${s.textMuted}`}>{task.description}</p>

                        {(task.startDate || task.dueDate) && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {task.startDate && (
                              <span className={`text-[10px] px-2 py-1 rounded-lg border ${s.surfaceMuted} ${s.border} ${s.textMuted}`}>
                                Inicio: {task.startDate}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className={`text-[10px] px-2 py-1 rounded-lg border ${s.accentSurface} ${s.accentBorder} ${s.accent}`}>
                                Entrega: {task.dueDate}
                              </span>
                            )}
                          </div>
                        )}

                        {task.attachments && task.attachments.length > 0 && (
                          <div className={`mt-2.5 flex items-center gap-1 text-[10px] ${s.textSubtle}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {task.attachments.length} {task.attachments.length === 1 ? 'adjunto' : 'adjuntos'}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between">
                          <div className={`w-6 h-6 rounded-full ${s.accentSurface} ${s.accent} flex items-center justify-center text-[8px] font-bold`}>U</div>
                          <div className={`text-[9px] font-bold uppercase tracking-widest ${s.textSubtle}`}>
                            {task.status.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {tasks.filter(task => task.status === col.id).length === 0 && (
                <div className={`h-28 flex items-center justify-center border-2 border-dashed rounded-xl text-xs italic ${s.border} ${s.textSubtle} ${s.surfaceMuted}`}>
                  Suelta tareas aquí
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`border rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[85vh] ${s.surface} ${s.border}`}>
            <h3 className={`text-lg font-bold tracking-tight mb-5 ${s.text}`}>Nueva Tarea</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">

              <div>
                <label className={`text-[9px] uppercase font-bold tracking-widest block mb-1.5 ${s.textSubtle}`}>Título</label>
                <input
                  autoFocus required type="text" value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Nombre de la tarea..."
                  className={`w-full rounded-xl px-4 py-2.5 text-sm transition-colors ${s.input}`}
                />
              </div>

              <div>
                <label className={`text-[9px] uppercase font-bold tracking-widest block mb-1.5 ${s.textSubtle}`}>Descripción</label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Detalles..." rows={2}
                  className={`w-full rounded-xl px-4 py-2.5 text-sm resize-none transition-colors ${s.input}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-[9px] uppercase font-bold tracking-widest block mb-1.5 ${s.textSubtle}`}>Fecha Inicio</label>
                  <input
                    type="date" value={newTask.startDate}
                    onChange={e => setNewTask({ ...newTask, startDate: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2.5 text-sm transition-colors ${s.input}`}
                  />
                </div>
                <div>
                  <label className={`text-[9px] uppercase font-bold tracking-widest block mb-1.5 ${s.textSubtle}`}>Fecha Entrega</label>
                  <input
                    type="date" value={newTask.dueDate}
                    onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2.5 text-sm transition-colors ${s.input}`}
                  />
                </div>
              </div>

              <div>
                <label className={`text-[9px] uppercase font-bold tracking-widest block mb-1.5 ${s.textSubtle}`}>Adjuntar Documentos</label>
                <div className="relative group">
                  <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className={`w-full border-2 border-dashed rounded-xl py-5 flex flex-col items-center justify-center transition-all ${s.surfaceMuted} ${s.border} group-hover:border-sky-300`}>
                    <svg className={`w-6 h-6 mb-1.5 ${s.textSubtle}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className={`text-[10px] ${s.textSubtle}`}>Haz clic o arrastra archivos</span>
                  </div>
                </div>
                {newTask.attachments.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {newTask.attachments.map((file, idx) => (
                      <div key={idx} className={`px-2.5 py-0.5 rounded-full text-[9px] border flex items-center gap-1.5 ${s.surfaceMuted} ${s.border} ${s.textMuted}`}>
                        {file.name}
                        <button type="button" onClick={() => setNewTask(p => ({ ...p, attachments: p.attachments.filter((_, i) => i !== idx) }))}>
                          <svg className={`w-2.5 h-2.5 ${s.danger}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setIsModalOpen(false)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${s.btnSecondary}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs transition-all active:scale-95 ${s.btn}`}
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
