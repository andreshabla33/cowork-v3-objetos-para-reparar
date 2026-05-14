# Cowork Monorepo POC

POC para validar el approach de migración 2D del proyecto Cowork v3.7.
Stack: **pnpm workspaces** + **Phaser 4** + **React 19** + **Vite 6** + **TypeScript 5.8**.

## Objetivos validados

1. Monorepo con pnpm workspaces funcional (`packages/*` + `apps/*`).
2. Un paquete compartido (`@cowork/core-shared`) importable desde la app.
3. Phaser 4 montado dentro de React 19 con comunicación bidireccional.
4. Movimiento WASD/flechas, cámara que sigue al jugador, tilemap procedural.
5. Lifecycle limpio: la escena Phaser desmonta al desmontar el React component.

## Estructura

```
poc-monorepo/
├─ pnpm-workspace.yaml
├─ package.json                       ← root, scripts pnpm -r
├─ packages/
│  └─ core-shared/                    ← stub: tipos compartibles entre 2D y 3D
│     └─ src/index.ts                 (FloorType enum, Vector2D type, etc.)
└─ apps/
   └─ cowork-2d/                      ← app Phaser
      ├─ index.html
      ├─ vite.config.ts
      ├─ tsconfig.json
      └─ src/
         ├─ main.tsx                  ← React entry
         ├─ App.tsx                   ← root layout (HUD + canvas)
         ├─ PhaserGame.tsx            ← mount/unmount del Game instance
         ├─ EventBus.ts               ← React ↔ Phaser via mitt-style
         └─ scenes/
            └─ OfficeScene.ts         ← demo: tilemap + player + camera
```

## Uso

```bash
# Desde poc-monorepo/
pnpm install
pnpm dev:2d        # arranca cowork-2d en http://localhost:5174
pnpm build:2d
pnpm typecheck     # tsc --noEmit en todos los workspaces
```

## Decisiones técnicas

- **Phaser 4** (no Phaser 3) — versión `latest` en npm a 2026-05-14, soporta WebGPU+WebGL, TypeScript types built-in.
- **No assets externos**: el POC usa `Graphics` primitives (rect, circle) y un tilemap procedural para no depender de sprites de artista. Demuestra arquitectura, no arte.
- **Sin LiveKit/Supabase aún**: el POC valida que el paquete shared se importa; la integración real con backend va en una segunda iteración.
- **Misma arquitectura Clean** que v3.7: si la migración procede, `packages/core-domain` recibe los entities/ports/use cases agnósticos al render, `packages/core-livekit` y `packages/core-supabase` los adapters.

Ver `docs/migration-plan.md` (a crear) para el plan completo.
