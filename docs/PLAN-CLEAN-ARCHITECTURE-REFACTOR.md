# Plan de Implementación — Clean Architecture Refactor

**Proyecto:** Cowork Virtual Workspace 3D v3.7
**Fecha:** 2026-03-30
**Autor:** Claude (Ingeniero de Software Senior)
**Estado:** Aprobación pendiente

---

## 1. Diagnóstico Actual

### 1.1 Métricas de Violación

| Categoría | Archivos afectados | Severidad |
|---|---|---|
| Components/Hooks con `import { supabase }` directo | **39 archivos** | CRÍTICA |
| Store orchestrators acoplados a Supabase | **7 archivos** | CRÍTICA |
| Lógica de dominio en capa de presentación | **6 archivos runtime** | CRÍTICA |
| Componentes monolíticos (>500 líneas) | **2 archivos** (2,996 líneas total) | CRÍTICA |
| Ports definidos pero sin implementación conectada | **ITextureFactory** | ALTA |
| Three.js importado en domain ports | **ITextureFactory.ts** línea 14 | ALTA |
| lib/ sin separación por capas | **44 archivos** mezclados | MEDIA |

### 1.2 Archivos Más Críticos

```
components/space3d/Scene3D.tsx         → 1,036 líneas (5+ responsabilidades)
hooks/space3d/useLiveKit.ts            → 934 líneas (6+ responsabilidades)
lib/rendering/textureRegistry.ts       → 625 líneas (no implementa ITextureFactory)
lib/rendering/fabricaMaterialesArq...  → 401 líneas (acoplado a THREE.js)
```

### 1.3 Estructura Actual vs. Deseada

```
ACTUAL (Mixta):                         DESEADA (Clean Architecture):
├── components/space3d/                 ├── src/core/
│   ├── Scene3D.tsx (1036 líneas)      │   ├── domain/
│   ├── asientosRuntime.ts  ⚠️DOMINIO  │   │   ├── entities/
│   ├── colisionesRuntime.ts ⚠️DOMINIO │   │   │   ├── AsientoEntity.ts
│   ├── movimientoRuntime.ts ⚠️DOMINIO │   │   │   ├── ColisionEntity.ts
│   └── objetosRuntime.ts   ⚠️DOMINIO  │   │   │   └── MovimientoEntity.ts
├── hooks/space3d/                      │   │   └── ports/
│   ├── useLiveKit.ts (934 líneas)     │   │       ├── IRenderingService.ts
│   └── 38 hooks mezclados             │   │       └── ITextureFactory.ts (SIN three.js)
├── lib/                                │   ├── application/usecases/
│   ├── rendering/ (infra en lib)      │   │   ├── CalcularAsientosUseCase.ts
│   ├── supabase.ts                    │   │   ├── DetectarColisionesUseCase.ts
│   └── 44 archivos mixtos             │   │   └── GestionarMediaUseCase.ts
├── store/orchestrators/                │   └── infrastructure/adapters/
│   └── authStore.ts → supabase ⚠️     │       ├── ThreeTextureFactory.ts
└── src/core/ (parcialmente migrado)    │       ├── LiveKitAdapter.ts
                                        │       └── SupabaseAuthAdapter.ts
                                        ├── components/space3d/ (SOLO presentación)
                                        │   └── Scene3D.tsx (~200 líneas, composición)
                                        └── store/orchestrators/ (delega a UseCases)
```

---

## 2. Principios de Diseño

1. **Dependency Rule**: Las dependencias SOLO apuntan hacia adentro (Presentation → Application → Domain). Nunca al revés.
2. **Ports & Adapters**: Domain define interfaces (ports). Infrastructure las implementa (adapters).
3. **Cero `import { supabase }`** en components/, hooks/ o store/. Solo en `infrastructure/adapters/`.
4. **Cero `import * as THREE`** en domain/ports/. Se usan tipos abstractos propios.
5. **Cero archivos > 400 líneas**. Todo se descompone en unidades de responsabilidad única.

