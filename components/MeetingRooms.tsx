/**
 * @module components/MeetingRooms
 * @description Pure presentation component for meeting rooms UI.
 * All business logic extracted to useMeetingRooms hook.
 *
 * Clean Architecture pattern:
 * - Zero supabase imports — all DB access through hook
 * - Zero console.log — logging handled in hook via logger
 * - Strict TypeScript: zero any types
 * - Pure presentational: renders UI and delegates to hook handlers
 */

import React from 'react';
import { useMeetingRooms } from '@/hooks/meetings/useMeetingRooms';
import type { SalaReunionData } from '@/src/core/domain/ports/IMeetingRepository';

interface MeetingRoomsProps {
  /**
   * Optional callback fired when user joins a room.
   * Allows parent component to navigate or perform actions.
   */
  onJoinRoom?: (roomId: string) => void;
}

/**
 * MeetingRooms component — Pure UI for managing meeting rooms.
 * - Displays list of active rooms
 * - Shows modals for creating and joining rooms
 * - Handles user interactions (create, join, leave, end)
 *
 * All state and logic delegated to useMeetingRooms hook.
 */
export const MeetingRooms: React.FC<MeetingRoomsProps> = ({ onJoinRoom }) => {
  const {
    // State
    rooms,
    showCreateModal,
    showJoinModal,
    password,
    newRoom,
    loading,

    // Setters
    setShowCreateModal,
    setShowJoinModal,
    setPassword,
    setNewRoom,

    // Actions
    createRoom,
    joinRoom,
    leaveRoom,
    endRoom,

    // Computed
    isInRoom,
    isCreator,
  } = useMeetingRooms(onJoinRoom);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest opacity-60">
          Salas de Reunión
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-bold transition-colors"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Nueva Sala
        </button>
      </div>

      {/* Empty State */}
      {rooms.length === 0 ? (
        <div className="text-center py-8 opacity-40">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p className="text-[11px] font-medium">No hay salas activas</p>
          <p className="text-[9px] mt-1">Crea una sala para comenzar una reunión</p>
        </div>
      ) : (
        /* Rooms List */
        <div className="space-y-2">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isInRoom={isInRoom(room)}
              isCreator={isCreator(room)}
              onJoin={joinRoom}
              onLeave={leaveRoom}
              onEnd={endRoom}
              onRequestPassword={(roomId) => setShowJoinModal(roomId)}
            />
          ))}
        </div>
      )}

      {/* Modal: Create Room */}
      {showCreateModal && (
        <CreateRoomModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          newRoom={newRoom}
          onRoomChange={setNewRoom}
          onCreateRoom={createRoom}
          loading={loading}
        />
      )}

      {/* Modal: Join Private Room */}
      {showJoinModal && (
        <JoinPrivateRoomModal
          isOpen={showJoinModal !== null}
          onClose={() => {
            setShowJoinModal(null);
            setPassword('');
          }}
          password={password}
          onPasswordChange={setPassword}
          onJoin={() => joinRoom(showJoinModal, password)}
        />
      )}
    </div>
  );
};

/**
 * RoomCard component — Displays a single room with actions
 */
