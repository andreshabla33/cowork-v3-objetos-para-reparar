<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Cowork V3 - Reparación de objetos 3D

Repositorio de trabajo para estabilizar el sistema de objetos 3D del espacio virtual de Cowork V3.

El foco actual de este repositorio es corregir y mantener:

- escala de objetos GLTF/GLB
- anclaje al suelo
- sincronización entre catálogo, instancias, render y colisiones
- calibración de objetos desproporcionados respecto al avatar

## Objetivo de este repo

Este repositorio se utiliza para iterar sobre problemas reales del runtime 3D, especialmente en:

- `components/3d/ObjetoEscena3D.tsx`
- `components/space3d/objetosRuntime.ts`
- `hooks/space3d/useEspacioObjetos.ts`
- `components/VirtualSpace3D.tsx`
- `components/space3d/Scene3D.tsx`

La estrategia actual adopta una base estable:

- escala uniforme de GLTF tipo `contain`
- anclaje al suelo usando bounding box
- catálogo como fuente de verdad para dimensiones y `escala_normalizacion`
- resincronización de instancias persistidas cuando cambia el catálogo

## Stack técnico

- React 19
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Rapier
- Supabase

## Requisitos

- Node.js 20 o superior
- npm

## Instalación local

1. Instala dependencias:

   `npm install`

2. Crea tu archivo de entorno local a partir de `.env.example`.

3. Completa las variables necesarias en `.env.local`.

4. Ejecuta el proyecto:

   `npm run dev`

## Variables de entorno

Variables base incluidas en `.env.example`:

- `VITE_APP_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TURN_URL`
- `VITE_TURN_URL_TCP`
- `VITE_TURN_URL_TLS`
- `VITE_TURN_URL_TLS_TCP`
- `VITE_TURN_USERNAME`
- `VITE_TURN_CREDENTIAL`

Notas:

- no subas claves reales al repositorio
- el proyecto Supabase usado por este workspace es `lcryrsdyrzotjqdxcwtp`

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Levanta el entorno local con Vite |
| `npm run build` | Genera el build de producción |
| `npm run typecheck` | Ejecuta validación de TypeScript |
| `npm run validar` | Ejecuta `typecheck` + `build` |
| `npm run preview` | Sirve el build generado |

## Flujo de reparación de objetos 3D

Cuando un objeto se ve demasiado grande, pequeño o flotando, el criterio de trabajo es:

1. revisar el catálogo en Supabase
2. verificar `ancho`, `alto`, `profundidad` y `escala_normalizacion`
3. evitar heurísticas globales nuevas en runtime
4. corregir outliers en catálogo
5. resincronizar instancias persistidas si ya existen en escena

## Archivos clave

- `components/3d/ObjetoEscena3D.tsx`: normalización visual de modelos GLTF
- `components/space3d/objetosRuntime.ts`: dimensiones runtime efectivas
- `hooks/space3d/useEspacioObjetos.ts`: herencia de catálogo e inserción de objetos
- `components/VirtualSpace3D.tsx`: flujo de colocación de objetos
- `components/space3d/Scene3D.tsx`: colisiones, escena y alineación física

## Estado actual

Este repo ya incluye una línea de trabajo para estabilizar objetos 3D basada en:

- runtime uniforme y predecible
- calibración de outliers en catálogo
- validación con `npm run validar`

## Recomendación operativa

Antes de introducir nuevas mejoras de arquitectura sobre objetos 3D:

- contrastar primero con documentación viva del proyecto
- revisar datos reales del catálogo e instancias
- investigar mejores prácticas externas cuando el cambio afecte runtime o pipeline

## Remoto de reparación

Este repositorio fue preparado para publicarse también en:

- `https://github.com/andreshabla33/cowork-v3-objetos-para-reparar`
