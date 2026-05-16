# Roadmap — Monorepo Cowork V3.7 (3D + Phaser 4 2D)

**Fecha:** 2026-05-14
**Owner:** Andrés Maldonado
**Estado:** propuesto, sin ejecutar
**Objetivo:** extraer un core compartido del proyecto actual y montar una segunda app 2D con Phaser 4 que reutilice dominio, application, infrastructure (LiveKit/Supabase/auth/chat/presencia) y stores.

---

## Stack objetivo

| Capa | Tecnología | Razón |
|---|---|---|
| Package manager | pnpm 10.33 + workspaces | ya en uso, lockfile estable |
| Monorepo orchestrator | Turborepo (última estable) | caching de build/typecheck/test por package, Vercel-native |
| App 3D existente | Vite 6 + React 19 + R3F 9.6 + Three r183 | sin cambios |
| App 2D nueva | Vite 6 + React 19 + Phaser **4.x** | template oficial `template-react-ts` |
| Lenguaje | TypeScript 5.8 strict | sin downgrade |
| Realtime | LiveKit client 2.18 + components-react 2.9 | compartido |
| Backend | Supabase JS 2.47 | compartido |
| State | Zustand 5.0 | compartido |
| ECS | bitecs 0.4 | compartido, sistemas de render por app |

**Decisión clave:** Phaser **4** (GA 2026-04-10), no 3.x. El `phaser: 3.80.1` actual está pinned pero no se usa (0 imports en el repo). El template oficial ya está alineado con React 19 + Vite 6.

---

## Estructura final del monorepo

```
cowork/
├─ package.json                  # root, pnpm workspaces + turbo
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ packages/
│  ├─ domain/                    # 100 archivos, 0 deps externas
│  ├─ application/               # 81 archivos, deps: domain
│  ├─ infrastructure-livekit/    # transport + audio espacial calc
│  ├─ infrastructure-supabase/   # auth + repos chat/presencia/salas
│  ├─ infrastructure-sentry/     # observabilidad agnóstica
│  ├─ ecs-core/                  # bitecs world + componentes lógicos
│  ├─ stores/                    # 21 stores Zustand
│  └─ ui-react/                  # HUDs, modales, formularios (Tailwind + Lucide + i18next)
└─ apps/
   ├─ cowork-3d/                 # actual (Vite + R3F + Three + Rapier + Recast)
   └─ cowork-2d/                 # nuevo (Vite + Phaser 4 + EasyStar)
```

---

## FASE 0 — Deuda técnica obligatoria (pre-split)

**Duración:** 3-5 días | **Bloquea:** Fase 1
**Criterio de éxito:** `pnpm typecheck && pnpm test:unit && pnpm build` verde en main, sin cambio funcional visible.

Esta fase corre **sobre el repo actual**, antes de tocar la estructura. Si arrancás el monorepo con estas fugas dentro, contaminan el package compartido.

### 0.1 — Tapar fugas LiveKit en domain/application

Tres archivos importan tipos concretos de `livekit-client`. Eso obliga a que `@cowork/application` arrastre LiveKit como peer dep, lo cual no queremos en la app 2D si decide usar otro transport en el futuro.

- [ ] **0.1.a** Definir tipo opaco `VideoTrackHandle` en `src/core/domain/types/media.ts`:
  ```ts
  export interface VideoTrackHandle {
    readonly id: string;
    readonly kind: 'camera' | 'screen' | 'background';
  }
  ```
- [ ] **0.1.b** `src/core/domain/ports/IVideoTrackPublishResolver.ts` — reemplazar `LocalVideoTrack` por `VideoTrackHandle`.
- [ ] **0.1.c** `src/core/application/usecases/GestionarBackgroundVideoUseCase.ts` — adaptar firma.
- [ ] **0.1.d** `src/core/application/usecases/PublicarLocalTrackUseCase.ts` — adaptar firma.
- [ ] **0.1.e** En `src/core/infrastructure/livekit/`, adapter que mapea `VideoTrackHandle ↔ LocalVideoTrack`.
- [ ] **0.1.f** `pnpm test:unit` de los 4 archivos tocados.

### 0.2 — Tipo `Pose` discriminado en domain

Hoy el dominio asume implícitamente xyz 3D. Para que la app 2D pueda usar los mismos use cases (movimiento, proximidad audio, framing cámara) sin reescribir, introducimos:

- [ ] **0.2.a** `src/core/domain/types/pose.ts`:
  ```ts
  export type Pose =
    | { kind: '3d'; x: number; y: number; z: number; yaw: number }
    | { kind: '2d'; x: number; y: number; facing: number };
  ```
