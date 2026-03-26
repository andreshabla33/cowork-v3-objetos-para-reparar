import React, { useRef, useState, useEffect, useCallback } from 'react';

interface EmoteSyncProps {
  /** ID del usuario actual */
  currentUserId: string;
  /** Emote que el usuario actual está reproduciendo */
  currentEmote: string | null;
  /** Usuarios remotos con sus emotes activos {userId: emoteId} */
  remotosEmotes: Map<string, string>;
  /** Posición del usuario actual */
  currentPosition: { x: number; z: number };
  /** Posiciones de usuarios remotos */
  remotosPositions: Map<string, { x: number; z: number }>;
  /** Callback cuando se detecta sync (para mostrar efecto visual) */
  onSyncDetected?: (participantes: string[], emote: string) => void;
  /** Radio de proximidad para sync (default 5 unidades 3D) */
  radioSync?: number;
}

/**
 * Sistema de detección de emotes sincronizados.
 * Cuando 2+ avatares ejecutan el mismo emote (dance, cheer) 
 * dentro del radio de proximidad, se activa un efecto de "sync".
 * 
 * Este componente es lógico (no renderiza nada visual).
 * El efecto visual se delega al callback onSyncDetected.
 */
export const EmoteSync: React.FC<EmoteSyncProps> = ({
  currentUserId,
  currentEmote,
  remotosEmotes,
  currentPosition,
  remotosPositions,
  onSyncDetected,
  radioSync = 5,
}) => {
  const lastSyncRef = useRef<string | null>(null);
  const cooldownRef = useRef(0);

  // Emotes que pueden sincronizarse
  const emotesSync = ['dance', 'cheer', 'wave', 'victory'];

  const detectarSync = useCallback(() => {
    if (!currentEmote || !emotesSync.includes(currentEmote)) return;
    if (Date.now() - cooldownRef.current < 5000) return; // Cooldown 5s

    const participantes: string[] = [currentUserId];

    remotosEmotes.forEach((emote, userId) => {
      if (emote !== currentEmote) return;

      const pos = remotosPositions.get(userId);
      if (!pos) return;

      const dx = pos.x - currentPosition.x;
      const dz = pos.z - currentPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= radioSync) {
        participantes.push(userId);
      }
    });

    // Sync requiere al menos 2 participantes
    if (participantes.length >= 2) {
      const syncKey = `${currentEmote}-${participantes.sort().join(',')}`;
      if (syncKey !== lastSyncRef.current) {
        lastSyncRef.current = syncKey;
        cooldownRef.current = Date.now();
        onSyncDetected?.(participantes, currentEmote);
      }
    }
  }, [currentEmote, currentUserId, remotosEmotes, remotosPositions, currentPosition, radioSync, onSyncDetected]);

  useEffect(() => {
    detectarSync();
  }, [detectarSync]);

  return null; // Componente lógico, no visual
};

/**
 * Efecto visual de sync: partículas brillantes o anillo de luz
 * que aparece cuando se detecta sync entre avatares.
 */
export interface SyncEffectData {
  id: string;
  participantes: string[];
  emote: string;
  timestamp: number;
}

export const useSyncEffects = () => {
  const [efectos, setEfectos] = useState<SyncEffectData[]>([]);

  const agregarEfecto = useCallback((participantes: string[], emote: string) => {
    const efecto: SyncEffectData = {
      id: `sync-${Date.now()}`,
      participantes,
      emote,
      timestamp: Date.now(),
    };
    setEfectos(prev => [...prev, efecto]);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
      setEfectos(prev => prev.filter(e => e.id !== efecto.id));
    }, 3000);
  }, []);

  return { efectos, agregarEfecto };
};
