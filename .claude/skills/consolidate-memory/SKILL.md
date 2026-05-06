---
name: consolidate-memory
description: Pase reflexivo sobre los archivos de memoria del asistente — fusiona duplicados, corrige hechos obsoletos, elimina entradas contradictorias y poda el índice MEMORY.md.
---

# Consolidate Memory

Revisa la memoria persistente del asistente y mantenla limpia, coherente y útil.

## Cuándo activarse

- La memoria acumula entradas redundantes o contradictorias
- Después de sesiones largas con muchos cambios de estado del proyecto
- El usuario pide limpiar o consolidar el contexto persistente
- Antes de empezar un nuevo ciclo de trabajo importante

## Ubicación de la memoria

```
C:\Users\Usuario\.claude\projects\<proyecto-slug>\memory\
  ├── MEMORY.md              ← índice
  ├── user_*.md              ← info del usuario
  ├── feedback_*.md          ← correcciones y confirmaciones
  ├── project_*.md           ← contexto del proyecto
  └── reference_*.md         ← referencias a sistemas externos
```

## Workflow

1. **Lee `MEMORY.md`** como punto de entrada.
2. **Lee cada archivo referenciado** y agrúpalos mentalmente por tema.
3. **Identifica problemas**:
   - Duplicados: dos archivos que dicen lo mismo con palabras distintas
   - Contradicciones: una memoria dice A, otra dice ¬A
   - Obsoletos: fechas pasadas, proyectos completados, hechos ya cambiados en el código
   - Vagos: entradas sin valor accionable
4. **Fusiona** duplicados en un único archivo con la versión más reciente y específica.
5. **Elimina** los obsoletos y los vagos.
6. **Actualiza `MEMORY.md`** para reflejar la nueva estructura.

## Reglas

- Antes de borrar una memoria "obsoleta", verifica contra el estado real del código.
- Preserva siempre el **por qué** (razón/incidente) — es lo más valioso.
- Si hay duda entre dos versiones contradictorias, pide al usuario antes de decidir.
- No convertir este pase en una reescritura total; conserva lo que funciona.

## Señales de que la memoria necesita consolidación

- `MEMORY.md` tiene más de 30 líneas
- Hay 2+ archivos con nombres muy similares
- Encuentras fechas de hace 3+ meses que ya no son relevantes
- El usuario comenta "ya te dije eso" sobre algo que está en memoria
