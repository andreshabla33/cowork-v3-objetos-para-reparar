# Stress Test Harness — 3 fases automatizadas

Valida el espacio 3D bajo carga (hasta 100 clientes) en 3 fases con gate SLO entre cada una.

## TL;DR — ejecutar ahora

```bash
# 1. Setup (una sola vez) — copiar la plantilla y completar credenciales
cp .env.stress.example .env.stress.local
# editá .env.stress.local con tu email + password

# 2. Prender dev server en otra terminal
npm run dev

# 3. Correr Fase 1 automática (5 min, solo renderer local con 50 bots)
npm run stress:fase1
```

Exit code `0` = PASS. JSON completo en `tests/stress/fase1-local/runs/*.json`.

Los runners auto-cargan `.env.stress.local` desde la raíz — **no necesitás exportar vars manualmente**, funciona igual en Windows CMD / PowerShell / bash. Podés sobreescribir cualquier var inline si el shell lo permite.

## Arquitectura (Clean + Test Pyramid)

```
tests/stress/
├── fase1-local/      ← Three.js/r3f local con 50 bots fake (cost $0)
├── fase2-sfu/        ← lk load-test contra LiveKit Cloud (cost ~$0.10)
├── fase3-playwright/ ← N clientes reales Playwright + fake-media (cost medium)
└── scripts/
    └── run-all-phases.ts  ← orquestador con gate SLO entre fases
```

Cada fase es independiente (Clean Architecture Domain/Application/Infrastructure).
Fase N solo corre si Fase N-1 pasó — fail-fast oficial.

## Flujo automatizado

| Fase | Qué valida | Dependencias | Duración | npm script |
|---|---|---|---|---|
| 1 | Renderer, leaks de memoria, FPS P99 | Dev server + cuenta login | 5 min | `stress:fase1` |
| 2 | SFU publish/subscribe latencia, packet loss | livekit-cli + creds | 2-5 min | `stress:fase2` |
| 3 | E2E completo, 10 pasos del journey | Playwright + Y4M/WAV assets | 10-20 min | `stress:fase3` |
| Todo | Todas con gates | Todos los anteriores | 20-30 min | `stress:all` |

## Variables de entorno

### Fase 1 (renderer local)

| Var | Required | Default | Uso |
|---|---|---|---|
| `FASE1_BASE_URL` | ✓ | — | URL del dev server (típicamente `http://localhost:5173`) |
| `FASE1_LOGIN_EMAIL` | ✓ | — | Email de cuenta con al menos 1 workspace |
| `FASE1_LOGIN_PASSWORD` | ✓ | — | Password |
| `FASE1_DURATION_SEC` | | 300 | Duración del muestreo (seg) |
| `FASE1_WARMUP_SEC` | | 5 | Warmup antes de spawn bots |
| `FASE1_HEADLESS` | | false | `true` para headless (ahorra GPU del host) |

### Fase 2 (SFU load-test)

| Var | Required | Uso |
|---|---|---|
| `LIVEKIT_URL` | ✓ | `wss://xxx.livekit.cloud` |
| `LIVEKIT_API_KEY` | ✓ | API key del proyecto |
| `LIVEKIT_API_SECRET` | ✓ | API secret |

Requiere `livekit-cli` instalado (`brew install livekit-cli` / `curl -sSL https://get.livekit.io/cli | bash`).

### Fase 3 (E2E Playwright)

| Var | Required | Default | Uso |
|---|---|---|---|
| `E2E_BASE_URL` | ✓ | — | URL del espacio 3D |
| `E2E_CONCURRENCY` | | 10 | Browsers simultáneos (cap por RAM) |
| `E2E_TOTAL_JOURNEYS` | | = concurrency | Journeys totales |
| `E2E_HEADLESS` | | true | `false` para ver browsers |
| `E2E_PROFILE` | | desktop | `laptop` aplica SLOs tolerantes |

Requiere ffmpeg + generar assets: `bash tests/stress/fase3-playwright/scripts/generate-fake-assets.sh`.

## Orquestador (corre las 3 fases con gates)

```bash
RUN_PHASES=1,2,3 \
FASE1_BASE_URL=http://localhost:5173 FASE1_LOGIN_EMAIL=... FASE1_LOGIN_PASSWORD=... \
LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
E2E_BASE_URL=http://localhost:5173 \
npm run stress:all
```

Fases sin env vars se marcan SKIP (no falla). Para correr todas aunque falle: `SKIP_GATE=true`.

## SLOs bloqueantes (alineados con plan aprobado 2026-04-24)

### Fase 1 (pure renderer)

| Métrica | Desktop | Laptop Iris Xe | Fuente |
|---|---|---|---|
| Heap growth | < 30 MB | < 40 MB | Chrome memory docs |
| FPS P99 | ≥ 40 | ≥ 25 | r3f pitfalls |
| Monotonic geom/tex growth | 0 | 0 | renderer.info |

### Fase 2 (SFU)

| Métrica | Umbral |
|---|---|
| publish P95 | < 200 ms |
| subscribe P95 | < 500 ms |
| packet loss | < 2% |
| reconnects | 0 |

### Fase 3 (E2E)

| SLO | Umbral | Valida |
|---|---|---|
| Room connected | < 5s | Fix I (región) |
| Chat INSERT rate | ≥ 98% | Fix K (RLS INSERT) |
| moveParticipant rate | ≥ 98% | Fix C + G |
| FPS P99 desktop | ≥ 40 | Fix A, B, D |
| Ghost cleanup | < 5s | Fix E |

## Output JSONs

- Fase 1: `tests/stress/fase1-local/runs/<ISO>.json`
- Fase 2: `tests/stress/fase2-sfu/runs/<ISO>.json`
- Fase 3: `tests/stress/fase3-playwright/runs/<ISO>.json`

## Sources oficiales

- Three.js renderer.info: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
- r3f Pitfalls: https://r3f.docs.pmnd.rs/advanced/pitfalls
- Playwright: https://playwright.dev/docs/intro
- Chromium fake-media flags: https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc
- LiveKit load-test: https://docs.livekit.io/home/cli/load-test/
- Y4M format: https://wiki.multimedia.cx/index.php/YUV4MPEG2

## Troubleshooting

- **"Playwright no está instalado"** — `npm install` (ya está en devDeps)
- **"missing env: FASE1_BASE_URL"** — leé la tabla de env vars arriba
- **"__stressStartAuto no disponible"** — el dev server corre pero el modo `import.meta.env.DEV` es false (estás corriendo vs prod build)
- **Fase 1 timeout** — subí `FASE1_DURATION_SEC` o chequeá console del browser (pasá `FASE1_HEADLESS=false`)
- **Canvas no monta** — el login account no tiene workspace, o tarda > 30s en cargar
