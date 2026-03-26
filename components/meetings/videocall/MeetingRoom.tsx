'use client';

import React from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import '@livekit/components-styles';
import { crearOpcionesSalaLiveKit } from '@/modules/realtime-room';
import { getMeetingJoinDefaults } from '@/lib/userSettings';
import { MeetingRoomContent } from './MeetingRoomContent';
import { useMeetingAccess } from './hooks/useMeetingAccess';
import type { MeetingRoomProps } from './meetingRoom.types';

// Estilos por tema
const themeStyles = {
  dark: {
    bg: 'bg-[#0f0f1a]',
    card: 'bg-white/5 border-white/10',
    text: 'text-white',
    accent: 'bg-indigo-600 hover:bg-indigo-500',
    danger: 'bg-red-600 hover:bg-red-500',
  },
  arcade: {
    bg: 'bg-black',
    card: 'bg-black border-[#00ff41]/30',
    text: 'text-[#00ff41]',
    accent: 'bg-[#00ff41] text-black hover:bg-white',
    danger: 'bg-red-600 hover:bg-red-500',
  },
};

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  salaId,
  tokenInvitacion,
  nombreInvitado,
  preferenciasIngreso,
  tipoReunion: propTipoReunion,
  reunionId: propReunionId,
  onLeave,
  onError,
}) => {
  const {
    theme,
    currentUser,
    activeWorkspace,
    tokenData,
    loading,
    error,
    tipoReunion,
    reunionId,
    showChat,
    cargoUsuario,
    invitadoExterno,
    guestPermissions,
    recoveryState,
    salaEspacioId,
    fetchToken,
    handleRoomConnected,
    handleRoomDisconnected,
    handleLiveKitError,
    handleUserLeave,
    handleToggleChat,
  } = useMeetingAccess({
    salaId,
    tokenInvitacion,
    nombreInvitado,
    tipoReunion: propTipoReunion,
    reunionId: propReunionId,
    onLeave,
    onError,
  });

  const s = themeStyles[theme as keyof typeof themeStyles] || themeStyles.dark;
  const joinDefaults = getMeetingJoinDefaults();
  const audioInicial = preferenciasIngreso?.microfonoActivo ?? !joinDefaults.muteOnJoin;
  const videoInicial = preferenciasIngreso?.camaraActiva ?? !joinDefaults.cameraOffOnJoin;
  const guestMode = Boolean(tokenInvitacion);
  const resolvedUserId = guestMode
    ? invitadoExterno?.id || tokenData?.participante_id || ''
    : currentUser?.id || '';
  const resolvedUserName = guestMode
    ? nombreInvitado || invitadoExterno?.nombre || 'Invitado'
    : currentUser?.name || nombreInvitado || 'Participante';
  const resolvedUserAvatar = guestMode ? undefined : currentUser?.profilePhoto;
  const resolvedEspacioId = guestMode
    ? salaEspacioId || ''
    : activeWorkspace?.id || salaEspacioId || '';

  // Loading state
  if (loading) {
    return (
      <div className={`h-full w-full flex items-center justify-center ${s.bg}`}>
        <div className="text-center">
          <div className={`w-12 h-12 border-4 ${theme === 'arcade' ? 'border-[#00ff41]' : 'border-indigo-500'} border-t-transparent rounded-full animate-spin mx-auto mb-4`} />
          <p className={`${s.text} opacity-60`}>{recoveryState.recoveryMessage || 'Conectando a la sala...'}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !tokenData) {
    return (
      <div className={`h-full w-full flex items-center justify-center ${s.bg}`}>
        <div className={`${s.card} border rounded-2xl p-8 max-w-md text-center`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className={`text-lg font-bold ${s.text} mb-2`}>Error de conexión</h3>
          <p className="text-sm opacity-60 mb-2">{error || 'No se pudo obtener acceso a la sala'}</p>
          {recoveryState.recoveryMessage && (
            <p className="text-xs opacity-50 mb-6">{recoveryState.recoveryMessage}</p>
          )}
          <button
            onClick={fetchToken}
            className={`px-6 py-2.5 ${s.accent} rounded-xl text-sm font-bold transition-all`}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full ${s.bg}`}>
      <LiveKitRoom
        serverUrl={tokenData.url}
        token={tokenData.token}
        connect={true}
        audio={false}
        video={false}
        options={crearOpcionesSalaLiveKit()}
        onConnected={handleRoomConnected}
        onDisconnected={handleRoomDisconnected}
        onError={handleLiveKitError}
        data-lk-theme="default"
        style={{ height: '100%' }}
      >
        <MeetingRoomContent 
          theme={theme}
          isHost={tokenData.permisos.roomAdmin}
          isExternalGuest={guestMode}
          tokenInvitacion={tokenInvitacion}
          onLeave={handleUserLeave}
          onRetryConnection={fetchToken}
          tipoReunion={tipoReunion}
          salaId={salaId}
          reunionId={reunionId}
          initialCameraEnabled={videoInicial}
          initialMicrophoneEnabled={audioInicial}
          showChat={showChat}
          onToggleChat={handleToggleChat}
          espacioId={resolvedEspacioId}
          userId={resolvedUserId}
          userName={resolvedUserName}
          userAvatar={resolvedUserAvatar}
          cargoUsuario={cargoUsuario}
          invitadosExternos={invitadoExterno ? [invitadoExterno] : []}
          guestPermissions={guestPermissions}
          recoveryState={recoveryState}
        />
      </LiveKitRoom>
    </div>
  );
};

export default MeetingRoom;