- [ ] **0.2.b** Funciones puras `distance(a: Pose, b: Pose)`, `toAudioGain(distance, falloff)` en domain — sin Three.js.
- [ ] **0.2.c** Migrar use cases que hoy reciben `THREE.Vector3` a recibir `Pose`. Adapter R3F convierte `Vector3 ↔ Pose3D` en infrastructure.
- [ ] **0.2.d** Suite unitaria de `Pose` (igualdad, distancia, conversión).

### 0.3 — Limpieza `phaser: 3.80.1` huérfano

- [ ] **0.3.a** `pnpm remove phaser` (0 imports, no rompe nada).
- [ ] **0.3.b** Commit aparte para que sea reversible.

### 0.4 — Documentar contratos del transport realtime

- [ ] **0.4.a** `docs/contracts/transport-realtime.md` — qué eventos emite/consume la app: `pose:update`, `presence:join`, `presence:leave`, `chat:message`, `audio:track:published`. Esto vive en `@cowork/application` y debe sobrevivir tanto a R3F como a Phaser.
- [ ] **0.4.b** Validar que los eventos actuales del proyecto encajan en este contrato. Si hay eventos R3F-specific (ej. `mesh:raycast:hit`), quedan en `apps/cowork-3d`, no en `application`.

---

## FASE 1 — Monorepo skeleton

**Duración:** 3-5 días | **Bloquea:** Fase 2
**Criterio de éxito:** `apps/cowork-3d` funciona idéntico al main actual, importando todo desde `packages/*`.

### 1.1 — Bootstrap Turborepo + pnpm workspaces

