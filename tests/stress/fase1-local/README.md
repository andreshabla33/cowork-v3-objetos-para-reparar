# Stress Test — Fase 1 (Local, Three.js/WebGPU)

Valida que el motor de render aguante 50 avatares móviles sin fugas de memoria ni caídas de FPS. **No toca red** — ni LiveKit ni Supabase.

## Arquitectura (Clean Architecture)

```
fase1-local/
├── domain/              # SLOs puros + tipos de bot. Sin deps externas.
├── application/         # BotSpawnerUseCase + MemoryLeakDetector.
├── infrastructure/      # Adapters a avatarStore + Three renderer.
└── presentation/        # Panel dev-only con handles de consola.
```

Dependencias apuntando hacia adentro: `presentation → infrastructure → application → domain`.

## Wiring requerido (una vez)

### 1. Mount del panel dentro del Canvas r3f

En `components/space3d/Scene3D.tsx` (o donde esté el `<Canvas>`), agregar:

```tsx
import { StressFase1Panel } from '@/tests/stress/fase1-local/presentation/StressFase1Panel';

// Dentro del <Canvas>:
<StressFase1Panel />
```

El componente retorna `null` en builds de producción (`import.meta.env.DEV` check).

### 2. Bot ticker en useFrame del Canvas

En el mismo Scene3D.tsx (o Player3D), dentro de un `useFrame`:

```tsx
useFrame((_, delta) => {
  (window as any).__stressBotTicker?.(delta);
});
```

Sin este tick, los bots se spawnean pero no se mueven.

## Ejecución del test

1. **Arrancar dev server** (`npm run dev`).
2. Abrir el espacio 3D normalmente.
3. Abrir DevTools → Console.
4. Ejecutar:
   ```js
   __stressSpawn()      // spawn 50 bots
   __stressStart()      // start sampling (5s interval)
   // esperar 5 min — camina por la escena, observa FPS
   __stressStop()       // stop + evaluate SLOs. Log con verdict PASS/FAIL.
   __stressDownload()   // export JSON con samples completos
   ```
5. **Cycle monotonic check**:
   ```js
   __stressDespawn()
   __stressSpawn()
   __stressDespawn()
   __stressSpawn()
   __stressStop()
   ```
   Después de 3 ciclos, `geometriesCount` y `texturesCount` NO deben crecer monotónicamente. Si lo hacen, hay fugas de dispose().

## SLOs (criterios PASS/FAIL)

Aplicados automáticamente por `evaluateRun()`. Valores en `domain/LeakDetectionCriteria.ts`.

| SLO | Desktop (Ryzen 5+) | Laptop mid (i5 Iris Xe) |
|---|---|---|
| Heap growth 5min | < 30 MB | < 40 MB |
| FPS P99 | ≥ 40 | ≥ 25 |
| DPR fallback events | 0 | ≤ 1 |
| Crecimiento monotónico geom/tex | prohibido | prohibido |

El verdict se imprime en consola al hacer `__stressStop()`. `pass: true/false` + lista de razones.

## Sources oficiales

- `renderer.info`: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info
- Chrome memory inspection: https://developer.chrome.com/docs/devtools/memory-problems
- r3f perf pitfalls: https://r3f.docs.pmnd.rs/advanced/pitfalls
- Stats.js pattern: https://github.com/mrdoob/stats.js
- InstancedMesh: https://threejs.org/docs/#api/en/objects/InstancedMesh
