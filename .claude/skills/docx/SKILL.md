---
name: docx
description: Crea, lee, edita o manipula documentos Microsoft Word (.docx). Soporta tablas de contenido, encabezados, numeración de páginas, membretes, find-and-replace, tracked changes e inserción de imágenes.
---

# DOCX Toolkit

Usa esta skill cuando el entregable es un documento Word o necesitas extraer/modificar contenido de un `.docx` existente.

## Cuándo activarse

- Solicitud de reporte, memo, carta o documento profesional en formato Word
- Extracción o reorganización de contenido de archivos `.docx`
- Find-and-replace en documentos Word
- Tracked changes / revisiones
- Inserción de imágenes, tablas o gráficos en Word

## Capacidades

- **Creación**: nuevos documentos con estilos (headings, listas, tablas, TOC automática)
- **Lectura**: extracción de texto, metadata y estructura
- **Edición**: find/replace, inserción de párrafos, modificación de estilos
- **Formato**: encabezados, pies de página, numeración, márgenes, membretes corporativos
- **Tablas**: creación y manipulación de tablas con formato
- **Imágenes**: inserción con control de tamaño y posición
- **Tracked changes**: acepta/rechaza cambios, añade revisiones

## Librerías recomendadas

- **Python**: `python-docx` para manipulación general, `docxtpl` para templates con Jinja2
- **Node.js**: `docx` (npm) para creación, `mammoth` para conversión a HTML

## Workflow típico

1. Pregunta al usuario si hay un template o debe crearse desde cero.
2. Si existe el archivo, léelo primero para entender su estructura.
3. Aplica cambios preservando estilos originales.
4. Guarda con un nombre claro (no sobrescribas el original sin confirmación).

## Anti-patrones

- No conviertas a texto plano y reemplaces — pierdes formato.
- No reescribas headers desde cero cuando el template ya los define.
- No insertes imágenes sin validar dimensiones (desborda el ancho de página).
