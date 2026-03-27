/**
 * Users Slice — Clean Architecture Domain Store
 *
 * Maneja: lista de usuarios, usuarios online, tareas.
 */
import type { StateCreator } from 'zustand';
import type { User, Task, TaskStatus } from '../../types';

export interface UsersSlice {
  users: User[];
  onlineUsers: User[];
  tasks: Task[];

  setOnlineUsers: (users: User[]) => void;
  addTask: (task: Task) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
}

export const createUsersSlice: StateCreator<UsersSlice, [], [], UsersSlice> = (set) => ({
  users: [],
  onlineUsers: [],
  tasks: [],

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
});
