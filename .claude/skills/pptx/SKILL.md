---
name: pptx
description: Manejo completo de presentaciones PowerPoint (.pptx) — creación, edición, extracción de texto, uso de templates, layouts, notas de orador, combinación y división de archivos.
---

# PPTX Toolkit

Usa esta skill cuando necesites generar o manipular presentaciones PowerPoint.

## Cuándo activarse

- Solicitud de deck, slides o presentación
- Lectura o extracción de contenido de un `.pptx` existente
- Combinación o división de archivos de presentación
- Actualización masiva de slides (find/replace, reemplazo de logos)

## Capacidades

- **Creación**: nuevos decks desde cero o desde un template corporativo
- **Layouts**: uso de master slides y placeholders
- **Texto**: títulos, bullets, formato rico
- **Imágenes**: inserción con control de tamaño/posición
- **Tablas y gráficos**: generación desde datos
- **Notas de orador**: añadir y extraer
- **Merge/Split**: combinar varios decks, extraer rango de slides

## Librerías recomendadas

- **Python**: `python-pptx` es la opción canónica

## Workflow típico

1. Pregunta si hay template corporativo — prefiere siempre usar uno para mantener branding.
2. Si hay template, inspecciona sus masters y layouts disponibles antes de insertar contenido.
3. Usa placeholders del layout, no cajas de texto flotantes (mantiene consistencia).
4. Al generar muchos slides, itera sobre un layout fijo.

## Anti-patrones

- No crear slides con cajas de texto manuales cuando el layout tiene placeholders.
- No hardcodear dimensiones en px — usa `Inches()` o `Pt()`.
- No mezclar fuentes; respeta las del template.
