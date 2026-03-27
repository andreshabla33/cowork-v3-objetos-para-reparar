import type { StateCreator } from 'zustand';
import { PresenceStatus, type AvatarConfig, type Role } from '../../types';
import type { Avatar3DConfig } from '../../components/avatar3d/shared';
import { supabase } from '../../lib/supabase';
import { getSettingsSection } from '../../lib/userSettings';
import { logger } from '../../lib/logger';
import type { StoreState } from '../state';

const log = logger.child('initialize');

type StoreSet = Parameters<StateCreator<StoreState>>[0];
type StoreGet = Parameters<StateCreator<StoreState>>[1];

interface InitializeActionOptions {
  initialAvatar: AvatarConfig;
  storageWorkspaceKey: string;
}

export const createInitializeAction = (
  set: StoreSet,
  get: StoreGet,
  options: InitializeActionOptions,
): StoreState['initialize'] => {
  return async () => {
    if (get().isInitializing) {
      log.debug('Already initializing, skipping');
      return;
    }
    if (get().initialized && get().activeWorkspace) {
      log.debug('Already initialized with active workspace, refreshing session only');
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) set({ session });
      } catch {
        // ignore
      }
      return;
    }
    if (get().initialized && (get().view === 'onboarding_creador' || get().view === 'onboarding')) {
      log.debug('Already in onboarding flow, skipping re-init');
      return;
    }

    set({
      isInitializing: true,
      ...(get().view === 'reset_password' ? {} : { view: 'loading' as const }),
    });
    log.info('Starting initialization');

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        log.error('Session error', { error: sessionError.message });
        set({ session: null, view: 'dashboard', initialized: true, isInitializing: false });
        return;
      }

      if (session) {
        log.info('Session found', { email: session.user.email });
        set({ session });
        const { user } = session;

        try {
          await supabase
            .from('usuarios')
            .upsert(
              {
                id: user.id,
                email: user.email,
                nombre: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
                estado_disponibilidad: 'available',
              },
              { onConflict: 'id', ignoreDuplicates: false },
            );
        } catch (error) {
          log.warn('Upsert usuarios safety net failed', { error: String(error) });
        }

        let avatarConfig = options.initialAvatar;
        let statusData: {
          estado_disponibilidad: PresenceStatus;
          estado_personalizado: string;
        } = {
          estado_disponibilidad: PresenceStatus.AVAILABLE,
          estado_personalizado: '',
        };

        try {
          const { data: avatarConfigData } = await supabase
            .from('avatar_configuracion')
            .select('configuracion')
            .eq('usuario_id', user.id)
            .maybeSingle();
          if (avatarConfigData?.configuracion) avatarConfig = avatarConfigData.configuracion;
        } catch (error) {
          log.warn('Could not load avatar config', { error: String(error) });
        }

        let avatar3DConfig: Avatar3DConfig | null = null;
        try {
          const { data: usuarioAvatar } = await supabase
            .from('usuarios')
            .select('avatar_3d_id')
            .eq('id', user.id)
            .maybeSingle();

          let avatarId = usuarioAvatar?.avatar_3d_id || null;

          if (!avatarId) {
            const { data: defaultAvatar } = await supabase
              .from('avatares_3d')
              .select('id')
              .eq('activo', true)
              .order('orden', { ascending: true })
              .limit(1)
              .maybeSingle();
            avatarId = defaultAvatar?.id || null;
          }

          if (avatarId) {
            let avatar3D = (
              await supabase.from('avatares_3d').select('*').eq('id', avatarId).maybeSingle()
            ).data;

            if (!avatar3D) {
              log.warn('Avatar asignado no existe en BD, buscando fallback');
              const { data: fallbackAvatar } = await supabase
                .from('avatares_3d')
                .select('*')
                .eq('activo', true)
                .order('orden', { ascending: true })
                .limit(1)
                .maybeSingle();

              if (fallbackAvatar) {
                avatar3D = fallbackAvatar;
                avatarId = fallbackAvatar.id;
                await supabase.from('usuarios').update({ avatar_3d_id: fallbackAvatar.id }).eq('id', user.id);
                log.info('Avatar reseteado a fallback', { nombre: fallbackAvatar.nombre });
              }
            }

            if (avatar3D) {
              let { data: anims } = await supabase
                .from('avatar_animaciones')
                .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
                .eq('avatar_id', avatarId)
                .eq('activo', true)
                .order('orden', { ascending: true });

              let isFallback = false;
              if (!anims || anims.length === 0) {
                const { data: universalAnims } = await supabase
                  .from('avatar_animaciones')
                  .select('id, nombre, url, loop, orden, strip_root_motion, avatar_id')
                  .eq('es_universal', true)
                  .eq('activo', true)
                  .order('orden', { ascending: true });
                if (universalAnims && universalAnims.length > 0) {
                  anims = universalAnims;
                  isFallback = true;
                }
              }

              avatar3DConfig = {
                ...avatar3D,
                textura_url: avatar3D.textura_url || null,
                animaciones:
                  anims?.map((animation: any) => ({
                    id: animation.id,
                    nombre: animation.nombre,
                    url: animation.url,
                    loop: animation.loop ?? false,
                    orden: animation.orden ?? 0,
                    strip_root_motion: animation.strip_root_motion ?? false,
                    es_fallback: isFallback,
                  })) || [],
              } as Avatar3DConfig;
            }
          }
        } catch (error) {
          log.warn('Could not load avatar 3D config', { error: String(error) });
        }

        let profilePhoto = '';
        try {
          const { data: usuarioData } = await supabase
            .from('usuarios')
            .select('estado_disponibilidad, estado_personalizado, avatar_url')
            .eq('id', user.id)
            .maybeSingle();
          if (usuarioData) {
            statusData = usuarioData as {
              estado_disponibilidad: PresenceStatus;
              estado_personalizado: string;
            };
            profilePhoto = usuarioData.avatar_url || '';
          }
        } catch (error) {
          log.warn('Could not load user status', { error: String(error) });
        }

        set({
          currentUser: {
            ...get().currentUser,
            id: user.id,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
            avatarConfig,
            profilePhoto,
            status: statusData.estado_disponibilidad || PresenceStatus.AVAILABLE,
            statusText: statusData.estado_personalizado || '',
          },
          avatar3DConfig,
        });

        const workspaces = await get().fetchWorkspaces();
        log.info('Workspaces loaded', { count: workspaces.length });

        if (get().view === 'reset_password') {
          log.debug('Maintaining reset_password view');
        } else {
          const savedId = localStorage.getItem(options.storageWorkspaceKey);
          const urlParams = new URLSearchParams(window.location.search);
          const invitationToken = urlParams.get('token');

          if (invitationToken) {
            log.info('Invitation token found, going to invitation view');
            set({ view: 'invitation' });
          } else if (workspaces.length === 0) {
            log.info('No workspaces, going to onboarding_creador');
            set({ view: 'onboarding_creador' });
          } else if (workspaces.length === 1) {
            const soloWorkspace = workspaces[0];
            const restoredFromSave = savedId && soloWorkspace.id === savedId;
            log.info('Single workspace, auto-selecting', { name: soloWorkspace.name, restored: restoredFromSave });
            get().setActiveWorkspace(soloWorkspace, (soloWorkspace as { userRole?: Role }).userRole);
            set({ view: 'workspace' });
          } else if (savedId) {
            const found = workspaces.find((workspace) => workspace.id === savedId);
            if (found) {
              log.info('Restoring workspace', { name: found.name });
              get().setActiveWorkspace(found, (found as { userRole?: Role }).userRole);
              set({ view: 'workspace' });
            } else {
              log.debug('Saved workspace not found, going to dashboard');
              set({ view: 'dashboard' });
            }
          } else {
            const generalSettings = getSettingsSection('general');
            if (generalSettings.skipWelcomeScreen && workspaces.length > 0) {
              log.debug('Skipping welcome, going to first workspace');
              get().setActiveWorkspace(workspaces[0], (workspaces[0] as { userRole?: Role }).userRole);
              set({ view: 'workspace' });
            } else {
              log.debug('Multiple workspaces, going to dashboard');
              set({ view: 'dashboard' });
            }
          }
        }
      } else if (get().view === 'reset_password') {
        log.debug('No session, keeping reset_password view');
        set({ session: null });
      } else {
        log.debug('No session, going to dashboard');
        set({ session: null, view: 'dashboard' });
      }
    } catch (error) {
      log.error('Initialization failed', { error: String(error) });
      if (get().view !== 'reset_password') {
        set({ view: 'dashboard' });
      }
    } finally {
      set({ initialized: true, isInitializing: false });
      log.info('Initialization complete');
    }
  };
};
