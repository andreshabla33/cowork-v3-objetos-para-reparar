---
name: clean-architecture-refactor
description: Refactor / implementar / fix bugs respetando capas Clean Architecture, performance en hardware básico y docs oficiales. Sin legacy, sin duplicaciones, todo conectado.
---

# Clean Architecture Refactor (Cowork V3.7)

Skill maestra para refactor, features e implementaciones. Trabaja junto con `official-docs-alignment` (ningún cambio sin doc oficial).

## 1. Criterios duros de performance (no negociables)
- Target: 30+ FPS en GPU integrada / hardware modesto.
- Optimizaciones aplicables sin debate cuando corresponden: instancing (`InstancedMesh`), LOD, `useMemo`/`useCallback`, `React.memo`, lazy loading, web workers, GPU offload (shaders, BVH), frustum culling, distance check.

## 2. Reglas duras de migración (3, no negociables)
1. Nada queda en legacy: si tocás un archivo en `components/`, `hooks/`, `lib/`, `store/`, `services/` raíz, lo migrás a `src/`.
2. Sin duplicaciones: grep antes de crear; consolidar; `src/` gana sobre legacy.
3. Todo conectado: paths absolutos `@/*`, barrel files, type safety estricto en código nuevo.

## 3. Capas + paths concretos
- **Domain** `src/core/domain/<bc>/`: TS puro, cero deps externas (no R3F, no Supabase, no LiveKit).
- **Application** `src/core/application/<bc>/`: use cases, recibe puertos (interfaces), sin React.
- **Infrastructure** `src/core/infrastructure/<adapter>/`: livekit/, supabase/, r3f/, mediapipe/, sentry/, rapier/.
- **Modules** `src/modules/<feature>/`: UI + hooks específicos. Importan application/infrastructure, nunca al revés.

Regla de dependencia: modules → application → domain; modules → infrastructure → application → domain.

## 4. Patrones obligatorios
- Repository pattern para Supabase (no `supabase.from()` en componentes/hooks UI).
- DI vía hooks: `useLivekitService()`, `useTaskRepository()`, `useChatRepository()`, etc.
- Hooks puros: una responsabilidad por hook.
- Selectores Zustand específicos: `useStore(s => s.x)`. NUNCA `useStore()` sin selector. Multi-campo con `useShallow`.
- R3F: lógica declarativa separada de lógica de juego (en application/). `useFrame` solo mueve, no decide.
- LiveKit encapsulado en `src/core/infrastructure/livekit/`. UI consume `useRealtimeRoom()`.

## 5. Reglas de tamaño
- Archivos: máx 500 líneas.
- Componentes React/R3F: máx 200 líneas.
- Funciones: máx 50 líneas (excepto generación procedural de escena).
- Hooks: máx 100 líneas.

## 6. Workflow al tocar código (refactor / feature / bug-fix)
1. Pre-check duplicados con `grep -r`.
2. Localización correcta según capas; mover si está fuera.
3. Cambio mínimo (menor blast radius).
4. Conectar imports/exports/barrels.
5. Validar (`tsc --noEmit`, `vitest --run` archivos tocados, `check:bundle-budget`).
6. Commit Conventional (`refactor:` / `fix:` / `feat:`).

## 7. Output esperado al proponer un cambio
1. Smells detectados.
2. Estructura objetivo (paths nuevos).
3. Plan de extracción.
4. Orden seguro (de hojas a raíz).
5. Cita de doc oficial vía `official-docs-alignment` para cada API tocada.

## 8. Acoplamiento con `official-docs-alignment`
Cada cambio que toque APIs externas DEBE invocar `official-docs-alignment` para validar contra doc oficial. Sin doc oficial → no implementar.

## Regla LiveKit dual (cuando el código toca videocall)

| Layer | Qué usa | Por qué |
|---|---|---|
| UI declarativa videocall | `@livekit/components-react` (`<LiveKitRoom>`, `<ParticipantTile>`, `<ControlBar>`, `<TracksList>`) | Pre-built, accesible, mantenido oficialmente |
| State / hooks | Hooks oficiales (`useRoom`, `useParticipant`, `useTracks`, `useParticipants`, `useLiveKitRoom`) | LiveKit recomienda — no reimplementar |
| Infrastructure custom | `livekit-client` en `src/core/infrastructure/livekit/` | Solo features no expuestas: audio espacial 3D, suscripción selectiva por proximidad, métricas custom, advanced lifecycle |
| Efectos cámara | `@livekit/track-processors` | Único proveedor de blur/virtual-bg/mirror — NUNCA eliminar |
| Regla dura | NO remount `<LiveKitRoom>` al cambiar props | Causa `Client initiated disconnect errors` — UX crítica. Memo/keys estables |

**Impacto en P0-03**: god-hook `useLiveKit.ts` 1205 líneas — buena parte se elimina usando hooks oficiales (`useRoom`, `useParticipant`, `useTracks`). Solo audio espacial + proximidad + métricas custom queda en `src/core/infrastructure/livekit/`.
