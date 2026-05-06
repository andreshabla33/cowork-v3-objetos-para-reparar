---
name: sync-technical-docs
description: Registra arquitecturas, refactors y decisiones técnicas en la tabla `documentacion` del proyecto MVP en Supabase para mantener un historial consultable de cambios mayores en Cowork V3.7.
---

# Sync Technical Docs

Al completar un cambio técnico importante, registra la decisión en Supabase para que el equipo tenga trazabilidad.

## Cuándo activarse

- Al completar un refactor estructural significativo
- Al agregar nuevos endpoints o lógicas de dominio complejas
- Después de sesiones de resolución de bugs críticos
- Cuando se toma una decisión técnica que afecta a >1 módulo

## Destino

- **Proyecto Supabase:** MVP Cowork
- **Tabla:** `documentacion`
- **Campos típicos:** `titulo`, `categoria`, `contenido` (markdown), `autor`, `fecha`, `commit_sha`, `tags`

## Workflow

1. Al terminar el cambio, resume en 1 párrafo: qué se hizo, por qué, impacto.
2. Captura:
   - Rama y commit SHA
   - Archivos afectados
   - Justificación técnica (no el "qué", sino el "por qué")
   - Cualquier trade-off o deuda introducida
3. Inserta una fila en `documentacion` con el resumen.
4. Enlaza el ticket o la conversación que originó el cambio si existe.

## Ejemplos de entradas válidas

- "Refactor de `VirtualSpace3D` — split en root/overlays/modals para reducir el god-component"
- "Fix popin 3D — Precompile shaders + handshake scene-ready"
- "TS strict cleanup — fases 1-6 aplicadas, errores 133 → 0"
- "Fix stale-session en bootstrap (auth.getUser oficial)"

## Anti-patrones

- No registrar fixes triviales (typos, lint auto-fixes).
- No duplicar contenido de commits: el resumen debe dar contexto **adicional**.
- No registrar planes todavía no ejecutados (eso va a otra tabla/plan).
