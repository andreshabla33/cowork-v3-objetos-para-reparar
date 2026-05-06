---
name: schedule
description: Crea tareas programadas (triggers / cron agents) que se ejecutan bajo demanda o automáticamente en intervalos. Úsalo para automatizaciones recurrentes, recordatorios, ejecución periódica de scripts o reportes.
---

# Schedule

Usa esta skill cuando el usuario quiera automatizar algo recurrente o programado.

## Cuándo activarse

- El usuario pide "corre esto cada X" / "avísame cuando" / "repite esto"
- Recordatorios temporales
- Ejecuciones programadas de scripts o reportes periódicos
- Polling de estado de un recurso externo
- Tareas tipo `/loop` o cron agents

## Capacidades

- **Crear** un trigger con cron expression o intervalo
- **Listar** triggers activos
- **Actualizar** cron, prompt o estado (enabled/disabled)
- **Ejecutar** un trigger bajo demanda para test
- **Eliminar** triggers que ya no se necesiten

## Workflow típico

1. Entiende **qué** se debe ejecutar: un prompt, un slash command, un script.
2. Entiende **cuándo**: intervalo fijo (`*/15 * * * *`) o on-demand.
3. Confirma el cron con el usuario antes de crearlo (errores cron son difíciles de debuguear).
4. Da al trigger un nombre descriptivo: `check-ci-every-15min` > `trigger1`.
5. Prueba con una primera ejecución manual antes de dejarlo correr.

## Reglas de uso

- **No crees triggers sin confirmación** — son estado persistente que impacta al usuario.
- **Siempre informa** al usuario el nombre exacto del trigger creado para que pueda gestionarlo.
- **Intervalos mínimos razonables**: nada por debajo de 60s salvo caso de uso claro.
- **Evita triggers que consumen API pesada** en intervalos cortos.

## Cron cheatsheet

| Expresión | Significado |
|---|---|
| `*/5 * * * *` | cada 5 min |
| `0 * * * *` | cada hora en punto |
| `0 9 * * 1-5` | 9am L-V |
| `0 0 * * 0` | medianoche del domingo |

## Anti-patrones

- Triggers huérfanos sin nombre descriptivo
- Múltiples triggers haciendo lo mismo
- Ejecutar todos los días un reporte que nadie lee (revisa utilidad)
