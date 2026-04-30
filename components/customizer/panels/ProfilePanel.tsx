/**
 * @module customizer/panels/ProfilePanel
 * @description Tab panel for editing user profile (photo + display name).
 * Contains photo upload, name input, and chat preview.
 *
 * Clean Architecture: Presentation layer — UI only, state via hook props.
 * Ref: React 19 — "Lift state up, pass slices down as props."
 */

import React from 'react';
import { UserAvatar } from '../../UserAvatar';
import type { UseProfileEditorReturn } from '@/hooks/customizer/useProfileEditor';
import type { PresenceStatus } from '@/types';

export interface ProfilePanelProps {
  profile: UseProfileEditorReturn;
  currentUser: {
    name: string;
    profilePhoto?: string;
    cargo?: string;
    status: PresenceStatus;
  };
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ profile, currentUser }) => {
  const triggerFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) void profile.uploadProfilePhoto(file);
    };
    input.click();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Foto de perfil */}
      <section className="flex flex-col items-center gap-3">
        <div className="relative group">
          <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="xl" />
          <button
            onClick={triggerFileSelect}
            disabled={profile.uploading}
            className="absolute inset-0 rounded-full bg-[#0B2240]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            {profile.uploading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerFileSelect}
            disabled={profile.uploading}
            className="px-3 py-1.5 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white font-bold uppercase tracking-wider text-[9px] rounded-lg shadow-[0_4px_14px_-4px_rgba(46,150,245,0.5)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {profile.profilePhoto ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {profile.profilePhoto && (
            <button
              onClick={() => void profile.removeProfilePhoto()}
              disabled={profile.uploading}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-[9px] font-bold text-red-600 transition-all border border-red-500/20"
            >
              Eliminar
            </button>
          )}
        </div>
        <p className="text-[9px] text-[#4A6485] text-center">
          Tu foto aparecerá en chats, perfil y menciones. Max 5MB.
        </p>
      </section>

      {/* Nombre */}
      <section>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#1E86E5] mb-1.5 block">Nombre</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={profile.displayName}
            onChange={(e) => {
              const newName = e.target.value;
              const input = e.currentTarget;
              setTimeout(() => {
                if (input.value === newName) {
                  void profile.updateDisplayName(newName);
                }
              }, 300);
            }}
            className="flex-1 w-full bg-white/70 border border-[rgba(46,150,245,0.16)] rounded-xl text-[#0B2240] placeholder-[#9CB0CA] focus:ring-2 focus:ring-[rgba(46,150,245,0.2)] focus:border-[#2E96F5] outline-none transition-all px-3 py-2 text-xs"
            placeholder="Tu nombre"
          />
          <button
            onClick={() => void profile.updateDisplayName(profile.displayName)}
            disabled={profile.displayName.trim() === currentUser.name}
            className="px-3 py-2 bg-gradient-to-r from-[#4FB0FF] to-[#2E96F5] text-white font-bold uppercase tracking-wider text-[9px] rounded-xl shadow-[0_4px_14px_-4px_rgba(46,150,245,0.5)] transition-all active:scale-[0.98] disabled:opacity-30"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Vista previa chat */}
      <section className="backdrop-blur-md bg-white/50 border border-[rgba(46,150,245,0.14)] rounded-2xl p-3">
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#1E86E5] mb-2 block">Vista previa en chat</label>
        <div className="flex items-center gap-2.5 p-2.5 bg-[#ECF4FF]/60 rounded-xl">
          <UserAvatar name={currentUser.name} profilePhoto={profile.profilePhoto || ''} size="sm" showStatus status={currentUser.status} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#0B2240] truncate">{profile.displayName || currentUser.name}</p>
            <p className="text-[9px] text-[#6B83A0]">{currentUser.cargo || 'Colaborador'}</p>
          </div>
          <span className="text-[8px] text-[#9CB0CA]">12:00</span>
        </div>
        <div className="ml-10 mt-1 p-2.5 bg-[rgba(46,150,245,0.08)] rounded-xl rounded-tl-none border border-[rgba(46,150,245,0.14)]">
          <p className="text-[11px] text-[#1B3A5C]">Hola equipo, ¿cómo va el proyecto?</p>
        </div>
      </section>
    </div>
  );
};
