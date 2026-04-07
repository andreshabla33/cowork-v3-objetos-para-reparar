import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import type { Avatar3DConfig } from './shared';
import { DEFAULT_MODEL_URL } from './shared';

export const useAvatar3D = (userId?: string) => {
  const [avatarConfig, setAvatarConfig] = useState<Avatar3DConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fallbackUniversalLogRef = useRef<Record<string, true>>({});
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const requestId = ++loadSeqRef.current;
    let cancelled = false;

    const loadAvatar = async () => {
      try {
        setLoading(true);
        setError(null);

        let targetUserId = userId;
        if (!targetUserId) {
          // Read from Zustand store — NO async getUser() to avoid orphaned Web Lock.
          targetUserId = useStore.getState().session?.user?.id;
        }

        if (!targetUserId) {
          if (!cancelled && requestId === loadSeqRef.current) {
            setAvatarConfig(null);
            setLoading(false);
          }
          return;
        }

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('avatar_3d_id')
          .eq('id', targetUserId)
          .maybeSingle();

        let avatarId = usuario?.avatar_3d_id;

        if (!avatarId) {
          const { data: defaultAvatar } = await supabase
            .from('avatares_3d')
            .select('id')
            .eq('activo', true)
            .order('orden', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (defaultAvatar) {
            avatarId = defaultAvatar.id;
          } else {
            if (!cancelled && requestId === loadSeqRef.current) {
              setAvatarConfig({
                id: 'default',
                nombre: 'Default',
                modelo_url: DEFAULT_MODEL_URL,
                escala: 1,
              });
              setLoading(false);
            }
            return;
          }
        }

        let { data: avatar } = await supabase
          .from('avatares_3d')
          .select('*')
          .eq('id', avatarId)
          .maybeSingle();

        if (!avatar) {
          console.warn('⚠️ Avatar asignado no existe en BD (eliminado). Buscando fallback...');
          const { data: fallbackAvatar } = await supabase
            .from('avatares_3d')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (fallbackAvatar) {
            avatar = fallbackAvatar;
            avatarId = fallbackAvatar.id;
            if (targetUserId) {
              await supabase
                .from('usuarios')
                .update({ avatar_3d_id: fallbackAvatar.id })
                .eq('id', targetUserId);
              console.log('✅ Avatar reseteado a fallback:', fallbackAvatar.nombre);
            }
          } else {
            if (!cancelled && requestId === loadSeqRef.current) {
              setAvatarConfig({
                id: 'default',
                nombre: 'Default',
                modelo_url: DEFAULT_MODEL_URL,
                escala: 1,
              });
              setLoading(false);
            }
            return;
          }
        }

        if (avatar) {
          let { data: anims } = await supabase
            .from('avatar_animaciones')
            .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
            .eq('avatar_id', avatarId)
            .eq('activo', true)
            .order('orden', { ascending: true });

          let isFallback = false;
          if (!anims || anims.length === 0) {
            const fallbackKey = avatar.id || avatar.nombre || 'avatar';
            if (!fallbackUniversalLogRef.current[fallbackKey]) {
              console.log(`⚠️ ${avatar.nombre}: sin anims propias, buscando universales...`);
            }
            const { data: universalAnims } = await supabase
              .from('avatar_animaciones')
              .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
              .eq('es_universal', true)
              .eq('activo', true)
              .order('orden', { ascending: true });
            if (universalAnims && universalAnims.length > 0) {
              anims = universalAnims;
              isFallback = true;
              if (!fallbackUniversalLogRef.current[fallbackKey]) {
                console.log(`✅ Universales: usando ${universalAnims.length} anims compartidas`);
                fallbackUniversalLogRef.current[fallbackKey] = true;
              }
            }
          }

          const config: Avatar3DConfig = {
            id: avatar.id,
            nombre: avatar.nombre,
            modelo_url: avatar.modelo_url || DEFAULT_MODEL_URL,
            escala: avatar.escala || 1,
            textura_url: avatar.textura_url || null,
            modelo_url_medium: avatar.modelo_url_medium || null,
            modelo_url_low: avatar.modelo_url_low || null,
            textura_url_medium: avatar.textura_url_medium || null,
            textura_url_low: avatar.textura_url_low || null,
            animaciones: anims?.map((a: any) => ({
              id: a.id,
              nombre: a.nombre,
              url: a.url,
              loop: a.loop ?? false,
              orden: a.orden ?? 0,
              strip_root_motion: a.strip_root_motion ?? false,
              es_fallback: isFallback,
            })) || [],
          };
          if (!cancelled && requestId === loadSeqRef.current) {
            setAvatarConfig(config);
          }
        }
      } catch (err: any) {
        console.error('❌ Error en useAvatar3D:', err);
        if (!cancelled && requestId === loadSeqRef.current) {
          setError(err.message || 'Error desconocido');
          setAvatarConfig({
            id: 'default',
            nombre: 'Default',
            modelo_url: DEFAULT_MODEL_URL,
            escala: 1,
          });
        }
      } finally {
        if (!cancelled && requestId === loadSeqRef.current) {
          const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const elapsed = Math.max(0, Math.round(endedAt - startedAt));
          console.log(`[Avatar3D] Config ready in ${elapsed}ms for ${userId || 'current-user'}`);
          setLoading(false);
        }
      }
    };

    loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { avatarConfig, loading, error };
};
