# Stress Test Harness — production-grade, 100% automatizado

Valida el espacio 3D bajo carga (hasta 200 clientes) en 3 fases con gate SLO,
múltiples load profiles, comparación contra baseline committed, HTML reports
y CI/CD integrado en GitHub Actions.

## TL;DR

```bash
# 1. Setup (una sola vez)
cp .env.stress.example .env.stress.local
# editá .env.stress.local con tus credenciales
npm install                           # instala tsx + wait-on como devDeps
npx playwright install chromium       # descarga el browser

# 2. Ejecutar
npm run dev                           # en una terminal

# En otra terminal, cualquiera de:
npm run stress:fase1:smoke            # 5 bots × 30s — sanity rápido
npm run stress:fase1:load             # 50 bots × 5min — DEFAULT validación real
npm run stress:fase1:soak             # 50 bots × 2h — leak detection largo
npm run stress:fase1:stress           # ramp 10→200 bots — breaking point
npm run stress:fase1:spike            # 20 steady + burst 100 × 10s — burst
```

Output: JSON crudo + **HTML con gráficos Chart.js** + screenshot en
`tests/stress/fase1-local/runs/*.{json,html,png}`.

Exit code 0 = SLO PASS y sin regresión vs baseline. 1 = fail.

## Load profiles canónicos (Test Pyramid)

