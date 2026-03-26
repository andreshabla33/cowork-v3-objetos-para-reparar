import type {
  InteraccionConfigObjeto3D,
  InteraccionDisplayConfig3D,
  InteraccionModal3D,
  InteraccionModoMovimiento3D,
  InteraccionOverlay3D,
  InteraccionSubTab3D,
  InteraccionUseConfig3D,
} from '@/types/objetos3d';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';

const SUBTABS_VALIDAS = new Set<InteraccionSubTab3D>([
  'space',
  'tasks',
  'miembros',
  'settings',
  'builder',
  'chat',
  'avatar',
  'calendar',
  'grabaciones',
  'metricas',
]);

const MODALES_VALIDOS = new Set<InteraccionModal3D>(['avatar', 'gamificacion']);
const OVERLAYS_VALIDOS = new Set<InteraccionOverlay3D>(['chat', 'emotes']);

export interface DestinoTeleportRuntime3D {
  x: number;
  z: number;
  modo: InteraccionModoMovimiento3D;
}

export const normalizarInteraccionConfigObjeto = (
  valor: EspacioObjeto['interaccion_config']
): InteraccionConfigObjeto3D | null => {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  return valor as InteraccionConfigObjeto3D;
};

export const resolverDestinoTeleportObjeto = (
  objeto: EspacioObjeto,
  config: InteraccionConfigObjeto3D | null
): DestinoTeleportRuntime3D => {
  const teleport = config?.teleport;
  const xBase = Number.isFinite(Number(teleport?.x)) ? Number(teleport?.x) : objeto.posicion_x;
  const zBase = Number.isFinite(Number(teleport?.z)) ? Number(teleport?.z) : objeto.posicion_z;
  const offsetX = Number.isFinite(Number(teleport?.offset_x)) ? Number(teleport?.offset_x) : 0;
  const offsetZ = Number.isFinite(Number(teleport?.offset_z)) ? Number(teleport?.offset_z) : 0;
  const modo = teleport?.modo || 'auto';

  return {
    x: xBase + offsetX,
    z: zBase + offsetZ,
    modo,
  };
};

const esSubtabValida = (valor?: string | null): valor is InteraccionSubTab3D => {
  return !!valor && SUBTABS_VALIDAS.has(valor as InteraccionSubTab3D);
};

const esModalValido = (valor?: string | null): valor is InteraccionModal3D => {
  return !!valor && MODALES_VALIDOS.has(valor as InteraccionModal3D);
};

const esOverlayValido = (valor?: string | null): valor is InteraccionOverlay3D => {
  return !!valor && OVERLAYS_VALIDOS.has(valor as InteraccionOverlay3D);
};

export interface DisplayRuntimeNormalizado3D {
  subtab?: InteraccionSubTab3D;
  modal?: InteraccionModal3D;
  overlay?: InteraccionOverlay3D;
  notificacionMensaje?: string;
  notificacionTipo?: 'info' | 'mention' | 'entry';
}

const normalizarConfigBase = (
  config?: InteraccionDisplayConfig3D | InteraccionUseConfig3D | null
): DisplayRuntimeNormalizado3D => {
  const resultado: DisplayRuntimeNormalizado3D = {};

  if (esSubtabValida(config?.subtab)) {
    resultado.subtab = config.subtab;
  }

  if (esModalValido(config?.modal)) {
    resultado.modal = config.modal;
  }

  if (esOverlayValido(config?.overlay)) {
    resultado.overlay = config.overlay;
  }

  if (config?.notificacion_mensaje) {
    resultado.notificacionMensaje = config.notificacion_mensaje;
  }

  if (config?.notificacion_tipo === 'info' || config?.notificacion_tipo === 'mention' || config?.notificacion_tipo === 'entry') {
    resultado.notificacionTipo = config.notificacion_tipo;
  }

  return resultado;
};

export const resolverDisplayObjeto = (config: InteraccionConfigObjeto3D | null) => {
  return normalizarConfigBase(config?.display);
};

export interface UseRuntimeNormalizado3D extends DisplayRuntimeNormalizado3D {
  xpAccion?: string;
  cooldownMs?: number;
}

export const resolverUseObjeto = (config: InteraccionConfigObjeto3D | null): UseRuntimeNormalizado3D => {
  const base = normalizarConfigBase(config?.use);
  const cooldownMs = Number(config?.use?.cooldown_ms);

  return {
    ...base,
    xpAccion: config?.use?.xp_accion || undefined,
    cooldownMs: Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : undefined,
  };
};
