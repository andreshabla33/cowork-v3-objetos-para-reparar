# packages/ — Monorepo workspaces (placeholder)

**Estado:** estructura preparada, NO activa todavía.

Los directorios acá contienen `package.json.template` que aún no son
workspaces reales. Para activar Fase 1 del monorepo seguir el procedimiento
documentado en `docs/MONOREPO_FASE_1_EXECUTION.md`.

## Mapping previsto

| Package | Mueve desde |
|---|---|
| `@cowork/domain` | `src/core/domain/**` |
| `@cowork/application` | `src/core/application/**` |
| `@cowork/infrastructure-livekit` | `src/core/infrastructure/livekit/**` + adapters |
| `@cowork/infrastructure-supabase` | `src/core/infrastructure/supabase/**` + auth |
| `@cowork/infrastructure-sentry` | `src/core/infrastructure/sentry/**` |
| `@cowork/ecs-core` | `src/core/infrastructure/r3f/ecs/AvatarECS.ts` (solo store) |
| `@cowork/stores` | stores Zustand agnósticos |
| `@cowork/ui-react` | componentes React puros (no R3F) |

## Por qué `.template`

El classifier de Claude Code bloqueó `pnpm add -Dw turbo` y operaciones
masivas de `git mv` por seguridad — Fase 1 requiere autorización paso a
paso del owner. Los archivos `.template` son inertes hasta que se renombren.

Cuando autorices Fase 1:

```bash
# Activar workspace
git mv pnpm-workspace.yaml.template pnpm-workspace.yaml
git mv turbo.json.template turbo.json
git mv tsconfig.base.json.template tsconfig.base.json
pnpm add -Dw turbo

# Activar packages stub (luego del install)
for pkg in domain application infrastructure-livekit infrastructure-supabase infrastructure-sentry ecs-core stores ui-react; do
  git mv "packages/$pkg/package.json.template" "packages/$pkg/package.json"
done

pnpm install
pnpm exec turbo run typecheck
```
