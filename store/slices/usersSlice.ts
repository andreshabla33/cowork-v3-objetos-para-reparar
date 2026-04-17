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
  /**
   * Authoritative set of participant identities in the LiveKit room.
   * Mirror of the useLiveKit hook's internal state. Used by WorkspaceLayout
   * to gate `onlineUsers` against ghosts (Presence CRDT takes ~30s to
   * propagate abrupt disconnects, whereas LiveKit is race-free).
   */
  remoteParticipantIds: Set<string>;
  /**
   * Monotonic counter bumped every time a remote participant joins the room.
   * Consumers (e.g. Player3D) watch this to emit a "welcome" broadcast of
   * their own state so the new peer doesn't wait up to 2s for the idle
   * heartbeat to fire.
   */
  participantJoinVersion: number;
  tasks: Task[];

  setOnlineUsers: (users: User[]) => void;
  setRemoteParticipantIds: (ids: Set<string>) => void;
  bumpParticipantJoinVersion: () => void;
  addTask: (task: Task) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
}

export const createUsersSlice: StateCreator<UsersSlice, [], [], UsersSlice> = (set) => ({
  users: [],
  onlineUsers: [],
  remoteParticipantIds: new Set<string>(),
  participantJoinVersion: 0,
  tasks: [],

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setRemoteParticipantIds: (ids) => set({ remoteParticipantIds: ids }),
  bumpParticipantJoinVersion: () =>
    set((state) => ({ participantJoinVersion: state.participantJoinVersion + 1 })),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
});
