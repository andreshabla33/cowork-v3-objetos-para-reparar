/**
 * @module tests/stress/fase1-local/presentation/StressFase1Panel
 *
 * Componente DEV-ONLY que registra el harness de stress Fase 1.
 * No renderiza UI — expone handles globales para control via consola DevTools
 * (menos overhead visual durante el test que un HUD).
 *
 * Activación:
 *   - Solo se monta si `import.meta.env.DEV` es true.
 *   - Debe renderizarse DENTRO de un Canvas r3f (usa useThree).
 *
 * Flow de uso (pega en consola del browser):
 *   1. window.__stressSpawn()     — spawn 50 bots al ECS
 *   2. window.__stressStart()     — start muestreo (5s interval)
 *   3. (esperar 5 min caminando/viendo el 3D)
 *   4. window.__stressStop()      — stop + evaluate SLOs. Console.log con verdict.
 *   5. window.__stressDespawn()   — despawn all + cycle monotonic check
 *   6. window.__stressDownload()  — descarga el JSON con samples + verdict
 *
 * Wiring requerido (paso externo):
 *   El Canvas r3f debe tener UN useFrame que llame a `window.__stressBotTicker?.(delta)`
 *   para que los bots se muevan. Este ticker lo registra el Panel al montarse.
 */

'use client';
import React, { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';

import { BotSpawnerUseCase } from '../application/BotSpawnerUseCase';
import { MemoryLeakDetector } from '../application/MemoryLeakDetector';
import { FakeBotAvatarsAdapter } from '../infrastructure/FakeBotAvatarsAdapter';
import { ThreeRendererMetricsProbe } from '../infrastructure/ThreeRendererMetricsProbe';
import type { LeakVerdict, StressRunResult } from '../domain/LeakDetectionCriteria';
import { SLOS_DESKTOP, SLOS_LAPTOP_MID } from '../domain/LeakDetectionCriteria';

const DEFAULT_BOT_COUNT = 50;
const DEFAULT_BOUNDS = { minX: 10, maxX: 90, minZ: 10, maxZ: 90 } as const;
const AVATAR_URLS = [
  'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/animaciones_universales/avatares/aj.glb',
  'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/animaciones_universales/avatares/peasant_girl.glb',
  'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/avataresPrueba/Ch47_nonPBR_Final.glb',
  'https://lcryrsdyrzotjqdxcwtp.supabase.co/storage/v1/object/public/avatars/avataresPrueba/Ch42_nonPBR_Final.glb',
];

export const StressFase1Panel: React.FC = () => {
  if (!import.meta.env.DEV) return null;
  return <StressFase1PanelInner />;
};

const StressFase1PanelInner: React.FC = () => {
  const { gl } = useThree();

  // FPS rolling via EMA sobre deltaTime. Se mantiene vivo mientras este
  // componente esté montado — sampled por el probe.
  const fpsRef = useRef(60);
  const lastFrameTsRef = useRef(performance.now());
  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      const dt = ts - lastFrameTsRef.current;
      if (dt > 0) {
        const instant = 1000 / dt;
        fpsRef.current = fpsRef.current * 0.9 + instant * 0.1;
      }
      lastFrameTsRef.current = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Construcción única — refs permanentes mientras el componente esté montado.
  const adapterRef = useRef<FakeBotAvatarsAdapter | null>(null);
  const useCaseRef = useRef<BotSpawnerUseCase | null>(null);
  const detectorRef = useRef<MemoryLeakDetector | null>(null);
  const lastResultRef = useRef<StressRunResult | null>(null);
  const lastVerdictRef = useRef<LeakVerdict | null>(null);

  const ensureRefs = useCallback(() => {
    if (!adapterRef.current) adapterRef.current = new FakeBotAvatarsAdapter();
    if (!useCaseRef.current) useCaseRef.current = new BotSpawnerUseCase(adapterRef.current);
    if (!detectorRef.current) {
      const probe = new ThreeRendererMetricsProbe(
        () => gl as THREE.WebGLRenderer,
        () => fpsRef.current,
        () => gl.getPixelRatio(),
      );
      detectorRef.current = new MemoryLeakDetector(probe, 5000);
    }
  }, [gl]);

  // Tick del movement directamente dentro del Canvas — no requiere wiring
  // externo. Se ejecuta cada frame del renderer r3f.
  useFrame((_, dt) => {
    ensureRefs();
    useCaseRef.current?.tick(dt);
  });

  useEffect(() => {
    ensureRefs();

    // Console handles globales — el ticker ya corre via useFrame arriba.
    const w = window as unknown as Record<string, unknown>;

    // Console handles. No UI visual — se opera desde DevTools.
    w.__stressSpawn = () => {
      useCaseRef.current?.spawn({
        botCount: DEFAULT_BOT_COUNT,
        bounds: DEFAULT_BOUNDS,
        avatarModelUrls: AVATAR_URLS,
        withFakeVideoBubbleRatio: 0.3,
      });
      console.log(`[stress-fase1] spawned — active: ${useCaseRef.current?.activeCount()}`);
    };
    w.__stressDespawn = () => {
      const n = useCaseRef.current?.despawnAll() ?? 0;
      console.log(`[stress-fase1] despawned ${n} bots`);
    };
    w.__stressStart = () => {
      detectorRef.current?.start();
      console.log('[stress-fase1] sampling started — interval 5s');
    };
    w.__stressStop = () => {
      const active = useCaseRef.current?.activeCount() ?? 0;
      const result = detectorRef.current?.stop(active);
      if (!result) return;
      lastResultRef.current = result;
      // Detección heurística hardware (Ryzen/Intel integrated).
      const rendererStr = (gl as THREE.WebGLRenderer).getContext().getParameter(
        (gl as THREE.WebGLRenderer).getContext().VERSION ?? 7938,
      ) ?? '';
      const isLaptopIntel = /Iris|Intel.*UHD/i.test(String(rendererStr));
      const slos = isLaptopIntel ? SLOS_LAPTOP_MID : SLOS_DESKTOP;
      const v = detectorRef.current?.evaluate(result, slos) ?? null;
      lastVerdictRef.current = v;
      console.log('[stress-fase1] RUN COMPLETE', {
        pass: v?.pass,
        reasons: v?.reasons,
        metrics: v?.metrics,
        samplesCount: result.samples.length,
        durationSec: Math.round(result.durationMs / 1000),
        slosApplied: isLaptopIntel ? 'LAPTOP_MID' : 'DESKTOP',
      });
    };
    w.__stressDownload = () => {
      const res = lastResultRef.current;
      const ver = lastVerdictRef.current;
      if (!res) {
        console.warn('[stress-fase1] no hay run previo para descargar');
        return;
      }
      const blob = new Blob([JSON.stringify({ result: res, verdict: ver }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stress-fase1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    console.log('[stress-fase1] handles listos — usa:',
      '__stressSpawn()', '__stressStart()', '__stressStop()',
      '__stressDespawn()', '__stressDownload()');

    // Auto-run — dos activaciones:
    //   (a) Query param `?stress=fase1&duration=300` auto-dispara si detectamos
    //       el param al montar.
    //   (b) Función programática `window.__stressStartAuto({duration, warmup})`
    //       para runners Playwright que invocan después de login + space enter.
    // Ambas publican en `window.__stressResult` y setean `window.__stressDone=true`
    // para polling externo.
    const runAuto = (opts: { duration: number; warmup: number }) => {
      if ((w as Record<string, unknown>).__stressAutoRunning) {
        console.warn('[stress-fase1] auto ya en ejecución — ignorando');
        return;
      }
      const { duration, warmup } = opts;
      console.log(`[stress-fase1] AUTO-RUN iniciado — warmup ${warmup}s, duration ${duration}s`);
      (w as Record<string, unknown>).__stressAutoRunning = true;
      (w as Record<string, unknown>).__stressDone = false;

      setTimeout(() => {
        (w.__stressSpawn as () => void)?.();
        setTimeout(() => {
          (w.__stressStart as () => void)?.();
          setTimeout(() => {
            (w.__stressStop as () => void)?.();
            (w.__stressDespawn as () => void)?.();
            const result = lastResultRef.current;
            const verdict = lastVerdictRef.current;
            (w as Record<string, unknown>).__stressResult = result
              ? JSON.parse(JSON.stringify({ result, verdict }))
              : null;
            (w as Record<string, unknown>).__stressDone = true;
            (w as Record<string, unknown>).__stressAutoRunning = false;
            console.log('[stress-fase1] AUTO-RUN COMPLETE', { pass: verdict?.pass });
          }, duration * 1000);
        }, 1000);
      }, warmup * 1000);
    };

    (w as Record<string, unknown>).__stressStartAuto = (opts?: Partial<{ duration: number; warmup: number }>) => {
      runAuto({ duration: opts?.duration ?? 300, warmup: opts?.warmup ?? 5 });
    };

    // Activación automática por query param (fallback — solo si la URL la conserva).
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stress') === 'fase1') {
      const durationSec = parseInt(urlParams.get('duration') ?? '300', 10);
      const warmupSec = parseInt(urlParams.get('warmup') ?? '10', 10);
      runAuto({ duration: durationSec, warmup: warmupSec });
    }

    return () => {
      delete w.__stressSpawn;
      delete w.__stressDespawn;
      delete w.__stressStart;
      delete w.__stressStop;
      delete w.__stressDownload;
      delete w.__stressStartAuto;
    };
  }, [ensureRefs, gl]);

  return null;
};
