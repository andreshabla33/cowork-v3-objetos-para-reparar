---
name: official-docs-alignment
description: Validar APIs, patrones y fixes contra documentación oficial de las tecnologías del stack antes de implementar. Cero invención.
---

# Official Docs Alignment (Cowork V3.7)

Validador obligatorio antes de tocar código que use APIs externas. Trabaja junto con `clean-architecture-refactor`.

## 1. Cuándo usar
Cada vez que vayas a implementar/fixear algo que toque: React, R3F, Three, Drei, Rapier, LiveKit, Supabase, Zustand, MediaPipe, Vite, TS, Sentry, Tailwind. Si no encontrás respaldo oficial → flag, no implementes.

## 2. Versiones reales del proyecto + URLs oficiales

| Tecnología | Versión proyecto | Doc oficial |
|---|---|---|
| React | 19.2.x | https://react.dev/reference |
| TypeScript | ~5.8 | https://www.typescriptlang.org/docs/ |
| Vite | 6.2.x | https://vite.dev/ |
| Three.js | 0.182.x | https://threejs.org/docs/ |
| React Three Fiber | 9.5.x | https://r3f.docs.pmnd.rs/ |
| Drei | 10.7.x | https://drei.docs.pmnd.rs/ |
| Rapier (`@react-three/rapier`) | 2.2.x | https://rapier.rs/docs/ + https://github.com/pmndrs/react-three-rapier |
| LiveKit Client | 2.17.x | https://docs.livekit.io/client-sdk-js/ |
| LiveKit Components React | 2.9.x | https://docs.livekit.io/reference/components/react/ |
| Supabase JS | 2.47.x | https://supabase.com/docs/reference/javascript |
| Zustand | 5.0.x | https://github.com/pmndrs/zustand |
| MediaPipe Tasks Vision | 0.10.x | https://ai.google.dev/edge/mediapipe/solutions/vision |
| Sentry React | 10.47.x | https://docs.sentry.io/platforms/javascript/guides/react/ |
| Tailwind CSS | 3.4.x | https://v3.tailwindcss.com/docs |

## 3. Workflow
1. Identificar API/método.
2. Buscar en doc oficial (WebFetch/WebSearch).
3. Cotejar versión vs `package.json` real.
4. Cotejar deprecation y reemplazos.
5. Solo si la doc oficial respalda el patrón → propongo el código.
6. Si no aparece en doc oficial → flag, NO implementar a ciegas.

## 4. Fuentes secundarias aceptables
- Alta confianza: GitHub issues/discussions del repo oficial.
- Media: Stack Overflow validado y reciente.
- Baja: blogs/Medium → solo como pista, re-validar contra oficial.

## 5. Output estructurado obligatorio por validación
\`\`\`
🔎 Validación doc oficial
- API/Patrón: <nombre>
- Doc: <URL exacta + sección>
- Versión soportada: <rango>
- Versión proyecto: <package.json>
- Ejemplo oficial: <snippet>
- Aplicación al caso: <archivo X de Cowork>
- Flags: <none | deprecated | unstable | experimental>
\`\`\`

## 6. Señales deprecated a vigilar
- React 19: `forwardRef` deprecated soft (ref es prop normal en function components), `propTypes`/`defaultProps`, string refs, `ReactDOM.render` (usar `createRoot`).
- Three.js 0.182: `Geometry` ya no existe (usar `BufferGeometry`). `outputEncoding` → `outputColorSpace` (r152). `sRGBEncoding` → `SRGBColorSpace`. `useLegacyLights` flip default (r155).
- LiveKit v2: `room.connect(url, token, options?)`. `RoomEvent.*` enum.
- Supabase JS v2: `auth.signIn` deprecated → `signInWithPassword`/`signInWithOAuth`/`signInWithOtp`.
- Zustand v5: `useStore()` sin selector → re-renders globales. Usar `useStore(s => s.x)` o `useShallow`.
- MediaPipe legacy (`@mediapipe/hands`, `selfie_segmentation`, `camera_utils`, `drawing_utils`): descontinuado mar-2023, migrar a `@mediapipe/tasks-vision`.
- Vite 6: `import.meta.env`, evitar `process.env` en cliente. Sass legacy API deprecated.

## 7. Integración con clean-architecture-refactor
Las dos skills se invocan juntas en cada cambio. Si alguna falla, el cambio no se aplica.
