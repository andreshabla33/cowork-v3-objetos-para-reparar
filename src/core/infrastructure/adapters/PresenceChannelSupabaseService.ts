/**
 * @module infrastructure/adapters/PresenceChannelSupabaseService
 * @description Adapter Supabase de `IPresenceChannelService`.
 *
 * Wraps the SupabaseClient channel primitives (`channel`, `removeChannel`,
 * `getChannels`) detrás del port para que hooks UI (workspace/presence) no
 * importen el client global directamente.
 *
 * Refs:
 *  - https://supabase.com/docs/reference/javascript/subscribe
 *  - https://supabase.com/docs/reference/javascript/getchannels
 *  - https://supabase.com/docs/reference/javascript/removechannel
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/core/infrastructure/supabase/supabaseClient';
import type {
  IPresenceChannelService,
  PresenceChannelConfig,
} from '@/core/domain/ports/IPresenceChannelService';

/**
 * Prefijo internal usado por `realtime-js` para tópicos de canales.
 *
 * NO es API pública oficial de Supabase. Documentado en el código fuente del
 * cliente: https://github.com/supabase/realtime-js/blob/master/src/RealtimeChannel.ts
 *
 * Si en una mayor version el prefix cambia, solo se actualiza acá —
 * la signature pública del port queda intacta.
 */
const REALTIME_TOPIC_PREFIX = 'realtime:';

export class PresenceChannelSupabaseService implements IPresenceChannelService {
  crearCanalPresence(name: string, config: PresenceChannelConfig): RealtimeChannel {
    return supabase.channel(name, { config });
  }

  eliminarCanal(channel: RealtimeChannel): void {
    supabase.removeChannel(channel);
  }

  buscarCanalActivoPorNombre(name: string): RealtimeChannel | undefined {
    const fullTopic = `${REALTIME_TOPIC_PREFIX}${name}`;
    return supabase.getChannels().find((ch) => ch.topic === fullTopic);
  }
}

export const presenceChannelService: IPresenceChannelService = new PresenceChannelSupabaseService();
