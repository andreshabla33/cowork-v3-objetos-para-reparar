---
name: livekit-transport-master
description: Consulta y aplica la documentación oficial de LiveKit Transport para optimizar la capa de red, sincronización de datos y streaming en tiempo real en Cowork V3.7 (DataPackets, Room events, blur/virtual-background pipeline).
---

# LiveKit Transport Master

Experto en la capa de transporte LiveKit del proyecto. Úsalo al tocar red, sincronización o streaming en tiempo real.

## Cuándo activarse

- Implementación o refactorización de la capa de transporte LiveKit
- Optimización de latencia en audio/video/datos
- Sincronización de estado en tiempo real entre participantes
- Problemas de ancho de banda o calidad de tracks
- Bugs en el pipeline de blur / virtual background

## Áreas del proyecto

- `hooks/space3d/useLiveKit.ts` — conexión a Room y suscripciones
- `hooks/space3d/useBroadcast.ts` — envío de DataPackets con estado del avatar
- `components/meetings/videocall/hooks/useMeetingMediaBridge.ts` — bridge de media para meetings
- `components/meetings/videocall/hooks/useMeetingRealtimeState.ts` — sync de estado tiempo real
- Pipeline de blur / virtual background procesado por GPU

## Referencias oficiales

- Client SDK: https://docs.livekit.io/client-sdk-js/
- Data messages: https://docs.livekit.io/home/client/data/
- Track publishing: https://docs.livekit.io/home/client/tracks/publish/
- Simulcast & adaptive: https://docs.livekit.io/home/client/tracks/subscribe/

## Patrones correctos

1. **DataPackets**: usa `publishData(payload, { reliable: false, topic })` para estado de avatar (posición, rotación). Reliable solo para eventos de control.
2. **Room events**: suscribe con `room.on(RoomEvent.X, handler)` y **siempre** limpia con `room.off` en cleanup.
3. **Track publishing**: respeta `simulcast: true` en webcams para que el SFU adapte calidad.
4. **Reconexión**: reacciona a `RoomEvent.Reconnecting` / `Reconnected`, no asumas conexión estable.
5. **Blur / background**: el pipeline debe usar `MediaStreamTrackProcessor` cuando esté disponible, con fallback a canvas.

## Anti-patrones a marcar

- `publishData` en loop de render (enviar a >30Hz es desperdicio).
- Suscribirse a eventos en cada render sin cleanup.
- Publicar tracks sin `simulcast` en desktop.
- Procesar video en el main thread cuando hay `OffscreenCanvas` disponible.