interface RoomCardProps {
  room: SalaReunionData;
  isInRoom: boolean;
  isCreator: boolean;
  onJoin: (roomId: string) => void;
  onLeave: (roomId: string) => void;
  onEnd: (roomId: string) => void;
  onRequestPassword: (roomId: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({
  room,
  isInRoom,
  isCreator,
  onJoin,
  onLeave,
  onEnd,
  onRequestPassword,
}) => {
  const isFull = (room.participantes?.length || 0) >= (room.max_participantes || 10);

  return (
    <div
      className={`p-3 rounded-xl border transition-all ${
        isInRoom
          ? 'bg-indigo-500/20 border-indigo-500/50'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Left side: Room info */}
        <div className="flex-1 min-w-0">
          {/* Room name & privacy indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold truncate">{room.nombre}</span>
            {room.es_privada && (
              <svg
                className="w-3 h-3 text-amber-400 shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 1a5 5 0 00-5 5v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm3 7H9V6a3 3 0 116 0v2z" />
              </svg>
            )}
          </div>

          {/* Description */}
          {room.descripcion && (
            <p className="text-[10px] opacity-50 truncate mt-0.5">
              {room.descripcion}
            </p>
          )}

          {/* Participants count & creator */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[9px] opacity-40">
              {room.participantes?.length || 0}/{room.max_participantes || 10}{' '}
              participantes
            </span>
            <span className="text-[9px] opacity-40">
              por {room.creador?.nombre || 'Usuario'}
            </span>
          </div>

          {/* Participant avatars */}
          {room.participantes && room.participantes.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {room.participantes.slice(0, 5).map((p, i) => (
                <div
                  key={p.id}
                  className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center text-[8px] font-bold border border-white/20"
                  style={{ marginLeft: i > 0 ? '-8px' : 0 }}
                  title={p.usuario?.nombre || p.nombre_externo || undefined}
                >
                  {(p.usuario?.nombre || p.nombre_externo || '?').charAt(0)}
                </div>
              ))}
              {room.participantes.length > 5 && (
                <span className="text-[9px] opacity-50 ml-1">
                  +{room.participantes.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right side: Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isInRoom ? (
            <>
              {/* Leave button */}
              <button
                onClick={() => onLeave(room.id)}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-[9px] font-bold transition-colors"
              >
                Salir
              </button>

              {/* End room button (creator only) */}
              {isCreator && (
                <button
                  onClick={() => onEnd(room.id)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-[9px] font-bold transition-colors"
                >
                  Terminar
                </button>
              )}
            </>
          ) : (
            /* Join button */
            <button
              onClick={() =>
                room.es_privada
                  ? onRequestPassword(room.id)
                  : onJoin(room.id)
              }
              disabled={isFull}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-[9px] font-bold transition-colors"
            >
              Unirse
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * CreateRoomModal component — Modal for creating a new room
 */
interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  newRoom: NewRoomData;
  onRoomChange: (room: NewRoomData) => void;
  onCreateRoom: () => Promise<void>;
  loading: boolean;
}

// Extraído para poder referenciar el tipo en `onRoomChange` sin usar
// `typeof newRoom` (que referenciaba un nombre de campo, no un valor).
// Fix plan-correcciones Fase 1 — bug crítico TS2304.
interface NewRoomData {
  nombre: string;
  descripcion: string;
  es_privada: boolean;
  password: string;
  max_participantes: number;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  newRoom,
  onRoomChange,
  onCreateRoom,
  loading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] rounded-2xl w-full max-w-md p-6 border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">Nueva Sala de Reunión</h3>

        <div className="space-y-4">
          {/* Room name input */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={newRoom.nombre}
              onChange={(e) => onRoomChange({ ...newRoom, nombre: e.target.value })}
              placeholder="Ej: Daily Standup"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Description input */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
              Descripción
            </label>
            <input
              type="text"
              value={newRoom.descripcion}
              onChange={(e) =>
                onRoomChange({ ...newRoom, descripcion: e.target.value })
              }
              placeholder="Opcional"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Max participants select */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
              Máx. Participantes
            </label>
            <select
              value={newRoom.max_participantes}
              onChange={(e) =>
                onRoomChange({
                  ...newRoom,
                  max_participantes: parseInt(e.target.value),
                })
              }
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-indigo-500/50"
            >
              {[2, 5, 10, 15, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n} personas
                </option>
              ))}
            </select>
          </div>

          {/* Private room toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onRoomChange({ ...newRoom, es_privada: !newRoom.es_privada })}
              className={`w-10 h-6 rounded-full transition-colors ${
                newRoom.es_privada ? 'bg-indigo-600' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  newRoom.es_privada ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-[12px]">Sala privada (con contraseña)</span>
          </div>

          {/* Password input (conditional) */}
          {newRoom.es_privada && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                value={newRoom.password}
                onChange={(e) => onRoomChange({ ...newRoom, password: e.target.value })}
                placeholder="Contraseña de la sala"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          )}
        </div>

        {/* Modal buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-[12px] font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onCreateRoom}
            disabled={!newRoom.nombre.trim() || loading}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl text-[12px] font-bold transition-colors"
          >
            {loading ? 'Creando...' : 'Crear Sala'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * JoinPrivateRoomModal component — Modal for entering private room password
 */
interface JoinPrivateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  password: string;
  onPasswordChange: (pwd: string) => void;
  onJoin: () => Promise<void>;
}

const JoinPrivateRoomModal: React.FC<JoinPrivateRoomModalProps> = ({
  isOpen,
  onClose,
  password,
  onPasswordChange,
  onJoin,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm p-6 border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-4">
          <svg
            className="w-6 h-6 text-amber-400"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 1a5 5 0 00-5 5v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm3 7H9V6a3 3 0 116 0v2z" />
          </svg>
          <h3 className="text-lg font-bold">Sala Privada</h3>
        </div>

        <p className="text-[12px] opacity-60 mb-4">
          Esta sala requiere contraseña para unirse.
        </p>

        {/* Password input */}
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Ingresa la contraseña"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-indigo-500/50 mb-4"
          autoFocus
        />

        {/* Modal buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-[12px] font-bold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onJoin}
            disabled={!password}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl text-[12px] font-bold transition-colors"
          >
            Unirse
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingRooms;
