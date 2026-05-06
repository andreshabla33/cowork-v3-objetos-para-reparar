---
name: skill-creator
description: Crea nuevas skills para Claude Code, modifica y mejora skills existentes, y mide su rendimiento con evals y benchmarks. Úsala para scaffolding, optimización de descripciones y testing de precisión de disparo.
---

# Skill Creator

Herramienta meta: usa esta skill para diseñar, editar y testear otras skills del proyecto.

## Cuándo activarse

- El usuario quiere crear una skill desde cero
- Optimizar la descripción de una skill para mejor detección automática
- Evaluar la precisión de disparo de una skill existente
- Refactorizar una skill para hacerla más específica o reutilizable

## Estructura de una skill

```
.claude/skills/<nombre-skill>/
  └── SKILL.md
```

`SKILL.md` debe tener:
1. Frontmatter con `name` y `description` (la description es lo que Claude lee para decidir si activar la skill — hazla específica).
2. Cuerpo con secciones claras: cuándo activar, capacidades, workflow, anti-patrones.

## Reglas para una buena `description`

- Una sola oración, <200 caracteres ideal
- Incluye el dominio técnico específico (no "ayuda con código" — sí "refactor de hooks React con Clean Architecture")
- Menciona los triggers concretos cuando sea posible
- Evita adjetivos vacíos ("poderoso", "avanzado")

## Workflow para crear una skill nueva

1. **Define el dominio**: ¿qué problema resuelve y cuándo debe dispararse?
2. **Escribe la description** — itera hasta que sea inequívoca.
3. **Escribe el body** con: triggers, capacidades, workflow paso a paso, anti-patrones.
4. **Test manual**: prueba 3-5 prompts que deberían activarla y 3-5 que NO deberían.
5. **Ajusta** la description si hay falsos positivos/negativos.

## Workflow para mejorar una skill existente

1. Lee la versión actual.
2. Identifica qué prompts la activan y cuáles se pierden.
3. Itera en la `description` primero (cambio de alto impacto).
4. Si falta contenido, amplía el body con anti-patrones reales encontrados.

## Anti-patrones en skills

- Descriptions genéricas ("ayuda con tareas de código")
- Bodies que repiten información del frontmatter
- Skills que se superponen en dominio (consolida o diferencia triggers)
- Copiar el prompt de otra skill sin adaptar al dominio
