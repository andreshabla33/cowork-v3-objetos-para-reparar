/**
 * Agones Game Server Client
 * =========================
 * Abstracción client-side para conectarse a game servers orquestados por Agones.
 * Permite al frontend solicitar asignación de servidor, conectar vía WebSocket,
 * enviar/recibir estado del espacio virtual, y manejar reconexión automática.
 *
 * Flujo:
 *   1. Cliente solicita asignación → allocateServer(espacioId)
 *   2. Recibe IP:puerto del game server asignado
 *   3. Conecta vía WebSocket → connect()
 *   4. Envía/recibe posiciones, eventos, estado del mundo
 *   5. Heartbeat automático para mantener la conexión
 *   6. Reconexión automática con backoff exponencial
 *
 * Requiere backend (Edge Function o API) que se comunique con Agones Allocator.
 */

export interface AgonesServerInfo {
  host: string;
  port: number;
  espacioId: string;
  sessionToken: string;
  region?: string;
  capacity?: number;
}

export interface AgonesClientConfig {
  allocatorUrl: string;
  heartbeatIntervalMs?: number;
  maxReconnectAttempts?: number;
  reconnectBackoffMs?: number;
  onStateUpdate?: (state: WorldStateUpdate) => void;
  onConnected?: (server: AgonesServerInfo) => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: Error) => void;
}

export interface WorldStateUpdate {
  tipo: 'posicion' | 'evento' | 'estado_mundo' | 'usuario_entro' | 'usuario_salio';
  datos: Record<string, unknown>;
  timestamp: number;
}

export type AgonesConnectionState = 'desconectado' | 'asignando' | 'conectando' | 'conectado' | 'reconectando' | 'error';

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_MAX_RECONNECT = 8;
const DEFAULT_BACKOFF_MS = 1000;

export class AgonesClient {
  private config: Required<AgonesClientConfig>;
  private ws: WebSocket | null = null;
  private serverInfo: AgonesServerInfo | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: AgonesConnectionState = 'desconectado';
  private destroyed = false;

  constructor(config: AgonesClientConfig) {
    this.config = {
      allocatorUrl: config.allocatorUrl,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS,
      maxReconnectAttempts: config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT,
      reconnectBackoffMs: config.reconnectBackoffMs ?? DEFAULT_BACKOFF_MS,
      onStateUpdate: config.onStateUpdate ?? (() => {}),
      onConnected: config.onConnected ?? (() => {}),
      onDisconnected: config.onDisconnected ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };
  }

  get state(): AgonesConnectionState {
    return this._state;
  }

  get server(): AgonesServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Solicita al backend (Agones Allocator proxy) un game server para el espacio dado.
   */
  async allocateServer(espacioId: string, accessToken: string): Promise<AgonesServerInfo> {
    this._state = 'asignando';
    try {
      const res = await fetch(this.config.allocatorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ espacio_id: espacioId }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Agones allocation failed (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as AgonesServerInfo;
      this.serverInfo = data;
      return data;
    } catch (err) {
      this._state = 'error';
      this.config.onError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Conecta al game server asignado vía WebSocket.
   */
  connect(): void {
    if (!this.serverInfo) {
      throw new Error('No hay servidor asignado. Llamar allocateServer() primero.');
    }

    if (this.destroyed) return;

    this._state = this.reconnectAttempts > 0 ? 'reconectando' : 'conectando';
    const { host, port, sessionToken } = this.serverInfo;
    const protocol = port === 443 ? 'wss' : 'ws';
    const url = `${protocol}://${host}:${port}/ws?token=${encodeURIComponent(sessionToken)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this._state = 'error';
      this.config.onError(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._state = 'conectado';
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.config.onConnected(this.serverInfo!);
      console.log(`🎮 [Agones] Conectado a ${host}:${port}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WorldStateUpdate;
        this.config.onStateUpdate(msg);
      } catch {
        // Mensajes no-JSON se ignoran (pings, etc.)
      }
    };

    this.ws.onclose = (ev) => {
      this.stopHeartbeat();
      if (this.destroyed) {
        this._state = 'desconectado';
        return;
      }
      console.log(`🎮 [Agones] Desconectado (code=${ev.code}, reason=${ev.reason})`);
      this.config.onDisconnected(ev.reason || `code ${ev.code}`);
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // El error real se maneja en onclose
    };
  }

  /**
   * Envía un mensaje al game server.
   */
  send(tipo: string, datos: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ tipo, datos, timestamp: Date.now() }));
  }

  /**
   * Envía posición del jugador al game server.
   */
  sendPosition(x: number, y: number, direction: string, isMoving: boolean): void {
    this.send('posicion', { x, y, direction, isMoving });
  }

  /**
   * Desconecta limpiamente y libera recursos.
   */
  destroy(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'client_destroy');
      }
      this.ws = null;
    }
    this._state = 'desconectado';
    this.serverInfo = null;
  }

  // ─── Internos ────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ tipo: 'heartbeat', timestamp: Date.now() }));
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this._state = 'error';
      this.config.onError(new Error(`Agones: máximo de intentos de reconexión alcanzado (${this.config.maxReconnectAttempts})`));
      return;
    }

    const delay = this.config.reconnectBackoffMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this._state = 'reconectando';

    console.log(`🎮 [Agones] Reconectando en ${delay}ms (intento ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

/**
 * Hook-friendly factory. Devuelve null si allocatorUrl no está configurado.
 */
export function crearAgonesClient(config: Partial<AgonesClientConfig> & { allocatorUrl?: string }): AgonesClient | null {
  if (!config.allocatorUrl) {
    console.log('🎮 [Agones] allocatorUrl no configurado — game server deshabilitado');
    return null;
  }
  return new AgonesClient(config as AgonesClientConfig);
}
