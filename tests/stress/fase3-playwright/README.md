# Stress Test — Fase 3 (E2E, Playwright + Chromium)

Prueba final del plan: N clientes reales (Chromium headless) ejecutando el journey canónico completo contra la app. Valida la integración end-to-end.

**Solo ejecutar si Fase 1 y Fase 2 pasaron.** La Fase 3 es la más cara en tiempo y recursos.

## Arquitectura (Clean Architecture)

```
fase3-playwright/
├── domain/
│   ├── ClientJourneyScript.ts  — steps del journey canónico
│   └── E2ESlos.ts               — SLOs bloqueantes + evaluador puro
├── application/
│   └── JourneyOrchestrator.ts   — pool de N journeys con concurrencia limitada
├── infrastructure/
│   ├── BrowserLauncher.ts       — Playwright + flags Chromium fake-media
│   └── PlaywrightJourneyExecutor.ts — traduce JourneyStep → Page actions
└── scripts/
    ├── generate-fake-assets.sh  — genera Y4M + WAV con ffmpeg
    └── run-e2e-stress.ts        — entry point ejecutable
```

## Setup (una sola vez)

### 1. Instalar Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Ref: https://playwright.dev/docs/intro

### 2. Generar fake assets (Y4M + WAV)

Requiere `ffmpeg` instalado (`brew install ffmpeg` en macOS).

```bash
bash tests/stress/fase3-playwright/scripts/generate-fake-assets.sh
```

Outputs:
- `tests/stress/assets/fake-cam-640x480.y4m` (~5 MB, 60s video sintético)
- `tests/stress/assets/fake-mic.wav` (~5 MB, tono 440Hz 60s)

Chromium usa estos archivos en lugar de cámara/mic reales via flags:
- `--use-file-for-fake-video-capture`
- `--use-file-for-fake-audio-capture`

Ref oficial: https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc

## Journey canónico

Cada cliente ejecuta estos pasos, validando un fix específico:

| Step | Valida |
|---|---|
| 1. Login | auth path |
| 2. Wait Room connected (<5s) | Fix I (región) |
| 3. Walk random 30s | Fix A (label sync) + Fix D (damp) |
| 4. Toggle camera on | Fix K media + device selection |
| 5. Toggle mic on | L.pre instrumentation |
| 6. Send chat message | Fix K RLS INSERT |
| 7. Cross meeting zone | Fix C (freeze) + Fix G (zona XL) |
| 8. Walk outside zone 15s | Fix B (spawn catchup) |
| 9. Toggle camera off | Fix "Conectando..." burbuja |
| 10. Abrupt close tab | Fix E (ghost <5s) |

## Ejecutar

```bash
E2E_BASE_URL=http://localhost:5173 \
E2E_CONCURRENCY=10 \
E2E_TOTAL_JOURNEYS=10 \
E2E_HEADLESS=true \
E2E_PROFILE=desktop \
npx tsx tests/stress/fase3-playwright/scripts/run-e2e-stress.ts
```

### Env vars

| Var | Default | Uso |
|---|---|---|
| `E2E_BASE_URL` | (required) | URL del espacio 3D (dev o prod) |
| `E2E_CONCURRENCY` | 10 | Browsers simultáneos (cap por RAM de la máquina) |
| `E2E_TOTAL_JOURNEYS` | = concurrency | Total de journeys a ejecutar |
| `E2E_HEADLESS` | true | `false` para ver browsers (debug) |
| `E2E_PROFILE` | desktop | `laptop` aplica SLOs más tolerantes |

### Capacidad por hardware runner

| RAM | Chromium concurrentes razonables |
|---|---|
| 16 GB local | 3-5 |
| 32 GB local | 10-15 |
| AWS c5.4xlarge (32 GB) | 10-15 |
| AWS c5.9xlarge (72 GB) | 40-45 |

Para 50 clientes reales, usar 1× c5.9xlarge o 3× c5.4xlarge.

Alternativa híbrida recomendada: **10 Playwright reales + 40 bots via `lk load-test`**. Corre en una sola máquina modesta. El plan aprobado usa esta opción.

## SLOs bloqueantes (GO/NO-GO a producción)

| SLO | Umbral | Valida |
|---|---|---|
| Room connected latency | < 5s | Fix I |
| Chat INSERT success rate | ≥ 98% | Fix K |
| moveParticipant success | ≥ 98% | Fix C + G |
| FPS P99 desktop | ≥ 40 | Fix A, B, D |
| FPS P99 laptop (E2E_PROFILE=laptop) | ≥ 25 | idem |
| Ghost cleanup tras abrupt_close | < 5s | Fix E |

Todos se chequean en `evaluateE2EAggregate()` (Domain). El script exit con:
- `0` — todos los SLOs PASS
- `1` — al menos un SLO FAIL
- `2` — error fatal (assets missing, Playwright no instalado, creds)

## Output

```
tests/stress/fase3-playwright/runs/<ISO_timestamp>.json
```

Estructura:
```json
{
  "startedAt": "2026-04-24T21:00:00.000Z",
  "finishedAt": "2026-04-24T21:05:30.123Z",
  "totalJourneys": 10,
  "concurrency": 10,
  "journeys": [ /* ...JourneyResult per cliente... */ ],
  "verdict": { "pass": true, "reasons": [], "totalJourneys": 10, "passedJourneys": 10 }
}
```

## Flow de decisión

```
Fase 3 PASS → GO a producción
Fase 3 FAIL → diagnosticar por reasons del verdict + journey.steps
              corregir causa raíz + re-test
```

## Sources oficiales

- Playwright: https://playwright.dev/docs/intro
- Chromium fake-media flags: https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc
- Y4M format: https://wiki.multimedia.cx/index.php/YUV4MPEG2
- Playwright test reporters: https://playwright.dev/docs/test-reporters
- WebRTC samples (fake devices): https://webrtc.github.io/samples/src/content/devices/input-output/

## Limitaciones conocidas

- **SSL self-signed**: si dev server usa HTTPS con cert self-signed, agregar `--ignore-certificate-errors` al BrowserLauncher args.
- **Autoplay AudioContext**: flag `--autoplay-policy=no-user-gesture-required` ya incluido.
- **FPS capture**: requiere que el client exponga `window.__fpsSeries` (pendiente de wiring desde `AdaptivePerformanceMonitor`). Fallback a 60 con warn si no existe.
- **Mobile device emulation**: no incluido. Scope aparte — Playwright soporta `device descriptors` si se requiere.
