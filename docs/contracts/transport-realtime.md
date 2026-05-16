# Transport Realtime — Contrato de eventos

**Fase:** 0.4 del [ROADMAP_MONOREPO_PHASER4.md](../ROADMAP_MONOREPO_PHASER4.md)
**Fecha:** 2026-05-16
**Estado:** vigente

Documenta el conjunto de eventos del transport que sobrevive al split en
`packages/application` (agnóstico de R3F o Phaser). El adapter LiveKit los
serializa a DataPackets vía `livekit-client`; cualquier futuro adapter
(WebSocket directo, ServerSentEvents, etc.) DEBE respetar este contrato.

**Regla dura:** lo que aparece en este doc vive en `packages/application`
o más abajo. Eventos R3F-specific (`mesh:raycast:hit`, `floor:click`, etc.)
quedan en `apps/cowork-3d` y NUNCA suben al core compartido.

---

## Eventos compartidos (core)

### `movement`
**Frecuencia:** ~10 Hz (throttled), `reliable: false`.
**Sentido:** cliente → SFU broadcast (todos los participantes de la Room).
**Payload:**
```ts
{
  id: string;             // userId del emisor
  x: number;              // world coord (escala DB *16, dividir entre 16 en consumer)
  y: number;
  direction: string;      // 'north'|'south'|'east'|'west'|... (4 u 8 direcciones)
  isMoving: boolean;
  animState?: 'idle'|'walk'|'run'|'jump'|...;
  chunk: string;          // chunk-of-interest (`chunkRow_chunkCol`)
  timestamp: number;      // ms epoch
}
```
**Consumidores:** `useBroadcast.manejarEventoInstantaneo`, `RemoteUsers.useFrame`
→ `movementSystem.setTarget`. Hidrata `realtimePositionsRef` y dispara el flag
`hasReceivedFirstRealTarget` para que `useProximity` pase el guard de coords
authoritative (ver `useProximity.ts` y bug-fix 2026-05-16).

### `presence:join` / `presence:leave` (Supabase Presence channels)
**Frecuencia:** evento puntual al subscribe / unsubscribe + keep-alive 45s.
**Sentido:** broadcast a todos los suscriptos al chunk channel.
**Payload:** estado completo del user (id, name, x, y, status, empresa_id,
isCameraOn, avatarConfig). Throttled por Supabase (45s) — no usar para
posición authoritative; usar `movement` DataPacket para coords frescas.
**Consumidores:** `usePresenceChannels`, `useProximity.usuariosEnChunks`.

### `chat`
**Reliable.** Mensaje de chat 1:1 (proximity) o de canal.
**Payload:** `{ message: string; from: string; fromName: string }`.
**Consumidores:** `useBroadcast.localMessage`, render bubble + sonido.

### `reaction`
**Reliable.** Emoji float-up encima del avatar.
**Payload:** `{ emoji: string; from: string }`.

### `wave`
**Reliable.** Saludo dirigido a otro participante (pinged sound + toast).
**Payload:** `{ to: string; from: string; fromName: string }`.

### `nudge`
**Reliable.** Toque hombro / atención dirigida.
**Payload:** `{ to: string; from: string; fromName: string }`.

### `invite`
**Reliable.** Invitación a tele-portarse al `(x, y)` del invitante.
**Payload:** `{ to: string; from: string; fromName: string; x: number; y: number }`.

### `lock_conversation`
**Reliable.** Bloquea proximidad del cluster que comparten los participantes.
**Payload:** `{ locked: boolean; by: string; participants: string[] }`.
**Notas:** la auto-clear del lock fuera de proximidad NO emite packet
(comportamiento local-only). Ver `useBroadcast.ts:412-427`.

### `raise_hand`
**Reliable.** Toggle mano levantada del emisor.
**Payload:** `{ raised: boolean; from: string }`.

### `recording_status`
**Reliable.** Indica que un participante inició/detuvo grabación local
(server-side recording es trigger separado, no este packet).
**Payload:** `{ recording: boolean; by: string; startedAt: number }`.

### `consent_request` / `consent_response`
**Reliable.** Handshake de consentimiento antes de grabar.

### `speaker_hint`
**Pista no-reliable.** Hint UI de quién habla. NO usar para gating de audio
(usar `Room.activeSpeakers` del SDK como source of truth).

### `pin_participant`
**Reliable.** Pin/unpin local de video (no se propaga; cada cliente decide).

### `moderation_notice`
**Reliable.** Notificación de moderación (kick, mute forzado, etc.).

---

## Eventos del SFU (LiveKit), NO custom DataPackets

Los siguientes NO son DataPackets nuestros, sino eventos del cliente LiveKit
que el adapter expone tal cual. La app 2D obtendrá lo equivalente del adapter
de su transport.

| Evento LiveKit | Equivalente en app 2D | Notas |
|---|---|---|
| `RoomEvent.TrackPublished` | misma noción de "track sid + kind" | Wrapper: `audio:track:published` opcional si necesitamos canonizar |
| `RoomEvent.TrackSubscribed` | idem | |
| `RoomEvent.ActiveSpeakersChanged` | reemplaza `speaker_hint` | Usar el del SDK |
| `RoomEvent.ParticipantConnected` | complementa `presence:join` | `presence:join` viene de Supabase chunk channel (geo), `ParticipantConnected` viene del SFU (Room-wide) |
| `RoomEvent.DataReceived` | dispatch a `manejarEventoInstantaneo` | El bus interno parsea el `DataPacketContract` |

---

## Eventos R3F-specific (NO migrar a core)

Estos viven en `apps/cowork-3d` y deben quedar fuera de
`packages/application` durante el split:

- `mesh:raycast:hit` — pick del avatar local sobre 3D mesh.
- `pointer:over` / `pointer:out` — eventos R3F sobre objetos 3D.
- `frustum:cull` — métricas del FrustumCuller del renderer.
- `gpu:metrics:frame` — Frame stats del WebGPU/WebGL.
- `paint:floor:click` — eventos del editor decorar piso.

---

## Adaptadores y dirección de dependencias

```
Domain (puros, sin SDK)
    └─ Pose, VideoTrackHandle, ProximityClusterer
       ↑
Application use cases (puros, dependen de ports)
    └─ ToggleAudioAislado, PublicarLocalTrack, GestionarBackgroundVideo
       ↑
Infrastructure adapters (concretos, importan SDK)
    ├─ LiveKit: SpaceRealtimeCoordinator, LiveKitOfficialBackgroundAdapter
    ├─ Supabase: PresenceChannels, repos
    └─ Sentry: observability
       ↑
Apps (consumidores)
    ├─ cowork-3d: R3F components + hooks (importan core via @cowork/*)
    └─ cowork-2d: Phaser scenes + EventBus (idem)
```

---

## Cómo agregar un evento nuevo

1. ¿Es semánticamente común a 2D y 3D?
   - **Sí** → agrega tipo en `src/modules/realtime-room/domain/types.ts` (futuro `packages/application/types`). Documenta acá en este file.
   - **No** → vive en la app específica, fuera del core.
2. Define `Payload` interface explícita (no `any`, no `unknown` sin guard).
3. Si es lifecycle-critical (estado durable) → `reliable: true`. Si es high-frequency hint → `reliable: false`.
4. Update test de contract: `tests/unit/realtime-room/dataPacketsContract.test.ts`.
