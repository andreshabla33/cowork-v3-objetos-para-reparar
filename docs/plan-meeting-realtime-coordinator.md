# Plan — `MeetingRealtimeCoordinator` (deuda técnica bugfix blur)

**Estado:** pendiente. Ejecutar **solo después** de validar en browser los logs del commit `1b80d3f` (fix de blur publicando `LocalVideoTrack` wrapper).

**Branch objetivo:** `fix-500-avatars-2026-04-07` (o una nueva `refactor/meeting-coordinator` si se prefiere aislar).

**Origen:** deuda anotada en el commit `1b80d3f` tras el fix del blur. Hoy `useMeetingMediaBridge.ts` (Presentation) salta a `room.localParticipant.publishTrack/replaceTrack/mute/unmute` — viola la regla de capas Clean Architecture.

---

## 1. Investigación previa (completada)

### Skill: `livekit-transport-master` — best practices LiveKit v2 (abril 2026)

Docs oficiales consultadas:
- https://docs.livekit.io/reference/client-sdk-js/classes/LocalParticipant.html
- https://docs.livekit.io/reference/client-sdk-js/classes/Room.html
- https://docs.livekit.io/reference/client-sdk-js/classes/LocalTrackPublication.html
- https://docs.livekit.io/reference/client-sdk-js/classes/LocalTrack.html
- https://docs.livekit.io/home/client/connect/
- https://github.com/livekit/client-sdk-js/blob/main/README.md

Hallazgos clave:
- **Toggles de cámara/mic**: usar `setCameraEnabled/setMicrophoneEnabled` (publican primera vez, mutean/desmutean después). `publishTrack()` solo para `MediaStreamTrack` custom (p. ej. audio post-procesado).
- **Hot-swap de device**: `Room.switchActiveDevice(kind, deviceId, exact?)` es canónico. `LocalTrack.replaceTrack()` es primitiva de bajo nivel para inyectar tracks ya procesados.
- **Mute/unmute**: `LocalTrackPublication.mute()/.unmute()` (documentado en v2.18). Evitar `setMuted(bool)` del README (no está en reference).
- **Reconexión**: SDK re-publica automáticamente en `RoomEvent.Reconnected`. **NO** re-publicar manualmente — duplica tracks.
- **Arquitectura**: LiveKit no publica un "coordinator" oficial; `@livekit/components-js` usa observables RxJS. Nuestro patrón `SpaceRealtimeCoordinator` es válido a nivel proyecto.
- **Deprecados a evitar**: `LocalParticipant.registerRpcMethod/unregisterRpcMethod` → `room.registerRpcMethod`. `LocalParticipant.sendChatMessage/editChatMessage` → `room.localParticipant.sendText`.

### Skill: `clean-architecture-refactor` — diseño de capas

Ubicación elegida: **`src/modules/realtime-room/application/MeetingRealtimeCoordinator.ts`** (módulo compartido con `SpaceRealtimeCoordinator`, no fragmentar).

`IMeetingRealtimeService` existente NO se reusa — ese port es Supabase Realtime para metadata de reuniones, dominio distinto del transport LiveKit.

---

## 2. API del coordinator nuevo

### Métodos públicos (7)

```typescript
class MeetingRealtimeCoordinator extends BaseRealtimeCoordinator {
  connect(): Promise<boolean>;                                                              // heredado
  disconnect(): Promise<void>;                                                              // heredado, stopOnUnpublish=true
  setCameraEnabled(enabled: boolean, opts?: VideoCaptureOptions): Promise<LocalTrackPublication | undefined>;
  setMicrophoneEnabled(enabled: boolean, opts?: AudioCaptureOptions): Promise<LocalTrackPublication | undefined>;
  setScreenShareEnabled(enabled: boolean, opts?: ScreenShareCaptureOptions): Promise<LocalTrackPublication | undefined>;
  switchActiveDevice(kind: MediaDeviceKind, deviceId: string, exact?: boolean): Promise<boolean>;
  replaceTrackBySource(source: 'camera' | 'microphone', raw: MediaStreamTrack): Promise<boolean>;  // audio procesado
}
```

### Eventos hacia Presentation (4)

