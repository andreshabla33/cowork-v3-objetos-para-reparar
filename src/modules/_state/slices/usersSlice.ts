/**
 * Users Slice — Clean Architecture Domain Store
 *
 * Maneja: lista de usuarios, usuarios online, tareas.
 */
import type { StateCreator } from 'zustand';
import type { User, Task, TaskStatus } from '@/types';
import type { ProximityCluster } from '@/src/core/domain/services/ProximityClusterer';

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
  /**
   * IDs of users currently inside the local user's audio-proximity range.
   * Mirrors useProximity.usersInAudioRangeIds so non-3D consumers (like chat
   * notifications) can gate sound/toast by spatial proximity without needing
   * the full Space3D hook tree.
   */
  usersInAudioRangeIds: Set<string>;
  /**
   * IDs de usuarios en el "stream de proximidad" actual (cluster activo en
   * conversación con el local user — patrón Gather "nearby in call").
   * Subconjunto de `usersInAudioRangeIds` que cumple la histéresis de
   * activación. Mirror de `useProximity.usersInCallIds` publicado al store
   * para que el sidebar (ChatSidebarContent) pueda mostrar el cluster
   * inline estilo Gather sin re-instanciar la lógica de proximidad.
   */
  usersInCallIds: Set<string>;
  /**
   * ID de la meeting zone donde está el avatar local, o null. Mirror de
   * `useProximity.currentMeetingZoneId`. El sidebar lo usa para mostrar
   * "Tu sala actual" como sección destacada en "Juntas".
   */
  currentMeetingZoneId: string | null;
  /**
   * Clusters de proximidad GLOBALES del workspace — patrón Gather "Active
   * Areas". Lista de grupos de ≥2 personas conversando entre sí (por
   * proximidad ad-hoc o por meeting zone compartida). Mirror desde
   * `useProximity` que computa el clustering via `clusterize` Domain.
   *
   * El sidebar lo renderiza para mostrar las conversaciones activas de
   * OTROS users (no solo el cluster del local user).
   */
  proximityClusters: readonly ProximityCluster[];
  tasks: Task[];

  setOnlineUsers: (users: User[]) => void;
  setRemoteParticipantIds: (ids: Set<string>) => void;
  bumpParticipantJoinVersion: () => void;
  setUsersInAudioRangeIds: (ids: Set<string>) => void;
  setUsersInCallIds: (ids: Set<string>) => void;
  setCurrentMeetingZoneId: (id: string | null) => void;
  setProximityClusters: (clusters: readonly ProximityCluster[]) => void;
  addTask: (task: Task) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
}

export const createUsersSlice: StateCreator<UsersSlice, [], [], UsersSlice> = (set) => ({
  users: [],
  onlineUsers: [],
  remoteParticipantIds: new Set<string>(),
  participantJoinVersion: 0,
  usersInAudioRangeIds: new Set<string>(),
  usersInCallIds: new Set<string>(),
  currentMeetingZoneId: null,
  proximityClusters: [],
  tasks: [],

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setRemoteParticipantIds: (ids) => set({ remoteParticipantIds: ids }),
  bumpParticipantJoinVersion: () =>
    set((state) => ({ participantJoinVersion: state.participantJoinVersion + 1 })),
  setUsersInAudioRangeIds: (ids) => set({ usersInAudioRangeIds: ids }),
  setUsersInCallIds: (ids) => set({ usersInCallIds: ids }),
  setCurrentMeetingZoneId: (id) => set({ currentMeetingZoneId: id }),
  setProximityClusters: (clusters) => set({ proximityClusters: clusters }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTaskStatus: (id, status) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    })),
});
