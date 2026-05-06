---
name: pdf
description: Toolkit completo para manipulación de PDFs — extracción de texto/tablas, creación, merge/split, rotación, marcas de agua, formularios, cifrado y OCR.
---

# PDF Toolkit

Usa esta skill para cualquier tarea que involucre archivos PDF.

## Cuándo activarse

- Cualquier tarea que involucre un archivo `.pdf` (entrada o salida)
- Creación de reportes en PDF
- Rellenar formularios PDF
- Combinar o dividir documentos
- Extracción de datos de PDFs escaneados (OCR)

## Capacidades

- **Extracción**: texto plano, texto con layout, tablas estructuradas, metadata
- **Creación**: PDFs nuevos desde HTML, markdown o datos estructurados
- **Merge/Split**: combinar varios PDFs, dividir por páginas o tamaño
- **Rotación**: páginas individuales o documento completo
- **Marcas de agua**: texto o imagen, con opacidad
- **Formularios**: lectura y llenado programático de campos AcroForm
- **Cifrado**: añadir/quitar password, permisos de impresión/edición
- **OCR**: conversión de PDF escaneado a PDF con texto seleccionable

## Librerías recomendadas

- **Python**: `pypdf` (merge/split/rotate), `pdfplumber` (extracción con layout), `reportlab` (creación), `pdf2image` + `pytesseract` (OCR)
- **Node.js**: `pdf-lib` (manipulación), `pdf-parse` (extracción de texto), `puppeteer` (HTML → PDF)

## Workflow típico

1. Identifica si el PDF es **texto nativo** o **escaneado** (imagen). Si es escaneado, requiere OCR.
2. Para extracción de tablas, prefiere `pdfplumber` sobre regex sobre texto plano.
3. Para creación de reportes, usa HTML → PDF (puppeteer/weasyprint) cuando el layout sea complejo.
4. Valida el output abriendo el PDF o verificando número de páginas y tamaño.

## Anti-patrones

- No asumas que un PDF escaneado tiene texto — verifica con extracción primero.
- No uses regex sobre texto extraído para tablas complejas — usa extractores de layout.
- No cifres PDFs sin entregar también la contraseña al usuario.