---

## 3. Fases de Implementación

### FASE 1 — Domain Layer: Extraer Lógica de Negocio (Prioridad: 🔴 Crítica)

**Objetivo:** Mover la lógica de negocio de `components/space3d/*Runtime.ts` al dominio.

#### 1.1 Crear Entidades de Dominio

| Archivo origen (presentación) | Entidad destino (dominio) | Líneas |
|---|---|---|
| `asientosRuntime.ts` | `src/core/domain/entities/AsientoEntity.ts` | ~180 |
| `colisionesRuntime.ts` | `src/core/domain/entities/ColisionEntity.ts` | ~120 |
| `movimientoRuntime.ts` | `src/core/domain/entities/MovimientoEntity.ts` | ~100 |
| `objetosRuntime.ts` | `src/core/domain/entities/ObjetoRuntimeEntity.ts` | ~150 |
| `interaccionesObjetosRuntime.ts` | `src/core/domain/entities/InteraccionObjetoEntity.ts` | ~80 |

**Reglas de extracción:**
- Las interfaces (`PerfilAsiento3D`, `ObstaculoColision3D`, `AsientoRuntime3D`) → domain/entities/
- Las funciones puras (cálculos de posición, detección de colisión) → domain/entities/
- Las constantes de negocio (`PERFILES_ASIENTO`, `RADIO_COLISION_AVATAR`) → domain/entities/
- Los imports de `../avatar3d/shared` se reemplazan por tipos propios del dominio

**Ejemplo de transformación:**
```typescript
// ANTES: components/space3d/asientosRuntime.ts
import type { AnimationState } from '../avatar3d/shared';  // ❌ presenta → presenta
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';  // ❌ dominio → hook

// DESPUÉS: src/core/domain/entities/AsientoEntity.ts
import type { EstadoAnimacion } from './types';  // ✅ dominio → dominio
import type { ObjetoEspacio } from './ObjetoEspacioEntity';  // ✅ dominio → dominio

export interface PerfilAsiento3D { ... }  // Misma interface, ubicación correcta
export function calcularPosicionAsiento(...) { ... }  // Misma lógica, capa correcta
```

#### 1.2 Limpiar ITextureFactory — Eliminar dependencia de THREE.js

```typescript
// ANTES: src/core/domain/ports/ITextureFactory.ts
import type * as THREE from 'three';  // ❌ Domain depende de infraestructura

export interface PBRMaterialProps {
  map: THREE.Texture;       // ❌ Tipo de infraestructura
  emissive: THREE.Color;    // ❌ Tipo de infraestructura
}

// DESPUÉS: src/core/domain/ports/ITextureFactory.ts
// CERO imports de three.js

export interface TexturaAbstracta {
  id: string;
  width: number;
  height: number;
}

export interface ColorAbstracto {
  r: number; g: number; b: number;
}

export interface PBRMaterialProps {
  map: TexturaAbstracta;        // ✅ Tipo propio del dominio
  emissive: ColorAbstracto;     // ✅ Tipo propio del dominio
  roughness: number;
  metalness: number;
  transparent: boolean;
  opacity: number;
}
```

#### 1.3 Crear Nuevos Ports

| Port | Responsabilidad |
|---|---|
| `IRenderingService.ts` | Contrato para renderizado de escena (draw calls, instancing) |
| `IMovimientoService.ts` | Contrato para cálculo de movimiento de avatares |
| `IColisionService.ts` | Contrato para detección de colisiones |
| `IMediaTransportService.ts` | Contrato para LiveKit (conexión, tracks, suscripción) |

**Estimación Fase 1:** 8–12 horas

---

### FASE 2 — Application Layer: Casos de Uso (Prioridad: 🔴 Crítica)

**Objetivo:** Crear use cases que orquesten la lógica extraída, eliminando la orquestación directa en hooks.

#### 2.1 Nuevos Use Cases