- `onConnectionStateChange(state)` — consume `RoomEvent.ConnectionStateChanged`, unifica `Connected/Reconnecting/Reconnected/Disconnected`.
- `onLocalPublicationsChange(pubs)` — agrega `LocalTrackPublished/Unpublished/TrackMuted/TrackUnmuted` locales.
- `onRemoteTrackChange({ track, publication, participant, kind: 'subscribed' | 'unsubscribed' })`.
- `onParticipantsChange(participants, activeSpeakers)` — con **coalescing** (el evento `ActiveSpeakersChanged` es alta-frecuencia; no disparar re-render estructural, canal dedicado).

---

## 3. Plan en 4 fases (orden hojas → raíz, regresión controlada)

### Fase 1 — Puerto + base abstracta

Sin romper nada existente.

- Crear `src/core/domain/ports/IRealtimeRoomTransport.ts` (contrato común: connect/disconnect/eventos base).
- Crear `src/modules/realtime-room/application/BaseRealtimeCoordinator.ts` (abstracto) — extraer de `SpaceRealtimeCoordinator.ts:101-190` y `440-480`:
  - `connect()`, `disconnect()`
  - Event bus wiring (`RealtimeEventBus`, `RealtimeDataPublisher`)
  - TURN refresh (`iceServerProvider`)
  - `_reconnectingTimer` y handler de `Reconnecting/Reconnected/Disconnected`
  - `notifyStateChange()`
- `SpaceRealtimeCoordinator extends BaseRealtimeCoordinator` — **regresión cero**; ejecutar `tsc --noEmit` y tests de espacios.

### Fase 2 — MeetingRealtimeCoordinator

- Crear `src/modules/realtime-room/application/MeetingRealtimeCoordinator.ts extends BaseRealtimeCoordinator`.
- Implementar los 7 métodos + 4 eventos.
- Reexportar desde `src/modules/realtime-room/index.ts`.
- Tests unitarios con mock de `Room` (sin conectar a LiveKit).

### Fase 3 — Migrar Presentation

- `components/meetings/videocall/hooks/useMeetingMediaBridge.ts`:
  - Eliminar `syncPublishedTracks` (L479-564, ~85 líneas) → delegar al coordinator.
  - Suscribir los 4 eventos vía Bus.
  - Quitar fallbacks `typeof localTrack.mute === 'function'` (tipado por contract del coordinator).
  - Quitar import directo de `room.localParticipant.*`.

### Fase 4 — Cleanup

- Quitar `previewVideoTrack` ref duplicado (L626-647) — el coordinator lo resuelve vía `LocalVideoTrackFactory` (ya existe).
- Considerar internalizar `TrackPublicationCoordinator` (helper syncPlan) dentro del coordinator, dejando de ser utility pública.
- Migrar `ProcessedAudioTrackHandle` de `lib/audioProcessing` a `src/modules/realtime-room/infrastructure/adapters/` e inyectarlo por port al coordinator.

---

## 4. Smells actuales que resuelve

- **God-hook**: `useMeetingMediaBridge.ts` 753 líneas con syncPlan + mute/unmute + replaceTrack + processed audio.
- **L524-526**: `localTrack.replaceTrack(item.track)` — LiveKit acoplado a Presentation.
- **L535-545**: `typeof localTrack.mute === 'function'` — tipado laxo por saltarse API tipada.
- **L626-647**: `previewVideoTrack` duplicado con `useLocalCameraTrack` (VirtualSpace3D también lo hace).

## 5. Deuda adicional descubierta durante el diseño

- Migrar `ProcessedAudioTrackHandle` de `lib/audioProcessing` a `src/modules/realtime-room/infrastructure/adapters/`.
- `TrackPublicationCoordinator` (L3) es helper de syncPlan con scope interno — quitar del barrel público.
- `useLocalCameraTrack` (VirtualSpace3D) y `previewVideoTrack` (meetings) — consolidar en un solo hook compartido.

---

## 6. Estimación

- **Neto** ~400 líneas removidas de Presentation.
- **Base compartida** ahorra ~200 líneas en el coordinator nuevo.
- Riesgo regresión: medio (hay que migrar handlers de Room suscribiéndose en sitios nuevos). Mitigar con tests con mock de Room.

---

## 7. Prerrequisito para arrancar este plan

1. Validar en browser que el fix del commit `1b80d3f` funcionó (activar cámara + blur sin ciclar).
2. Confirmar que no aparece `Failed to construct 'MediaStreamTrackProcessor': Input track cannot be ended` en consola.
3. Probar en VirtualSpace3D **y** en meetings (1:1, grupal).
4. Solo entonces arrancar Fase 1.
