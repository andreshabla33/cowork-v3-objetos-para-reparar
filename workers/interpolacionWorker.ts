export type InterpolacionWorkerMessage =
  | { type: 'upsert'; payload: { id: string; x: number; z: number; direction?: string; isMoving?: boolean; teleport?: boolean } }
  | { type: 'remove'; payload: { id: string } }
  | { type: 'clear'; payload: null };

type InterpolacionWorkerResponse =
  | { type: 'update'; payload: { positions: Array<{ id: string; x: number; z: number; direction?: string; isMoving?: boolean }> } }
  | { type: 'error'; payload: { message: string } };

interface EstadoInterpolacion {
  id: string;
  currentX: number;
  currentZ: number;
  targetX: number;
  targetZ: number;
  direction?: string;
  isMoving: boolean;
  lastSentX: number;
  lastSentZ: number;
  lastSentDirection?: string;
  lastSentIsMoving: boolean;
}

const SUAVIZADO = 12.0;
const INTERVALO_MS = 33;
const UMBRAL_MOVIMIENTO = 0.01;
const UMBRAL_ENVIO = 0.0005;

const estados = new Map<string, EstadoInterpolacion>();

const enviar = (mensaje: InterpolacionWorkerResponse) => {
  postMessage(mensaje);
};

const enviarActualizacionInmediata = (estado: EstadoInterpolacion) => {
  estado.lastSentX = estado.currentX;
  estado.lastSentZ = estado.currentZ;
  estado.lastSentDirection = estado.direction;
  estado.lastSentIsMoving = estado.isMoving;
  enviar({
    type: 'update',
    payload: {
      positions: [
        {
          id: estado.id,
          x: estado.currentX,
          z: estado.currentZ,
          direction: estado.direction,
          isMoving: estado.isMoving,
        },
      ],
    },
  });
};

let ultimoTick = performance.now();

const tick = () => {
  const ahora = performance.now();
  const delta = Math.max(0.001, (ahora - ultimoTick) / 1000);
  ultimoTick = ahora;

  if (estados.size === 0) return;

  const posiciones: Array<{ id: string; x: number; z: number; direction?: string; isMoving?: boolean }> = [];

  estados.forEach((estado) => {
    const dx = estado.targetX - estado.currentX;
    const dz = estado.targetZ - estado.currentZ;
    const distancia = Math.sqrt(dx * dx + dz * dz);

    if (distancia > UMBRAL_MOVIMIENTO) {
      const t = 1.0 - Math.exp(-SUAVIZADO * delta);
      estado.currentX += dx * t;
      estado.currentZ += dz * t;
    } else {
      estado.currentX = estado.targetX;
      estado.currentZ = estado.targetZ;
    }

    const debeEnviar =
      Math.abs(estado.currentX - estado.lastSentX) > UMBRAL_ENVIO ||
      Math.abs(estado.currentZ - estado.lastSentZ) > UMBRAL_ENVIO ||
      estado.direction !== estado.lastSentDirection ||
      estado.isMoving !== estado.lastSentIsMoving;

    if (debeEnviar) {
      estado.lastSentX = estado.currentX;
      estado.lastSentZ = estado.currentZ;
      estado.lastSentDirection = estado.direction;
      estado.lastSentIsMoving = estado.isMoving;
      posiciones.push({
        id: estado.id,
        x: estado.currentX,
        z: estado.currentZ,
        direction: estado.direction,
        isMoving: estado.isMoving,
      });
    }
  });

  if (posiciones.length > 0) {
    enviar({ type: 'update', payload: { positions: posiciones } });
  }
};

setInterval(tick, INTERVALO_MS);

const procesarUpsert = (payload: { id: string; x: number; z: number; direction?: string; isMoving?: boolean; teleport?: boolean }) => {
  if (!payload?.id || typeof payload.x !== 'number' || typeof payload.z !== 'number') {
    enviar({ type: 'error', payload: { message: 'Payload inválido en worker de interpolación' } });
    return;
  }

  const existente = estados.get(payload.id);
  if (!existente) {
    const isMoving = payload.isMoving ?? false;
    const nuevoEstado: EstadoInterpolacion = {
      id: payload.id,
      currentX: payload.x,
      currentZ: payload.z,
      targetX: payload.x,
      targetZ: payload.z,
      direction: payload.direction,
      isMoving,
      lastSentX: payload.x,
      lastSentZ: payload.z,
      lastSentDirection: payload.direction,
      lastSentIsMoving: isMoving,
    };
    estados.set(payload.id, nuevoEstado);
    enviarActualizacionInmediata(nuevoEstado);
    return;
  }

  if (payload.teleport) {
    existente.currentX = payload.x;
    existente.currentZ = payload.z;
    existente.targetX = payload.x;
    existente.targetZ = payload.z;
  } else {
    existente.targetX = payload.x;
    existente.targetZ = payload.z;
  }

  if (typeof payload.direction !== 'undefined') {
    existente.direction = payload.direction;
  }
  if (typeof payload.isMoving === 'boolean') {
    existente.isMoving = payload.isMoving;
  }

  if (payload.teleport) {
    enviarActualizacionInmediata(existente);
  }
};

const esMensajeValido = (data: unknown): data is InterpolacionWorkerMessage => {
  return !!data && typeof data === 'object' && 'type' in (data as Record<string, unknown>);
};

self.onmessage = (event: MessageEvent<InterpolacionWorkerMessage>) => {
  try {
    const data = event.data;
    if (!esMensajeValido(data)) {
      enviar({ type: 'error', payload: { message: 'Mensaje inválido para worker de interpolación' } });
      return;
    }

    const { type, payload } = data;

    if (type === 'upsert') {
      procesarUpsert(payload as { id: string; x: number; z: number; direction?: string; isMoving?: boolean; teleport?: boolean });
      return;
    }

    if (type === 'remove') {
      const id = (payload as { id?: string })?.id;
      if (id) estados.delete(id);
      return;
    }

    if (type === 'clear') {
      estados.clear();
      return;
    }

    enviar({ type: 'error', payload: { message: 'Mensaje inválido para worker de interpolación' } });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido en worker de interpolación';
    enviar({ type: 'error', payload: { message: mensaje } });
  }
};