| Use Case | Reemplaza lógica en | Responsabilidad |
|---|---|---|
| `CalcularAsientosDisponiblesUseCase` | `asientosRuntime.ts` + `Scene3D.tsx` | Calcula posiciones de asientos usando entidades |
| `DetectarColisionesUseCase` | `colisionesRuntime.ts` | Evalúa obstáculos físicos para objetos |
| `GestionarConexionRealtimeUseCase` | `useLiveKit.ts` (líneas 1–300) | Conectar/desconectar sala LiveKit via port |
| `GestionarTracksMediaUseCase` | `useLiveKit.ts` (líneas 300–600) | Publicar/despublicar tracks via port |
| `SuscripcionProximidadUseCase` | `useLiveKit.ts` (líneas 600–934) | Suscripción selectiva por distancia |
| `GestionarMaterialesSueloUseCase` | `textureRegistry.ts` + `fabricaMateriales...` | Obtener materiales via ITextureFactory |

#### 2.2 Patrón de Use Case

```typescript
// src/core/application/usecases/GestionarConexionRealtimeUseCase.ts
import type { IMediaTransportService } from '../domain/ports/IMediaTransportService';

export class GestionarConexionRealtimeUseCase {
  constructor(private readonly transport: IMediaTransportService) {}

  async conectar(espacioId: string, token: string): Promise<void> {
    await this.transport.conectar(espacioId, token);
  }

  async desconectar(): Promise<void> {
    await this.transport.desconectar();
  }
}
```

**Estimación Fase 2:** 6–8 horas

---

### FASE 3 — Infrastructure Layer: Adapters Concretos (Prioridad: 🟠 Alta)

**Objetivo:** Crear adaptadores que implementen los ports y mover todo el código acoplado a THREE.js, LiveKit y Supabase aquí.

#### 3.1 Nuevos Adapters

| Adapter | Implementa Port | Origen del código |
|---|---|---|
| `ThreeTextureFactoryAdapter.ts` | `ITextureFactory` | `lib/rendering/textureRegistry.ts` (625 líneas) |
| `ThreeMaterialFactoryAdapter.ts` | `ITextureFactory` (parcial) | `lib/rendering/fabricaMateriales...` (401 líneas) |
| `LiveKitTransportAdapter.ts` | `IMediaTransportService` | `useLiveKit.ts` + `lib/livekitService.ts` |
| `RapierColisionAdapter.ts` | `IColisionService` | `colisionesRuntime.ts` |

#### 3.2 Migrar Store Orchestrators

**Antes:**
```typescript
// store/orchestrators/authStore.ts
import { supabase } from '../../lib/supabase';  // ❌ Directo

export const createSignOutAction = (set, options) => {
  return async () => {
    await supabase.auth.signOut();  // ❌ Infraestructura en store
    set({ session: null, ... });
  };
};
```

**Después:**
```typescript
// store/orchestrators/authStore.ts
import type { IAuthRepository } from '@/src/core/domain/ports/IAuthRepository';

export const createSignOutAction = (set, options, deps: { auth: IAuthRepository }) => {
  return async () => {
    await deps.auth.signOut();  // ✅ Via port
    set({ session: null, ... });
  };
};
```

**Archivos a migrar (7):**
1. `store/orchestrators/authStore.ts`
2. `store/orchestrators/initializeStore.ts`
3. `store/orchestrators/userStore.ts`
4. `store/orchestrators/workspaceStore.ts`
5. `store/orchestrators/bootstrap/authBootstrap.ts`
6. `store/orchestrators/bootstrap/avatarLoader.ts`
7. `store/orchestrators/bootstrap/statusLoader.ts`

**Estimación Fase 3:** 10–14 horas

---

### FASE 4 — Decomposición de Monolitos (Prioridad: 🟠 Alta)

**Objetivo:** Romper Scene3D.tsx (1,036 líneas) y useLiveKit.ts (934 líneas) en componentes de responsabilidad única.