- [ ] **1.1.a** Crear `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- [ ] **1.1.b** Instalar Turborepo: `pnpm add -Dw turbo`.
- [ ] **1.1.c** `turbo.json` con tareas `build`, `typecheck`, `test:unit`, `lint`.
- [ ] **1.1.d** `tsconfig.base.json` en root con `strict`, `noUncheckedIndexedAccess`, `paths` para `@cowork/*`.
- [ ] **1.1.e** ESLint + Prettier en root, override per-package.

### 1.2 — Mover el código actual a `apps/cowork-3d/`

- [ ] **1.2.a** Crear `apps/cowork-3d/` y mover: `src/modules/`, `vite.config.ts`, `index.html`, `public/`, `tests/`.
- [ ] **1.2.b** `apps/cowork-3d/package.json` con deps R3F-specific (three, @react-three/*, rapier, recast, mediapipe).
- [ ] **1.2.c** `pnpm dev` en `apps/cowork-3d/` corre el proyecto actual. Smoke test manual.

### 1.3 — Extraer packages (en orden, de hojas a raíz)

**Orden importa**: domain primero (0 deps), application después (depende de domain), infra después (depende de application).

- [ ] **1.3.a** `packages/domain/` ← `src/core/domain/**`
  - `package.json`: name `@cowork/domain`, sin deps runtime.
  - exports map: barrel desde `index.ts`.
- [ ] **1.3.b** `packages/application/` ← `src/core/application/**`
  - dep: `@cowork/domain`.
- [ ] **1.3.c** `packages/infrastructure-livekit/` ← `src/core/infrastructure/livekit/**`
  - deps: `@cowork/domain`, `@cowork/application`, `livekit-client`, `@livekit/components-react`, `@livekit/track-processors`.
- [ ] **1.3.d** `packages/infrastructure-supabase/` ← `src/core/infrastructure/supabase/**`, `auth/**`
  - deps: `@cowork/domain`, `@cowork/application`, `@supabase/supabase-js`.
- [ ] **1.3.e** `packages/infrastructure-sentry/` ← `src/core/infrastructure/sentry/**`
- [ ] **1.3.f** `packages/ecs-core/` ← `src/core/infrastructure/r3f/ecs/espacioEcs.ts` (solo mundo + componentes, sin sistemas R3F).
  - dep: `bitecs`.
  - Los sistemas R3F (`AvatarSystems.ts`) **se quedan en apps/cowork-3d**.
- [ ] **1.3.g** `packages/stores/` ← stores Zustand agnósticos.
- [ ] **1.3.h** `packages/ui-react/` ← componentes React puros compartibles (modales, formularios, HUDs no-canvas). Excluye R3F.

### 1.4 — Re-wirear `apps/cowork-3d/`

- [ ] **1.4.a** Reemplazar imports `@/core/domain/*` por `@cowork/domain`.
- [ ] **1.4.b** Idem para application, infrastructure, ecs, stores, ui-react.
- [ ] **1.4.c** `pnpm typecheck` y `pnpm test:unit` verdes en ambos.
- [ ] **1.4.d** Smoke test E2E Playwright en `apps/cowork-3d/` — debe pasar idéntico a main.

### 1.5 — CI

- [ ] **1.5.a** Update GitHub Actions / Vercel build command a `pnpm -r typecheck && pnpm --filter cowork-3d build`.
- [ ] **1.5.b** Cache de Turborepo en CI (remote cache si querés).

---

## FASE 2 — Bootstrap `apps/cowork-2d`

**Duración:** 5-7 días | **Bloquea:** Fase 3
**Criterio de éxito:** pantalla con login Supabase, una scene Phaser vacía, LiveKit Room conectada, presencia de participantes registrada en stores compartidos (sin avatares todavía).

### 2.1 — Scaffold Phaser 4 + React + Vite

- [ ] **2.1.a** Clonar `https://github.com/phaserjs/template-react-ts` en `apps/cowork-2d/`.
- [ ] **2.1.b** Limpiar el ejemplo del template (logo, scenes default).
- [ ] **2.1.c** Validar versiones: phaser ^4.0.0, react ^19, vite ^6.3.
- [ ] **2.1.d** `apps/cowork-2d/tsconfig.json` extends `tsconfig.base.json`, con override `strictPropertyInitialization: false` (requisito Phaser documentado).
- [ ] **2.1.e** `pnpm dev` muestra canvas Phaser vacío + React shell.

### 2.2 — Wirear packages compartidos

- [ ] **2.2.a** Deps: `@cowork/domain`, `@cowork/application`, `@cowork/infrastructure-livekit`, `@cowork/infrastructure-supabase`, `@cowork/stores`, `@cowork/ecs-core`, `@cowork/ui-react`.
- [ ] **2.2.b** Login con `@cowork/infrastructure-supabase` (mismo flujo que 3d).
- [ ] **2.2.c** Connect a LiveKit Room usando `@cowork/infrastructure-livekit`.
- [ ] **2.2.d** Suscribir presencia → store compartido. Lista de participantes en HUD React (de `ui-react`).

### 2.3 — Bridge React ↔ Phaser

- [ ] **2.3.a** Implementar `EventBus.ts` (singleton `Phaser.Events.EventEmitter`) — patrón oficial del template.
- [ ] **2.3.b** React emite `pose:update` cuando LiveKit recibe data del peer → Phaser scene lo consume y mueve sprite.
- [ ] **2.3.c** Phaser emite `local:pose:changed` (movimiento del jugador) → React lo publica vía LiveKit.

### 2.4 — Audio espacial 2D mínimo

- [ ] **2.4.a** Configurar `WebAudioSoundManager.setListenerPosition(x, y)` en cada frame con la pose local.
- [ ] **2.4.b** Adapter del `toAudioGain()` de domain → `PannerNode.refDistance` y `rolloffFactor`.
- [ ] **2.4.c** Flag: iOS Safari = fallback mono (`PannerNode` no soportado, documentado oficialmente).

---

## FASE 3 — MVP 2D jugable

**Duración:** 4-6 semanas | **Bloquea:** Fase 4
**Criterio de éxito:** dos usuarios pueden entrar, verse moverse en un piso 2D, oírse con atenuación espacial, chatear.

### 3.1 — Espacio 2D (1 piso top-down)

- [ ] **3.1.a** Tilemap Tiled JSON (mapa base + capa de colisión).
- [ ] **3.1.b** Importer en Phaser: `this.load.tilemapTiledJSON('floor', '...')`.
- [ ] **3.1.c** Render del piso, paredes, escritorios.

### 3.2 — Avatares

- [ ] **3.2.a** Sprite atlas para 1 avatar base (idle 4-dir + walk 4-dir). Usar `phaserjs/asset-pack-tools` o packer manual.
- [ ] **3.2.b** Sistema de spawn por participante LiveKit (entra Room → aparece sprite).
- [ ] **3.2.c** Animación según `Movimiento` del ECS (`direccion + velocidad`).

### 3.3 — Movimiento + ECS

- [ ] **3.3.a** Sistema `MovementSystem2D` lee `Posicion`/`Direccion` (bitecs compartido), aplica delta.
- [ ] **3.3.b** Sistema `RenderSystem2D` lee `Posicion` y setea `sprite.x = pose.x * tileSize`. **Este sistema vive en `apps/cowork-2d`, no en `@cowork/ecs-core`.**
- [ ] **3.3.c** Input: WASD/teclado + click-to-move opcional.

### 3.4 — Pathfinding

- [ ] **3.4.a** Integrar `easystarjs` en `apps/cowork-2d`.
- [ ] **3.4.b** Adapter implementa `INavigationService` (puerto de domain ya existente).
- [ ] **3.4.c** Click → path → mover sprite step-by-step.

### 3.5 — Cámara

- [ ] **3.5.a** `camera.startFollow(localSprite)` con lerp.
- [ ] **3.5.b** Mapear `CameraFramingPolicy` de domain (3D) → params de Phaser `Camera2D` (zoom, deadzone).

### 3.6 — Chat + presencia + HUD

- [ ] **3.6.a** Importar componentes chat de `@cowork/ui-react`. Render encima del canvas Phaser (DOM overlay, no en scene).
- [ ] **3.6.b** Presencia: barra lateral con participantes.
- [ ] **3.6.c** Indicadores: speaking ring alrededor del sprite (Phaser graphics).

### 3.7 — Audio espacial parity con 3D

- [ ] **3.7.a** Atenuación por distancia coincide con la del modo 3D (mismo `toAudioGain()`).
- [ ] **3.7.b** Test manual con 2 navegadores.

---

## FASE 4 — Tests + parity + hardening

**Duración:** 1-2 semanas
**Criterio de éxito:** suite Playwright dedicada 2D verde + stress 60 usuarios.

- [ ] **4.1** Suite Playwright en `apps/cowork-2d/tests/` (smoke + funcional + e2e). Reusa los helpers Supabase/LiveKit de `apps/cowork-3d` cuando aplique.
- [ ] **4.2** Stress test con 60-200 participantes (mismo runner Fase 3 actual, target distinto).
- [ ] **4.3** Sentry per-app (DSN distinta para distinguir).
- [ ] **4.4** Bundle budget per-app.
- [ ] **4.5** README de cada app con quickstart.
- [ ] **4.6** ADR (Architecture Decision Record) del split — para que el próximo dev entienda por qué hay dos apps y un core.

---

## Cronograma agregado

| Fase | Duración | Acumulado | Bloqueante para |
|---|---|---|---|
| 0 — Deuda técnica | 3-5 días | 1 semana | Fase 1 |
| 1 — Monorepo skeleton | 3-5 días | 2 semanas | Fase 2 |
| 2 — Bootstrap 2D | 5-7 días | 3 semanas | Fase 3 |
| 3 — MVP 2D | 4-6 semanas | 9 semanas | Fase 4 |
| 4 — Parity + hardening | 1-2 semanas | 11 semanas | — |

**Asume 1 dev senior full-time.** Assets 2D (sprite atlases, tilemaps) corren en track paralelo desde Fase 2.

---

## Riesgos vigentes (a revisar al final de cada fase)

| Riesgo | Mitigación | Fase de detección |
|---|---|---|
| Fugas tipo LiveKit aparecen al mover código | Type-check estricto + script `grep -r 'livekit-client' packages/domain packages/application` | Fase 0 + Fase 1 |
| Stores Zustand referencian tipos R3F escondidos | Audit en Fase 1.3.g | Fase 1 |
| `bitecs` componentes asumen 3 floats (xyz) | Hoy son int arrays — auditar antes de mover a `ecs-core` | Fase 0 |
| iOS Safari sin spatial audio | Fallback mono documentado | Fase 2.4 |
| Pathfinding 2D no encaja en `INavigationService` | Revisar puerto en Fase 0.4, ajustar si hace falta | Fase 0 |
| Asset pipeline 2D atrasa Fase 3 | Track paralelo desde Fase 2 | Fase 3 |
| Phaser 4 API gotcha vs 3 | Solo afecta `apps/cowork-2d`, no contamina core | Fase 2-3 |
| Turborepo cache miss continuo | Revisar `inputs`/`outputs` en `turbo.json` | Fase 1.5 |

---

## Lo que **no** entra en este roadmap

- Reescribir el modo 3D (queda igual).
- Generar arte 2D (track paralelo, no técnico).
- Migrar el SFU / TURN / coturn (compartidos, sin cambios).
- Renombrar el proyecto (`cowork-v3.7` queda como nombre del repo).
- Mover de Vite a Next.js (no aporta — Vite SPA basta para ambas apps).

---

## Próximo paso concreto

Ejecutar **Fase 0.1** (tapar fugas LiveKit). Es el cambio más chico que destraba todo lo siguiente y es 100% reversible. Si después decidís no seguir con el monorepo, el código queda mejor de todas formas.
