# Fase 1 — Plan de ejecución paso a paso

**Estado:** preparado, requiere autorización del owner antes de ejecutar.
**Estimación roadmap:** 3-5 días (1 dev senior full-time).
**Pre-requisitos:** Fase 0 completa (commits `21cc8d4`, `a7a20bc`, `0c577e7`, `84bbf56`).

## Por qué este doc existe

El classifier de Claude Code rechazó `pnpm add -Dw turbo` por ser cambio de alta
severidad sin autorización explícita. Operaciones masivas de `git mv` para
extraer 8 packages tampoco se pueden hacer a ciegas sin validar entre pasos.

Este doc es la receta para ejecutar Fase 1 con la mano del owner aprobando
cada commit. Cada paso es reversible (un solo `git revert`).

## Bloque A — Bootstrap (no-breaking)

**Output esperado:** los archivos de monorepo existen, pero `pnpm-workspace.yaml`
todavía no se crea — los archivos `.template` previenen activación accidental.
Después de este bloque, `pnpm dev` sigue funcionando exactamente igual.

### A.1 — Activar `pnpm-workspace.yaml`

```bash
# Renombrar template a archivo real
git mv pnpm-workspace.yaml.template pnpm-workspace.yaml

# Validar que no rompe instalación
pnpm install --frozen-lockfile=false
pnpm tsc --noEmit
pnpm vitest --run tests/unit
pnpm dev   # smoke manual: home + 3D scene cargan ok
```

### A.2 — Instalar Turborepo

```bash
pnpm add -Dw turbo
git mv turbo.json.template turbo.json
pnpm exec turbo run typecheck --dry=json | head -50   # debe listar el root project
```

### A.3 — Activar `tsconfig.base.json`

