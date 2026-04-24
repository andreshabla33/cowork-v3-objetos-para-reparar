# Stress Test — Fase 2 (SFU, livekit-cli)

Estresa el servidor SFU de LiveKit Cloud con bots sintéticos — sin renderizado, sin browser. Valida capacity del backend ANTES de invertir tiempo en Fase 3 E2E.

## Arquitectura (Clean Architecture)

```
fase2-sfu/
├── domain/              # Scenarios + SLOs. Sin deps.
├── application/         # Runner + Parser.
├── infrastructure/      # LkCliAdapter (child_process).
└── scripts/             # Entry point ejecutable.
```

## Precondición: instalar livekit-cli

```bash
# macOS
brew install livekit-cli

# Linux
curl -sSL https://get.livekit.io/cli | bash

# Verificar
lk --version
```

Ref oficial: https://github.com/livekit/livekit-cli

## Ejecutar

```bash
export LIVEKIT_URL=wss://cowork-1zce4tcm.livekit.cloud
export LIVEKIT_API_KEY=<API_KEY>
export LIVEKIT_API_SECRET=<API_SECRET>

npx tsx tests/stress/fase2-sfu/scripts/run-sfu-stress.ts
```

**Duración total**: 5 tiers × 2 min = **10 min**.
**Consumo LiveKit**: ~1,000 WebRTC participant-minutes (20% cuota Build gratis).

## Plan de ramp-up

| Tier | Peers totales | Publishers (25%) | Subscribers (75%) | Duración |
|---|---|---|---|---|
| 1 | 10 | 3 | 7 | 2 min |
| 2 | 25 | 7 | 18 | 2 min |
| 3 | 50 | 13 | 37 | 2 min |
| 4 | 75 | 19 | 56 | 2 min |
| 5 | 100 | 25 | 75 | 2 min |

Si un tier falla, el runner **aborta escalado** (no tiene sentido testear el siguiente si el anterior ya rompió).

## SLOs (PASS obligatorio en todos los tiers)

| SLO | Umbral | Ref |
|---|---|---|
| Publish latency P95 | < 200ms | LiveKit Cloud |
| Subscribe latency P95 | < 500ms | LiveKit Cloud |
| Packet loss | < 2% | standard WebRTC |
| Involuntary reconnects | 0 | ConnectionQuality docs |
| Connect rate | ≥ 99% | LiveKit |
| Sustained `Lost` quality peers | 0 | ConnectionQuality enum |

## Output

JSON con verdicts por tier en:
```
tests/stress/fase2-sfu/runs/<ISO_timestamp>.json
```

Exit code del script:
- `0` — todos los tiers PASS
- `1` — al menos un tier FAIL
- `2` — error fatal (binary missing, creds incorrectas)

## Flow de decisión

```
Fase 2 PASS → proceder a Fase 3 (Playwright E2E)
Fase 2 FAIL → fix infra SFU (región? plan upgrade?). Re-test Fase 2.
```

## Sources oficiales

- LiveKit CLI: https://github.com/livekit/livekit-cli
- LiveKit Cloud quotas: https://docs.livekit.io/home/cloud/quotas-and-limits/
- ConnectionQuality enum: https://docs.livekit.io/reference/client-sdk-js/enums/ConnectionQuality.html
- Opus codec RFC 6716: https://datatracker.ietf.org/doc/html/rfc6716