#### 4.1 Scene3D.tsx → Composición de Sub-componentes

```
Scene3D.tsx (1,036 → ~200 líneas)
├── SceneEnvironment.tsx      (~80 líneas)  — Luces, skybox, clima
├── ScenePhysics.tsx          (~60 líneas)  — Rapier provider + colliders
├── SceneFloor.tsx            (~80 líneas)  — Zonas, suelos PBR via UseCase
├── SceneObjects.tsx          (~100 líneas) — Objetos persistentes + instancing
├── SceneAvatars.tsx          (~100 líneas) — Avatares locales + remotos
├── SceneInteractions.tsx     (~60 líneas)  — HUD, emotes, interacciones
└── SceneCameraController.tsx (~50 líneas)  — Cámara follow/orbit
```

#### 4.2 useLiveKit.ts → Hooks Especializados

```
useLiveKit.ts (934 → ~150 líneas, solo composición)
├── useRoomConnection.ts      (~120 líneas) — Conectar/desconectar via UseCase
├── useTrackPublication.ts    (~150 líneas) — Publicar audio/video/screen
├── useTrackSubscription.ts   (~120 líneas) — Suscripción por proximidad
├── useSpeakerDetection.ts    (~80 líneas)  — Detección de speaker activo
├── useMediaQuality.ts        (~60 líneas)  — Adaptive quality
└── useRoomEvents.ts          (~80 líneas)  — Event bus de sala
```

**Estimación Fase 4:** 12–16 horas

---

### FASE 5 — Optimización 3D (Prioridad: 🟠 Alta)

**Objetivo:** Reducir draw calls de 652 a <150, geometries fluctuantes de 312↔567 a estable <100.

#### 5.1 Instancing para Objetos Repetidos

**Problema:** Cada silla, mesa, decoración es un draw call individual.

**Solución según docs R3F (Drei `<Instances>`):**
```typescript
// components/3d/ObjetosInstanciadosMejorado.tsx
import { Instances, Instance } from '@react-three/drei';

export function MobiliarioInstanciado({ objetos }: { objetos: ObjetoEspacio[] }) {
  const grupos = agruparPorModelo(objetos); // Use case del dominio
  return (
    <>
      {Object.entries(grupos).map(([modelo, items]) => (
        <Instances key={modelo} geometry={geometrias[modelo]} material={materiales[modelo]}>
          {items.map(obj => (
            <Instance key={obj.id} position={obj.posicion} rotation={obj.rotacion} />
          ))}
        </Instances>
      ))}
    </>
  );
}
```

**Impacto estimado:** 50 sillas × 1 draw call → 1 draw call. Reducción ~98% en mobiliario.

#### 5.2 Geometry Cache con useMemo

**Problema:** Geometries fluctúan 312↔567 (creación/disposición en runtime).

**Solución según docs Three.js:**
```typescript
// Compartir geometrías via useMemo global
const geometriaCache = new Map<string, THREE.BufferGeometry>();

export function obtenerGeometria(tipo: string): THREE.BufferGeometry {
  if (!geometriaCache.has(tipo)) {
    geometriaCache.set(tipo, crearGeometria(tipo));
  }
  return geometriaCache.get(tipo)!;
}
```

#### 5.3 Material Consolidation

**Problema:** 28–32 shader programs (cada material único = 1 compilación).

**Solución:** Atlas de texturas + material compartido con variaciones via uniforms.

**Estimación Fase 5:** 8–12 horas

---

### FASE 6 — Fixes Menores (Prioridad: 🟡 Media)

| Fix | Archivo | Esfuerzo |
|---|---|---|
| Sentry DSN → agregar `VITE_SENTRY_DSN` al `.env` | `.env` | 5 min |
| i18next deprecated params → `await i18next.init({...})` | `lib/i18n.ts` (o equivalente) | 15 min |
| Verificar Realtime double-mount en build producción | `hooks/chat/` | 30 min |