```bash
git mv tsconfig.base.json.template tsconfig.base.json
# Actualizar tsconfig.app.json para `extends: ./tsconfig.base.json`
# (los paths actuales `@/*` se mantienen)
pnpm tsc --noEmit
```

**Commit A:** `chore: Fase 1.1 — bootstrap monorepo (workspace + turbo + tsconfig.base)`

## Bloque B — Extraer `packages/domain` (primer package real)

**Output esperado:** `@cowork/domain` existe físicamente, lo importa
`apps/cowork-3d` (aún no existe — todavía es `src/`). El paquete se resuelve
vía `tsconfig.base.json` `paths` mapping.

### B.1 — Crear estructura

```bash
mkdir -p packages/domain/src
git mv packages/domain/package.json.template packages/domain/package.json
git mv packages/domain/tsconfig.json.template packages/domain/tsconfig.json
# (deps de package.json: NINGUNA. Domain es 0-dep.)
```

### B.2 — Mover archivos

```bash
git mv src/core/domain/* packages/domain/src/
# Mantener src/core/domain como vacío TEMPORALMENTE (o como re-export)
# para no romper imports `@/core/domain/*` durante la transición
```

### B.3 — Re-wirear imports

Buscar TODOS los `@/core/domain` y reemplazar por `@cowork/domain`:

```bash
# Audit
grep -rln "@/core/domain\|@/src/core/domain" src/ apps/ tests/

# Reemplazo (validar con --dry primero)
# Manual con Edit tool, por archivo, para preservar tipos importados.
```

### B.4 — Validar

```bash
pnpm tsc --noEmit
pnpm vitest --run tests/unit
pnpm dev   # smoke manual
```

**Commit B:** `refactor: Fase 1.3.a — extraer @cowork/domain`

## Bloque C-H — Extraer los otros 7 packages

Mismo patrón que Bloque B, en orden (cada uno depende de los anteriores):

| Paso | Package | Mueve | Deps runtime |
|---|---|---|---|
| C | `@cowork/application` | `src/core/application/**` | `@cowork/domain` |
| D | `@cowork/infrastructure-livekit` | `src/core/infrastructure/livekit/**`, adapters relacionados | `@cowork/domain`, `@cowork/application`, `livekit-client`, `@livekit/components-react`, `@livekit/track-processors` |
| E | `@cowork/infrastructure-supabase` | `src/core/infrastructure/supabase/**`, `auth/**` | `@cowork/domain`, `@cowork/application`, `@supabase/supabase-js` |
| F | `@cowork/infrastructure-sentry` | `src/core/infrastructure/sentry/**` | `@sentry/react` |
| G | `@cowork/ecs-core` | `src/core/infrastructure/r3f/ecs/AvatarECS.ts` (solo entity store) | `bitecs` |
| H | `@cowork/stores` | stores Zustand agnósticos de R3F | `@cowork/domain`, `zustand` |
| I | `@cowork/ui-react` | componentes React puros (no R3F) | `@cowork/domain`, `react`, `lucide-react`, `tailwindcss` |

Cada commit valida con `pnpm tsc --noEmit && pnpm vitest --run tests/unit`.

**NOTA crítica:** Los sistemas R3F (`AvatarSystems.ts`, `CullingSystem`,
`MovementSystem`) **se quedan en apps/cowork-3d**, NO en `@cowork/ecs-core`.
El package solo expone el world + componentes de bitecs.

## Bloque J — Mover apps/cowork-3d

**Output esperado:** el código UI/scene del proyecto vive en `apps/cowork-3d/`.

```bash
mkdir -p apps/cowork-3d/src
git mv src/modules apps/cowork-3d/src/modules
git mv vite.config.ts apps/cowork-3d/vite.config.ts
git mv index.html apps/cowork-3d/index.html
git mv public apps/cowork-3d/public
# tests/ permanece en root (compartido entre apps eventualmente)
```

Crear `apps/cowork-3d/package.json` con deps R3F-specific (three, @react-three/*,
rapier, recast, mediapipe). Heredar `extends: ../../tsconfig.base.json`.

**Smoke test obligatorio:** `pnpm --filter cowork-3d dev` levanta el proyecto
idéntico a antes.

**Commit J:** `refactor: Fase 1.2 — apps/cowork-3d/`

## Bloque K — CI

Update GitHub Actions / Vercel:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm exec turbo run typecheck test:unit build
```

`turbo.json` outputs:

```json
{
  "tasks": {
    "build": { "outputs": ["dist/**"] },
    "typecheck": { "outputs": [] },
    "test:unit": { "outputs": ["coverage/**"] }
  }
}
```

## Salida esperada al final de Fase 1

```
cowork-v3.7/
├─ package.json                  # root scripts: pnpm exec turbo run ...
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ packages/
│  ├─ domain/                    # 100 archivos
│  ├─ application/               # 81 archivos
│  ├─ infrastructure-livekit/
│  ├─ infrastructure-supabase/
│  ├─ infrastructure-sentry/
│  ├─ ecs-core/
│  ├─ stores/
│  └─ ui-react/
└─ apps/
   └─ cowork-3d/                 # actual (Vite + R3F + Three + Rapier + Recast)
```

`pnpm exec turbo run build` levanta todo el repo. Cero diferencias funcionales
para el usuario final.

## Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| `pnpm install` post `pnpm-workspace.yaml` reordena `node_modules` | Validar con `--frozen-lockfile=false` controlado. Si rompe, revert |
| Imports cíclicos entre packages (e.g. application ↔ infra) | Audit con `madge --circular packages/*/src` antes del commit final |
| Tests fallan por path-mapping no resuelto | Vitest también lee `tsconfig.base.json` paths via plugin |
| Vite no resuelve `@cowork/*` en HMR | `vite.config.ts` necesita `resolve.alias` o el plugin `vite-tsconfig-paths` |
| Lock file pierde entries durante mvs | `pnpm install` después de cada bloque para regenerar |
| Sentry sourcemaps apuntan a paths viejos | Update `sentry.config.ts` paths después del Bloque J |

## Tiempo realista por bloque

| Bloque | Estimación |
|---|---|
| A (bootstrap) | 2-4h |
| B (domain) | 4-6h |
| C (application) | 3-4h |
| D-I (otros 6 packages) | 2-4h c/u — total ~18h |
| J (apps/cowork-3d) | 4-6h |
| K (CI) | 2h |
| Smoke + parity manual | 4-8h |
| **Total** | **~40-60h** (5-7 días de un dev) |

Coincide con la estimación del roadmap (3-5 días).
