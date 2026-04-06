# Auditoría técnica LiveKit / WebRTC

## Fecha
2026-03-26

## Alcance

Análisis y corrección de incidencias observadas en reuniones con LiveKit:

- cámara de laptop tarda en encender o reporta que no encuentra el dispositivo
- micrófono en PC se activa en UI pero LiveKit lo refleja como desactivado
- al cerrar la pestaña/ventana el flujo puede quedar pesado o congelado

## Fuentes contrastadas

### Arquitectura del proyecto

- `public.documentacion` referenciada en documentación viva del proyecto
- módulo `src/modules/realtime-room/*`
- flujo de reunión en `components/meetings/videocall/*`

### Referencias externas

- documentación oficial LiveKit sobre conexión, publicación de tracks, gestión de dispositivos y errores de media

## Hallazgos principales

### 1. Desalineación entre estado local y publicación LiveKit

En `useMeetingMediaBridge` el plan de sincronización podía dejar un track local habilitado pero una publicación LiveKit todavía en `muted`.

Esto ocurría cuando el track seguía siendo el mismo (`noop` en el plan), por lo que no se ejecutaba `unmute()` aunque el usuario hubiera vuelto a activar micrófono o cámara.

Impacto:

- micrófono activado localmente pero marcado como desactivado en la sala
- cámara que parece tardar en volver porque la publicación remota seguía muda hasta otro recambio de track

### 2. Captura de dispositivos frágil frente a Windows / hardware ocupado

`DeviceManager.getDeviceStream()` intentaba `getUserMedia()` una sola vez por dispositivo.

Cuando Windows todavía no había liberado la cámara tras un preflight o un reinicio rápido, aparecían fallos temporales tipo `NotReadableError` / `TrackStartError`.

Impacto:

- falsa impresión de “no encuentra cámara”
- arranque tardío de la cámara integrada de laptop

### 3. Cambio de dispositivo sin cambiar referencia de stream

En `SpaceMediaCoordinator.switchCamera()` y `switchMicrophone()` el hot-swap mutaba el `MediaStream` existente.

Eso podía impedir que hooks dependientes detectaran correctamente el cambio de track y sincronizaran la publicación/remplazo en LiveKit.

### 4. Cleanup insuficiente en salida abrupta de pestaña

El flujo normal limpiaba recursos al desmontar, pero no había una ruta ligera explícita para `pagehide` / `beforeunload` en el bridge de media de reuniones.

Impacto:

- mayor probabilidad de dejar pipeline de cámara/background en transición durante el cierre de pestaña

## Correcciones aplicadas

### `src/modules/realtime-room/infrastructure/browser/DeviceManager.ts`

- se agregaron reintentos para errores temporales de media (`AbortError`, `NotReadableError`, `TrackStartError`)
- se agregó fallback con constraints de video más relajados (`640x480`, FPS menor) para hardware problemático
- se conservó fallback a dispositivo por defecto cuando falla el deviceId seleccionado

### `src/modules/realtime-room/application/SpaceMediaCoordinator.ts`

- al cambiar cámara o micrófono se recrea el `MediaStream` para forzar nueva referencia observable
- esto asegura que las capas React/LiveKit sincronicen reemplazo de track correctamente

### `components/meetings/videocall/hooks/useMeetingMediaBridge.ts`

- se alinea explícitamente el estado `mute/unmute` de la publicación LiveKit con `targetTrackEnabled`, incluso en acciones `noop`
- se añade cleanup ligero en `pagehide` y `beforeunload` para detener captura local y stream procesado antes de la salida

## Validación ejecutada

### Compilación

- `npm ci`
- `npm run typecheck` ✅
- `npm run build` ✅

### Pruebas

- intento de ejecutar `tests/funcional/realtime-media-policies.funcional.spec.ts`
- resultado: bloqueado por `tests/global.setup.ts`, que no pudo encontrar el formulario de login en este entorno

Esto significa que:

- la validación estática y de build sí quedó confirmada
- la validación automatizada end-to-end de reuniones sigue dependiendo de preparar correctamente el entorno QA/auth

## Estado de arquitectura

La corrección respeta clean architecture actual:

- infraestructura de captura endurecida en `DeviceManager`
- coordinación de estado en `SpaceMediaCoordinator`
- adaptación de reunión en `useMeetingMediaBridge`

No se agregaron dependencias nuevas ni caminos legacy paralelos.

## Gap de documentación en Supabase

No fue posible escribir esta auditoría directamente en `public.documentacion` desde este entorno porque el workspace no expone una credencial operativa para Supabase ni existe un helper de escritura ya configurado para esa tabla.

Contenido recomendado para registrar:

- clave sugerida: `auditoria_livekit_stream_2026_03_26`
- título: `Auditoría LiveKit / WebRTC - stream y dispositivos`
- categoría: `arquitectura`
- tags: `livekit`, `webrtc`, `meetings`, `media`, `audit`

## Siguiente validación recomendada

Prueba manual en dos equipos:

1. laptop: entrar con cámara integrada seleccionada y alternar cámara on/off tres veces seguidas
2. pc: alternar micrófono on/off tres veces y verificar que el icono remoto cambie en tiempo real
3. cerrar pestaña con cámara y fondo virtual activos
4. repetir cambio de dispositivo desde selector de cámara/micrófono dentro de la reunión