Alineado con [Grafana k6 test types](https://grafana.com/docs/k6/latest/testing-guides/test-types/).

| Profile | Shape | Duración | Uso típico |
|---|---|---|---|
| `smoke` | 5 bots estático | 30s | Pre-flight — CI PR gate rápido |
| `load` | 50 bots estático | 5 min | SLO oficial — CI main push |
| `soak` | 50 bots estático | 2 h | Leak detection — nightly cron |
| `stress` | Ramp 10→200 × step 10/30s | ~10 min | Breaking point — manual |
| `spike` | 20 + burst 100 × 10s | ~2 min | Burst tolerance — manual |

Sampling por default: **1s** (da 300 muestras en load → P99 estable).
Soak usa 5s para evitar JSON gigante.

## Features de producción implementadas

### 1. Baseline comparison + regression detection

```bash
# Guarda el run actual como baseline oficial (solo si PASS):
npm run stress:fase1:baseline-update -- --profile=load

# git add tests/stress/fase1-local/baselines/load.json
# git commit -m "test(stress): baseline load @ <commit>"
```

El próximo `stress:fase1:load` compara automáticamente:
- FPS P99 / P95 / Median — fallás si bajó >15%
- Heap growth — fallás si subió >15%
- Threshold configurable: `npm run stress:fase1:load -- --threshold=10`

Output: tabla por consola + inline en HTML + exit code 1 si hay regresión.

### 2. HTML report con gráficos inline

Cada run genera un `.html` standalone (Chart.js CDN, no build step) con:
- Verdict SLO + reasons
- Tabla comparativa vs baseline (regresiones resaltadas)
- Time series: FPS / Heap / Geometries/Textures / Draw calls

Abrí el `.html` en cualquier browser — se comparte como artefacto de CI o pegando.

### 3. Network throttling (CDP oficial)

Simula conexiones lentas vía Chrome DevTools Protocol
([ref](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions)):

```bash
npm run stress:fase1:load -- --network=fast-3g    # 180 KB/s, 562ms latency
npm run stress:fase1:load -- --network=slow-3g    # 62 KB/s, 2000ms latency
```

Valida fix I (región LiveKit) y reconexiones bajo red real de mobile.

### 4. Chaos injection

Inspirado en [Netflix Chaos Monkey](https://netflix.github.io/chaosmonkey/):

```bash
npm run stress:fase1:load -- --chaos=network_blackout   # offline 3s cada 60s
npm run stress:fase1:load -- --chaos=tab_freeze         # CPU spin 2s cada 90s
```

Valida fix E (ghost cleanup <5s) y robustez de reconexión LiveKit.

### 5. CI/CD integrado (GitHub Actions)

`.github/workflows/stress.yml` dispara:

| Trigger | Profile | Qué valida |
|---|---|---|
| PR open/update | `smoke` | Sanity, no breaking changes |
| Push a main | `load` | SLO oficial + baseline comparison |
| Nightly cron 04:00 UTC | `soak` | Leak detection 2h |
| Manual `workflow_dispatch` | cualquiera | Debug / ad-hoc |

Features:
- **PR comment** con verdict y métricas (via `actions/github-script`)
- **Artefactos** 30 días (JSON + HTML + screenshots)
- **Slack notify** si soak nocturno falla (`SLACK_STRESS_WEBHOOK` secret)
- Secrets GitHub requeridos: `STRESS_LOGIN_EMAIL`, `STRESS_LOGIN_PASSWORD`,
  `STRESS_SUPABASE_URL`, `STRESS_SUPABASE_ANON_KEY`

### 6. P99 / P95 con nearest-rank + fallback automático

Alineado con [Wikipedia: Percentile nearest-rank](https://en.wikipedia.org/wiki/Percentile#Nearest-rank_method).
Con <100 muestras cae automáticamente a P95 (evita ruido de outliers). El
verdict incluye flag `p99FallbackApplied: true` para trazabilidad.

### 7. Deterministic placement

Spawn de bots usa `(i * 37) % 100` para X y `(i * 53) % 100` para Z —
reproducible run-a-run, fundamental para comparar baseline sin flakiness.

## Arquitectura (Clean + Test Pyramid)

```
tests/stress/
├── fase1-local/
│   ├── domain/
│   │   ├── BotBehavior.ts          — specs puros, indexOffset para ramp
│   │   ├── LeakDetectionCriteria.ts — SLOs + P99/P95 evaluator
│   │   ├── LoadProfiles.ts          — 5 profiles canónicos + SLOs por tier
│   │   └── BaselineComparison.ts    — regression detection (pure)
│   ├── application/
│   │   ├── BotSpawnerUseCase.ts     — spawn/despawn + setTargetCount (ramp)
│   │   ├── MemoryLeakDetector.ts    — sampling configurable
│   │   └── LoadProfileExecutor.ts   — orquesta static/ramp/spike
│   ├── infrastructure/
│   │   ├── FakeBotAvatarsAdapter.ts — ECS integration
│   │   ├── ThreeRendererMetricsProbe.ts — renderer.info + performance.memory
│   │   ├── BaselineStorage.ts       — file-based baseline store
│   │   └── HtmlReportGenerator.ts   — JSON → standalone HTML + Chart.js
│   ├── presentation/
│   │   └── StressFase1Panel.tsx     — mounts in Canvas, expone window handles
│   ├── scripts/
│   │   ├── run-fase1-auto.ts        — Playwright runner (profile-aware)
│   │   ├── compare-baseline.ts      — CLI comparison contra baseline
│   │   ├── update-baseline.ts       — promueve run actual a baseline
│   │   └── generate-report.ts       — regenera HTML desde JSON
│   └── baselines/                   — committed al repo (.json por profile)
├── fase2-sfu/                        — lk load-test CLI (SFU latency)
├── fase3-playwright/                 — E2E real con fake-media
└── scripts/run-all-phases.ts         — orquestador 3 fases con gates

.github/workflows/stress.yml          — CI (smoke PR / load push / soak cron)
```

## Comandos completos

### Fase 1 (renderer local)

```bash
npm run stress:fase1                          # default profile=load
npm run stress:fase1 -- --profile=<name>      # smoke | load | soak | stress | spike
npm run stress:fase1 -- --laptop              # aplica SLOs laptop (FPS ≥25)
npm run stress:fase1 -- --network=fast-3g     # throttling CDP
npm run stress:fase1 -- --chaos=network_blackout  # chaos injection

# Shortcuts
npm run stress:fase1:smoke
npm run stress:fase1:load
npm run stress:fase1:soak
npm run stress:fase1:stress
npm run stress:fase1:spike

# Baseline workflow
npm run stress:fase1:compare -- --profile=load --threshold=15
npm run stress:fase1:baseline-update -- --profile=load [--force]
npm run stress:fase1:report -- --profile=load
```

### Fase 2 + 3 (cost-aware)

```bash
npm run stress:fase2                          # requiere lk CLI + creds
npm run stress:fase3                          # requiere ffmpeg + assets Y4M/WAV

# Orquestador con gates SLO entre fases
npm run stress:all                            # RUN_PHASES=1 por default
# Para todas:
RUN_PHASES=1,2,3 npm run stress:all
```

## SLOs por profile (defaults)

### Desktop (Ryzen / discrete GPU)

| Profile | FPS P99 | Heap Δ MB | Monotonic threshold |
|---|---|---|---|
| smoke | ≥30 | <10 | 10 |
| load | ≥40 | <30 | 3 |
| soak | ≥35 | <80 | 5 |
| stress | ≥20 | <100 | 8 |
| spike | ≥30 | <20 | 3 |

### Laptop mid-tier (Intel Iris Xe)

Aplicado con `--laptop`. FPS ≥25, heap <40, 1 DPR fallback permitido.

## Variables de entorno

Viven en `.env.stress.local` (gitignored, auto-cargado):

```ini
# Fase 1 (required)
FASE1_BASE_URL=http://localhost:5173
FASE1_LOGIN_EMAIL=am@urpeailab.com
FASE1_LOGIN_PASSWORD=your_password
# Opcionales
FASE1_HEADLESS=false              # true para CI / headless
FASE1_WARMUP_SEC=5
FASE1_PROFILE=load                # sobreescrito por --profile
FASE1_NETWORK_PROFILE=fast-3g     # sobreescrito por --network
FASE1_CHAOS=network_blackout      # sobreescrito por --chaos
```

## Sources oficiales citadas en el código

- **Three.js renderer.info**: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
- **r3f Pitfalls**: https://r3f.docs.pmnd.rs/advanced/pitfalls
- **Playwright**: https://playwright.dev/docs/intro
- **Chrome DevTools Protocol — Network.emulateNetworkConditions**: https://chromedevtools.github.io/devtools-protocol/tot/Network/
- **Chromium fake-media flags**: https://source.chromium.org/chromium/chromium/src/+/main:media/base/media_switches.cc
- **LiveKit load-test**: https://docs.livekit.io/home/cli/load-test/
- **k6 test types**: https://grafana.com/docs/k6/latest/testing-guides/test-types/
- **k6 thresholds**: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- **Percentile nearest-rank**: https://en.wikipedia.org/wiki/Percentile#Nearest-rank_method
- **GitHub Actions docs**: https://docs.github.com/en/actions
- **Test Pyramid**: https://martinfowler.com/articles/practical-test-pyramid.html
- **Netflix Chaos Monkey**: https://netflix.github.io/chaosmonkey/

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| "Playwright no instalado" | Primer uso | `npm install && npx playwright install chromium` |
| "missing env: FASE1_BASE_URL" | `.env.stress.local` no existe | `cp .env.stress.example .env.stress.local` + editar |
| "__stressRunProfile no disponible" | Corriendo vs prod build (`import.meta.env.DEV=false`) | usá `npm run dev`, no `npm run build && preview` |
| Canvas timeout 45s | Cuenta sin workspace | login con usuario que tenga ≥1 workspace |
| Baseline regression inesperada | Hardware distinto | `--threshold=25` temporalmente + update baseline cuando estabilice |
| Soak profile 2h demasiado | Local dev | `--profile=load` (5 min) o corralo en CI nightly |

## Limitaciones conocidas

- **100+ clientes**: Fase 1 local simula 200 bots sin red real. Para ≥50 clientes con red real usar Fase 3 distribuido (requiere AWS/K8s).
- **Baseline por hardware**: si el CI runner cambia (GitHub Actions ubuntu → self-hosted), baseline debe actualizarse — considera rama de baselines por runner.
- **No server-side correlation**: métricas de LiveKit SFU + Supabase logs no se correlacionan automáticamente con Fase 1 (pendiente — ver roadmap).
- **Runs dir no rotado**: acumula JSONs históricos. Borrar manual o agregar cron cleanup.
