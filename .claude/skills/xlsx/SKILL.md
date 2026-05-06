---
name: xlsx
description: Creación, edición y análisis de hojas de cálculo Excel (.xlsx, .xlsm, .csv, .tsv). Soporta fórmulas, formato, gráficos, pivots y limpieza de datos tabulares.
---

# XLSX Toolkit

Usa esta skill cuando el entregable principal es una hoja de cálculo o debes procesar datos tabulares.

## Cuándo activarse

- El entregable principal es un archivo de hoja de cálculo
- Apertura, edición o corrección de un `.xlsx` / `.csv` existente
- Conversión entre formatos tabulares (csv ↔ xlsx ↔ tsv)
- Limpieza de datos y generación de reportes

## Capacidades

- **Lectura**: parsing de xlsx/csv con tipos correctos
- **Escritura**: creación con múltiples hojas, estilos, fórmulas
- **Fórmulas**: insertar fórmulas Excel nativas (SUMA, BUSCARV, etc.)
- **Formato**: colores de celda, bordes, formato de número, anchos de columna
- **Gráficos**: generación de charts nativos de Excel
- **Tablas dinámicas**: creación de pivots
- **Limpieza**: deduplicado, normalización, validación de tipos

## Librerías recomendadas

- **Python**: `openpyxl` (xlsx lectura/escritura con formato), `pandas` (análisis y limpieza), `xlsxwriter` (escritura con gráficos complejos)
- **Node.js**: `exceljs` (lectura/escritura completa), `xlsx` (papaparse-style rápido)

## Workflow típico

1. Para análisis o limpieza de datos, usa `pandas` — es imbatible.
2. Para generación de reportes con formato, usa `openpyxl` o `xlsxwriter`.
3. Para archivos > 100k filas, lee en chunks o usa formato parquet intermedio.
4. Preserva fórmulas originales si el usuario edita un archivo existente.

## Anti-patrones

- No conviertas xlsx → csv → xlsx (pierdes fórmulas, formato y múltiples hojas).
- No uses strings para fechas — usa objetos `datetime`.
- No hardcodees anchos de columna sin auto-fit.
- No leas archivos enormes con `pandas.read_excel` sin `chunksize` o conversión a parquet.
