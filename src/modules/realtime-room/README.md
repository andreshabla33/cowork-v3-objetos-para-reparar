# Módulo Realtime Room - Clean Architecture

Este módulo implementa la arquitectura limpia para la gestión de medios, permisos y comunicación en tiempo real del cowork 3D.

## Estructura

```
src/modules/realtime-room/
├── domain/
│   └── types.ts                    # Entidades y tipos del dominio
├── application/
│   ├── SpaceMediaCoordinator.ts    # Coordinador de medios
│   ├── SpaceRealtimeCoordinator.ts # Coordinador de LiveKit/WebRTC
│   ├── PreflightSessionStore.ts    # Gestión de estado pre-flight
│   └── Gatekeeper.ts               # Validación de ingreso a sala
├── infrastructure/
│   └── browser/
│       ├── DeviceManager.ts        # Gestión de dispositivos
│       └── PermissionService.ts    # Gestión de permisos
└── index.ts                        # Barrel export
```

## Uso

### SpaceMediaCoordinator

```typescript
import { SpaceMediaCoordinator } from '@/modules/realtime-room';

const mediaCoordinator = new SpaceMediaCoordinator({
  onStreamChange: (stream) => {
    console.log('Stream changed:', stream);
  },
  onError: (error) => {
    console.error('Media error:', error);
  },
});

// Inicializar
await mediaCoordinator.initialize();

// Iniciar captura
await mediaCoordinator.startMedia(true, true); // video, audio

// Toggle cámara
await mediaCoordinator.toggleCamera(true);

// Cambiar dispositivo
await mediaCoordinator.switchCamera('device-id');
```

### SpaceRealtimeCoordinator

```typescript
import { SpaceRealtimeCoordinator } from '@/modules/realtime-room';

const realtimeCoordinator = new SpaceRealtimeCoordinator({
  serverUrl: 'wss://livekit.example.com',
  token: 'jwt-token',
  onConnectionChange: (connected) => {
    console.log('Connected:', connected);
  },
});

// Conectar
await realtimeCoordinator.connect();

// Publicar track
await realtimeCoordinator.publishTrack(mediaStreamTrack, 'camera');

// Enviar reacción
await realtimeCoordinator.sendReaction('👍');
```

### PreflightSessionStore

```typescript
import { PreflightSessionStore } from '@/modules/realtime-room';

const preflightStore = new PreflightSessionStore({
  onStateChange: (state) => {
    console.log('Preflight state:', state);
  },
});

// Actualizar permisos
preflightStore.updatePermission('camera', 'granted');

// Verificar readiness
if (preflightStore.isReady()) {
  // Permitir ingreso a sala
}
```

### Gatekeeper

```typescript
import { Gatekeeper } from '@/modules/realtime-room';

const gatekeeper = new Gatekeeper({
  requireAudio: true,
  requireVideo: false,
  onBlocked: (errors) => {
    console.log('Cannot join:', errors);
  },
  onAllowed: () => {
    console.log('Can join room');
  },
});

// Validar
const { canJoin, errors } = gatekeeper.validate(preflightState);
```

## Integración con useSpace3D

El hook `useSpace3DRefactored` integra todos los coordinadores manteniendo compatibilidad con la API existente:

```typescript
import { useSpace3DRefactored } from '@/hooks/space3d';

function VirtualSpace3D() {
  const {
    // Estado legacy (compatibilidad)
    media,
    livekit,
    
    // Nuevo estado
    preflightState,
    canJoinRealtimeRoom,
    
    // Nuevas acciones
    handleToggleCameraNew,
    handleToggleMicrophoneNew,
    handleSwitchDevice,
  } = useSpace3DRefactored({
    theme: 'dark',
  });
  
  // Usar como siempre...
}
```

## Migración Progresiva

La migración se hace en fases:

1. **Fase 1** (actual): Coordinadores creados, useSpace3DRefactored disponible
2. **Fase 2**: Migrar componentes individuales a nuevos coordinadores
3. **Fase 3**: Eliminar código legacy cuando todo esté migrado

Para usar el nuevo sistema gradualmente:

1. Importar `useSpace3DRefactored` en lugar de `useSpace3D`
2. Usar las nuevas acciones (`handleToggleCameraNew`, etc.)
3. Verificar `canJoinRealtimeRoom` antes de permitir ingreso a sala
4. Usar `preflightState` para mostrar estado de permisos/dispositivos

## Beneficios

- **Separación de responsabilidades**: Cada coordinador tiene una función clara
- **Testeabilidad**: Lógica de dominio separada de React
- **Reutilización**: Los coordinadores se pueden usar fuera de React
- **Mantenibilidad**: Cambios localizados, sin efectos colaterales