**Estimación Fase 6:** 1 hora

---

## 4. Dependency Injection Container

Para conectar ports con adapters sin acoplar las capas:

```typescript
// src/core/infrastructure/di/container.ts
import type { ITextureFactory } from '../domain/ports/ITextureFactory';
import type { IMediaTransportService } from '../domain/ports/IMediaTransportService';
import type { IAuthRepository } from '../domain/ports/IAuthRepository';
import { ThreeTextureFactoryAdapter } from '../infrastructure/adapters/ThreeTextureFactoryAdapter';
import { LiveKitTransportAdapter } from '../infrastructure/adapters/LiveKitTransportAdapter';
import { AuthSupabaseRepository } from '../infrastructure/adapters/AuthSupabaseRepository';

export interface DIContainer {
  textureFactory: ITextureFactory;
  mediaTransport: IMediaTransportService;
  auth: IAuthRepository;
  // ... otros ports
}

let instance: DIContainer | null = null;

export function getDIContainer(): DIContainer {
  if (!instance) {
    instance = {
      textureFactory: new ThreeTextureFactoryAdapter(),
      mediaTransport: new LiveKitTransportAdapter(),
      auth: new AuthSupabaseRepository(),
    };
  }
  return instance;
}
```

**Uso en React via Context:**
```typescript
// src/core/infrastructure/di/DIProvider.tsx
const DIContext = React.createContext<DIContainer | null>(null);

export function DIProvider({ children }: { children: React.ReactNode }) {
  const container = useMemo(() => getDIContainer(), []);
  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
}

export function useDI(): DIContainer {
  const ctx = useContext(DIContext);
  if (!ctx) throw new Error('DIProvider no encontrado');
  return ctx;
}
```

---

## 5. Orden de Ejecución y Dependencias

```
FASE 1 (Domain Entities)
    │
    ├──→ FASE 2 (Use Cases)  ──→  FASE 3 (Adapters)
    │                                    │
    │                                    ├──→ FASE 4 (Decomposición)
    │                                    │
    │                                    └──→ FASE 5 (Optimización 3D)
    │
    └──→ FASE 6 (Fixes menores) — puede ejecutarse en paralelo
```

**Orden recomendado:** 1 → 2 → 3 → 4 ∥ 5 → 6 (paralelo)

---

## 6. Resumen de Estimaciones

| Fase | Descripción | Horas estimadas |
|---|---|---|
| 1 | Domain Layer: entidades + ports limpios | 8–12 |
| 2 | Application Layer: use cases | 6–8 |
| 3 | Infrastructure Layer: adapters + DI | 10–14 |
| 4 | Decomposición de monolitos | 12–16 |
| 5 | Optimización 3D (draw calls, instancing) | 8–12 |
| 6 | Fixes menores (Sentry, i18next, Realtime) | 1 |
| **Total** | | **45–63 horas** |

---

## 7. Criterios de Éxito

- [ ] **0 imports de `supabase`** en `components/`, `hooks/`, `store/`
- [ ] **0 imports de `three`** en `domain/ports/`
- [ ] **0 archivos > 400 líneas** en cualquier capa
- [ ] **Draw calls < 150** (actual: 652)
- [ ] **Geometries estable** sin fluctuación frame-a-frame
- [ ] **Sentry DSN** configurado y reportando errores
- [ ] **i18next** sin warnings de deprecación
- [ ] **100% ports** con adapter implementado y conectado via DI
- [ ] **Todos los tests existentes** siguen pasando (68+ unit tests)

---

## 8. Registro en Supabase

Cada fase completada debe registrarse en la tabla `documentacion` con:
- `clave`: `CLEAN-ARCH-F{N}-{descripcion}`
- `estado`: `activo`
- `tipo_cambio`: `refactor`
- `modulos_afectados`: lista de archivos movidos/creados

---

*Documento generado automáticamente. Requiere aprobación del lead antes de iniciar ejecución.*
