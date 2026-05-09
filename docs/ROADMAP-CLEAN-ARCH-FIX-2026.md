# Roadmap Clean Arch + Bug Fixes — Cowork V3.7 (2026-05-05)

## Estado al 2026-05-05
- TS: 0 errores. Bundle: ok. Vitest: bloqueado por env (WSL/Linux con node_modules instalados desde Windows host).
- 21 findings: 5 P0 / 8 P1 / 5 P2 / 3 P3.
- Migración legacy → src/ al ~26% (32.497 LoC en src/ vs 94.398 LoC en raíces legacy components/, hooks/, lib/, store/, services/).

## Update 2026-05-08 — ITEM 1 cerrado
- Vitest 4.1.2 corre limpio en Windows MINGW64: **191/191 tests pasan en 4.94s**.
- El bloqueo aplicaba a WSL/Linux re-usando node_modules del host Windows. En CI Linux (Vercel) un fresh `npm install` fetcha los bindings correctos automáticamente.
- Workaround documentado para WSL local: `npm install @rollup/rollup-linux-x64-gnu --no-save` (no toca lockfile, no rompe Windows).
- ITEM 1 deja de ser bloqueador. Refactors siguientes pueden validarse con `npm run test:unit`.

## Update 2026-05-08 — ITEM 2 cerrado
- Commit `2151b39` (2026-05-05) ya había sustituido `process.env.NODE_ENV !== 'production'` por `import.meta.env.DEV` en `src/core/application/usecases/GenerarGeometriasMergeadasBuiltinUseCase.ts:163, :183`.
- `import.meta.env.DEV` es funcionalmente equivalente a `!import.meta.env.PROD` (Vite 6 docs: "DEV — boolean indicating whether the app is running in development. Always opposite of import.meta.env.PROD"). Ambos se reemplazan estáticamente en build → tree-shaking efectivo.
- Verificado: `grep -r "process.env" src/` → 0 matches. La capa Application ya no depende de `process.env` (residual técnico aceptado: `import.meta.env` sigue siendo bundler-specific; el ideal Clean Arch — verbose por DI — queda fuera de scope).
- Deuda colateral detectada (no parte de ITEM 2): el archivo importa `@/lib/logger` (línea 19), legacy import. Se aborda en ITEM 12 (lib/ → re-categorizar por adapter target).

## Update 2026-05-08 — ITEM 3 cerrado
- Commits `bad863b` (adapter) + `4ffff61` (HandController refactor) ya migraron MediaPipe HandController a `@mediapipe/tasks-vision`.
- Estructura final:
  - `src/core/infrastructure/mediapipe/HandLandmarkerAdapter.ts` (90 líneas, ≤200 ✓): encapsula `FilesetResolver.forVisionTasks` + `HandLandmarker.createFromOptions` + `detectForVideo` por doc oficial.
  - `src/modules/marketplace/presentation/useHandTracking.ts` (92 líneas, ≤100 ✓): hook con rAF loop + lifecycle del adapter + `onResult` callback (evita re-renders a 30+ FPS).
  - `components/marketplace/HandController.tsx`: gesture state machine + One-Euro filter consumen el hook.
- Deps removidas de `package.json`: `@mediapipe/hands`, `@mediapipe/selfie_segmentation`, `@mediapipe/camera_utils`, `@mediapipe/drawing_utils`. Solo queda `@mediapipe/tasks-vision ^0.10.33`.
- Verificado: `grep "@mediapipe/(hands|selfie_segmentation|camera_utils|drawing_utils)"` → 0 referencias en código (solo doc legacy en `WEBRTC_VIDEO_HUD_DOCUMENTACION.md:508` que describe arquitectura previa).
- E1 (Grupo 3) cerrado por adelantado.
- Pendiente: verificación browser manual de Andrés del flujo de gestos en marketplace.

## Update 2026-05-08 — ITEMs 4 y 5 subsumidos
- **ITEM 4 (P0-02 useStore() sin selector)** y **ITEM 5 (P2-17 subset goloso)** quedan subsumidos por la decisión arquitectónica del 2026-05-05 (múltiples stores por bounded context).
- Verificación grep: `useStore()` (sin selector) → 1 match, en un comentario JSDoc (`components/ui/NotificationToast.tsx:10`), no es código real. `const { ... } = useStore()` → 0 matches.
- Stores ya creados en `src/modules/<feature>/state/`: `useUserStore`, `useWorkspaceStore`, `useChatStore`, `useSpace3DStore`, `usePresenceStore`, `useUIStore`. La descomposición por contexto evitó la necesidad del barrido mecánico de `useShallow`.
- Persisten 58 usos de `useStore` en código legacy (`hooks/`, `components/`, `store/orchestrators/*`). Esa migración cae bajo ITEMs 8/10/11 (legacy → src/), no requiere acción independiente.

## Update 2026-05-08 — ITEM 6 progreso parcial (2/14)
- **Sub-batch 1 cerrado** (`c84b987`): cargos + departamentos.
  - Nuevos: `src/core/domain/ports/{ICargoRepository,IDepartamentoRepository}.ts` + `src/core/infrastructure/adapters/{Cargo,Departamento}SupabaseRepository.ts`.
  - Refactorizados: `components/settings/sections/Settings{Cargos,Departamentos}.tsx` consumen singleton del adapter.
  - tsc OK, vitest 191/191.
- **Sub-batches pendientes** (12 sitios restantes):
  - **Recording hooks** (3): `RecordingManagerV2.tsx` (722 líneas, god-file → tocar con ITEM 15), `useRecording.ts`, `useAISummary.ts`. Necesita extender `IRecordingRepository` con Storage API + `resumenes_ai` upsert/select. **Existe ya `recordingRepository`** — auditar paridad antes de migrar.
  - **Meetings** (2): `ScheduledMeetings.tsx`, `AgregarMiembros.tsx`.
  - **Members** (2): `MiembrosView.tsx`, `lib/autorizacionesEmpresa.ts`.
  - **Settings god-file**: `SettingsZona.tsx` (1523 líneas, defer hasta ITEM 15 split).
  - **Store orchestrators** (3): `bootstrap/avatarLoader`, `bootstrap/userDataLoader`, `userStore` — coordinar con ITEM 8.
  - **Services** (1): `services/chatService.ts` — fusionar con `ChatSupabaseRepository` ya existente (riesgo de duplicación).

## Skills aplicadas
- `clean-architecture-refactor` — criterios duros de performance (30+ FPS), 3 reglas de migración (no legacy / no duplicaciones / todo conectado), capas con paths concretos (Domain/Application/Infrastructure/Modules), patrones obligatorios (Repository, DI, Zustand selectores, R3F separation, LiveKit encapsulado), tamaños 500/200/50/100.
- `official-docs-alignment` — validación contra docs oficiales con versiones reales: React 19.2.3, TypeScript 5.8, Vite 6.2, Three.js 0.182, R3F 9.5, Drei 10.7, Rapier 2.2, LiveKit Client 2.18.9, LiveKit Components 2.9, Supabase JS 2.47, Zustand 5.0.9, MediaPipe Tasks Vision 0.10, Sentry 10.47, Tailwind 3.4.

## Fases ordenadas

### FASE 0 — Quick wins (S, sin riesgo)

#### ITEM 1 — P0-05 vitest baseline
- Esfuerzo: S (~5 min)
- Acción: regenerar native bindings de rollup faltantes en WSL/Linux. Probar primero `npm install --include=optional` (no destructivo); si no resuelve, fallback a `rm -rf node_modules package-lock.json && npm install`.
- Justificación: desbloquea CI local. Sin vitest verde no hay refactor seguro.
- Riesgo: si se regenera lockfile, puede afectar dev en host Windows. Documentar.
- Skills: `official-docs-alignment` (npm bug oficial https://github.com/npm/cli/issues/4828).

#### ITEM 2 — P1-09 process.env → import.meta.env ✅ CERRADO (`2151b39`, 2026-05-05)
- Esfuerzo: S (2 líneas)
- Archivo: `src/core/application/usecases/GenerarGeometriasMergeadasBuiltinUseCase.ts:163, :183`
- Aplicado: `import.meta.env.DEV` (equivalente a `!import.meta.env.PROD` en Vite 6).
- Skills aplicadas: `official-docs-alignment` (Vite 6 env-and-mode), `clean-architecture-refactor` (compromiso pragmático aceptado: Application sigue tocando bundler-specific API; refactor a verbose por DI fuera de scope).
- Verificación: `grep -r "process.env" src/` → 0 matches.

### FASE 1 — Migración crítica (M-L, scope acotado)

#### ITEM 3 — P0-01 MediaPipe HandController → tasks-vision ✅ CERRADO (`bad863b` + `4ffff61`)
- Esfuerzo: M
- Archivos creados/refactorizados:
  - `src/core/infrastructure/mediapipe/HandLandmarkerAdapter.ts` (90 líneas).
  - `src/modules/marketplace/presentation/useHandTracking.ts` (92 líneas).
  - `components/marketplace/HandController.tsx` (consume hook, mantiene gesture state machine + OneEuro filter).
- Deps removidas: `@mediapipe/hands`, `@mediapipe/selfie_segmentation`, `@mediapipe/camera_utils`, `@mediapipe/drawing_utils`. E1 cerrado.
- Skills aplicadas: `official-docs-alignment` (https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker), `clean-architecture-refactor`.
- Pendiente: verificación browser manual del flujo de gestos en marketplace por Andrés.

### FASE 2 — Performance sistémica (L)

#### ITEM 4 — P0-02 useStore() sin selector ✅ SUBSUMIDO (decisión 2026-05-05)
- Decisión arquitectónica: bounded contexts en `src/modules/<feature>/state/` reemplazan al barrido global con `useShallow`.
- Verificado 2026-05-08: `useStore()` (sin selector) → 0 usos reales (solo 1 comentario JSDoc). El consumo legacy de `useStore` cae en ITEMs 8/10/11.

#### ITEM 5 — P2-17 Subset goloso de useStore ✅ SUBSUMIDO (idem ITEM 4)
- Fallback no necesario al haberse aplicado la decomposición por contexto.

### FASE 3 — Patrón Repository Supabase

#### ITEM 6 — P1-06 Migrar 18 sitios con `supabase.from()` directo
- Esfuerzo: L (M por feature)
- Archivos clave: `components/settings/sections/SettingsZona.tsx`, `SettingsDepartamentos.tsx`, `SettingsCargos.tsx`, `components/meetings/recording/RecordingManagerV2.tsx`, `components/meetings/ScheduledMeetings.tsx`, `components/chat/AgregarMiembros.tsx`, `components/MiembrosView.tsx`, `lib/autorizacionesEmpresa.ts`, `store/orchestrators/bootstrap/avatarLoader.ts`, `store/orchestrators/bootstrap/userDataLoader.ts`, `store/orchestrators/userStore.ts`, `services/chatService.ts`, `components/meetings/recording/useRecording.ts`, `components/meetings/recording/useAISummary.ts`.
- Skills: `clean-architecture-refactor` (Repository en `src/core/infrastructure/adapters/`), `official-docs-alignment` (Supabase JS v2 docs — uso correcto del client).
- Modelo a seguir: ya existen 8 repositories en src/ (ProfileSupabaseRepository, ChatSupabaseRepository, etc.) — extender el patrón.

### FASE 4 — Reubicación legacy → src/ (XL)

#### ITEM 7 — P0-03 useLiveKit god-hook → src/modules/realtime-room/presentation
- Esfuerzo: L
- Acción: extraer hook UI delgado (≤100 líneas) en `src/modules/realtime-room/presentation/useRealtimeRoom.ts`. La orquestación pesada ya vive en `SpaceRealtimeCoordinator`, `RealtimeEventBus`, `RealtimeDataPublisher`.
- Riesgo: alto (touch al pipeline tiempo real). Requiere vitest verde (ITEM 1) y verificación browser.
- **Trabajo Clean Arch iniciado:** `f763a23` introduce `src/modules/realtime-room/domain/PresencePositionPolicy.ts` (helper puro) + `tests/unit/realtime-room/presencePositionPolicy.test.ts` (8 tests). Primer pedazo real de la capa `domain` para realtime-room.
- **Refuerzo policy:** `c1d486a` añade `tests/unit/realtime-room/avatarEcsSentinelGuard.test.ts` (9 tests) — segundo refuerzo de la misma policy aplicado al pipeline ECS.

#### ITEM 8 — P0-04 store/ → bounded contexts en src/
- Esfuerzo: L
- Acción: descomponer `useStore` global en stores por bounded context (`useUserStore`, `useWorkspaceStore`, `useChatStore`, `useEditorStore`) en `src/modules/<feature>/state/`. Mantener re-export compat en `store/useStore.ts` durante migración.
- Skills: `clean-architecture-refactor` (Modules + state local). `official-docs-alignment` (Zustand slices pattern).
- Riesgo: alto blast radius. Decisión arquitectónica de Andrés requerida.

#### ITEM 9 — P1-10 services/ → src/core/infrastructure
- Esfuerzo: M
- Mapeo:
  - `services/audioManager.ts` (370) → `src/core/infrastructure/audio/AudioManagerAdapter.ts`.
  - `services/chatService.ts` (131, usa `supabase.from`) → fusionar con `src/core/infrastructure/adapters/ChatSupabaseRepository.ts`. Auditar paridad antes (riesgo de duplicación).
  - `services/geminiService.ts` (128) y `services/monicaContextService.ts` (230) → `src/core/infrastructure/genai/`.

#### ITEM 10 — P1-11 hooks/ → src/modules/<feature>/presentation
- Esfuerzo: L
- Subdirs: `app/`, `auth/`, `chat/`, `customizer/`, `meetings/`, `space3d/`, `workspace/`. Decenas de hooks.
- Modelo: cada hook → `src/modules/<feature>/presentation/useX.ts` (≤100 líneas), use-case puro en `src/core/application/<bc>/`.

#### ITEM 11 — P1-12 components/ → src/modules/<feature>/presentation (XL)
- Esfuerzo: XL (~70k+ LoC, mayor parte del legacy)
- Subdirs: `3d/`, `agente/`, `avatar3d/`, `chat/`, `customizer/`, `games/`, `invitaciones/`, `invitation/`, `layout/`, `marketplace/`, `media/`, `meetings/`, `onboarding/`, `settings/`, `space3d/`, `ui/`.
- Por feature: fragmentar god-files (ver FASE 5) en el camino.

#### ITEM 12 — P2-18 lib/ → re-categorizar por adapter target
- Esfuerzo: M-L
- Subdirs: `avatar3d/`, `ecs/`, `gpu/`, `metrics/`, `monitoring/`, `network/`, `performance/`, `rendering/`, `routing/`, `security/`, `spatial/`.
- Mapeo objetivo:
  - `rendering/`, `gpu/`, `ecs/`, `spatial/` → `src/core/infrastructure/r3f/`.
  - `security/validateEnvKeys`, `env`, `i18n-config` → `src/core/infrastructure/<aspect>/`.
  - `monitoring/`, `metrics/` → `src/core/infrastructure/observability/`.
- Riesgo: validar paridad con archivos ya en src/ (`src/core/infrastructure/textureRegistry.ts`, `src/core/infrastructure/fabricaMaterialesArquitectonicos.ts`) — duplicación latente.

#### ITEM 13 — P2-15 lib/database.types.ts → src/core/infrastructure/supabase
- Esfuerzo: S
- Acción: mover `lib/database.types.ts` (3283 LoC autogenerado) a `src/core/infrastructure/supabase/types.gen.ts`. Actualizar comando `supabase gen types` y referencias.

#### ITEM 14 — P2-16 modules/ shim → eliminar tras alias
- Esfuerzo: S
- Acción: `modules/realtime-room/index.ts` es un shim re-export. Después de migrar imports a un alias `@modules/realtime-room` apuntando a `src/modules/realtime-room/index.ts`, el shim se elimina.

### FASE 5 — Descomposición de god-files en src/

#### ITEM 15 — P1-07 24 componentes >500 líneas
- Esfuerzo: L
- Top: `ChessGame.tsx` 1603, `Scene3D.tsx` 1547, `SettingsZona.tsx` 1514, `VirtualSpace3D.tsx` 1423, `Avatar3DScene.tsx` 1413, `Player3D.tsx` 1279, `GrabacionesHistorial.tsx` 1042, `CalendarPanel.tsx` 1013, `RecordingManager.tsx` 990, `StaticObjectBatcher.tsx` 913, `GLTFAvatar.tsx` 883, `VirtualSpace.tsx` 852, `SharedMediaDeviceControls.tsx` 843, `AnalysisDashboard.tsx` 780, `ObjetoEscena3D.tsx` 766, `OnboardingCreador.tsx` 762, `ScheduledMeetings.tsx` 759, `RecordingManagerV2.tsx` 722, `PlacementHUD.tsx` 694, `MeetingControlBar.tsx` 686, `ExploradorPublico3D.tsx` 620, `MeetingReactionParticleLayer.tsx` 558, `MeetingRooms.tsx` 514, `MeetingRoomContent.tsx` 511.
- Acción: descomposición por responsabilidad. R3F: separar lógica declarativa de lógica de juego (use-cases en application). UseFrame solo mover, no decidir.

#### ITEM 16 — P1-08 18+ hooks >100 líneas
- Esfuerzo: L
- Top: `useMeetingRealtimeState.ts` 1224, `useLiveKit.ts` 1205, `usePresenceChannels.ts` 921, `useCalendarPanel.ts` 794, `useMeetingMediaBridge.ts` 753, `useSpace3D.ts` 722, `useAdvancedEmotionAnalysis.ts` 713, `useCombinedAnalysis.ts` 651, `useRecordingManager.ts` 590, `useMeetingAccess.ts` 588, `useEspacioObjetos.ts` 540, `useProximity.ts` 525.
- Acción: extraer use-cases puros a `src/core/application/<bc>/`, hook como adaptador delgado.

#### ITEM 17 — P2-14 archivos en src/ ya >500 líneas
- Esfuerzo: M-L
- Lista: `src/modules/realtime-room/application/SpaceMediaCoordinator.ts` (889), `src/core/infrastructure/adapters/ChatSupabaseRepository.ts` (803), `MeetingSupabaseRepository.ts` (736), `RecordingSupabaseRepository.ts` (712), `MeetingAccessSupabaseRepository.ts` (682), `GeometriaProceduralParedesAdapter.ts` (645), `SpaceRealtimeCoordinator.ts` (579).
- Acción: partir repositories por sub-bounded context (ChatMessagesRepository, ChatChannelsRepository, ChatPresenceRepository). Coordinators por capability.

### FASE 6 — Cleanup final (Grupo 3, requiere aprobación de Andrés)

#### ITEM 18 — Eliminar 4 deps MediaPipe legacy
- Tras ITEM 3 verificado en browser: quitar `@mediapipe/hands`, `@mediapipe/selfie_segmentation`, `@mediapipe/camera_utils`, `@mediapipe/drawing_utils` de `package.json`.

#### ITEM 19 — Eliminar carpetas legacy
- Después de ITEMS 7-13: eliminar `store/`, `services/`, `hooks/`, `components/`, `lib/` raíz.

#### ITEM 20 — Eliminar shim modules/
- Después de ITEM 14: eliminar `modules/`.

### FASE 7 — Cosmético

#### ITEM 21 — P3-19, P3-20, P3-21
- P3-19: actualizar comentario `sRGBEncoding` → `SRGBColorSpace` en `src/core/infrastructure/adapters/TextureAtlasCanvasAdapter.ts:20`.
- P3-20: tras ITEM 8, revertir imports `@/store/useStore` desde use-cases en src/.
- P3-21: documentar excepción `process.env` permitido en `vite.config.*`, `playwright.config.*`, `tests/**/scripts/*`, `scripts/**` en la skill `official-docs-alignment`.

## Cronograma sugerido
- **Semana 1**: FASE 0 + FASE 1 (ITEMs 1-3).
- **Semana 2-3**: FASE 2 + FASE 3 (ITEMs 4-6).
- **Semana 4-8**: FASE 4 (ITEMs 7-14, masa grande).
- **Semana 9**: FASE 5 (ITEMs 15-17).
- **Semana 10**: FASE 6 con aprobaciones de Andrés (ITEMs 18-20).
- **Semana 11**: FASE 7 + cierre (ITEM 21).

## Decisiones tomadas (2026-05-05)

1. **Store → múltiples stores por bounded context (resuelve ITEM 4 + ITEM 8).** Descomponer `store/` legacy en `useUserStore`, `useWorkspaceStore`, `useChatStore`, `useMeetingStore`, `useSpace3DStore`, etc., en `src/modules/<feature>/state/`.
   - Justificación: performance natural sin necesidad de `useShallow` global, encaja con Clean Arch, respeta criterio duro de 30+ FPS en hardware básico.
   - Cross-store communication: `useUserStore` como root + otros stores leen pero no mutan.
   - Impacto en ITEM 4 (P0-02 useStore sin selector): el barrido mecánico con `useShallow` queda subsumido por la descomposición. Solo se aplica `useShallow` en el remanente que aún consuma stores multi-campo durante la transición.

2. **`@livekit/components-react` + `@livekit/components-styles` → MANTENER (NO eliminar).** Grep confirma 9 archivos con imports activos en `components/meetings/videocall/`:
   - `VideoLayoutManager`, `MeetingRoom` (×2), `MeetingRoomContent`, `MeetingControlBar`, `CustomParticipantTile`, `MeetingAudioRenderer`, `useMeetingRealtimeState`, `useOptimizacionSalaGrande`, `useMeetingLayoutSnapshot`.
   - Sale del Grupo 3 (no candidato a eliminación).

3. **`modules/` shim → eliminar YA + path alias (FASE propia).** Crear `tsconfig.json` path alias `@modules/realtime-room` → `src/modules/realtime-room/` + codemod de imports. Bajo riesgo (1 archivo shim + ~30 imports a reescribir). Adelanta el ITEM 14 a una fase independiente.

4. **`lib/` legacy → re-categorizar por adapter target (NO consolidar en shared/).** Mapping concreto que reemplaza al ITEM 12:
   - `lib/rendering/`, `lib/gpu/`, `lib/ecs/`, `lib/spatial/` → `src/core/infrastructure/r3f/`
   - `lib/avatar3d/` → `src/core/infrastructure/r3f/avatar/`
   - `lib/security/` → `src/core/infrastructure/security/`
   - `lib/monitoring/`, `lib/metrics/` → `src/core/infrastructure/monitoring/`
   - `lib/network/`, `lib/routing/` → `src/core/infrastructure/network/`
   - `lib/performance/` → `src/core/shared/performance/` (genuinamente cross-cutting)
   - Validar paridad con archivos ya existentes en `src/` antes de mover (duplicados latentes en `textureRegistry.ts` y `fabricaMaterialesArquitectonicos.ts`).

## Regla LiveKit dual (videocall)

> Aplica a todo código que toque LiveKit. Marcado para incorporar a la skill `clean-architecture-refactor` cuando se actualice.

| Layer | Qué usa | Por qué |
|---|---|---|
| UI declarativa videocall | `@livekit/components-react` (`<LiveKitRoom>`, `<ParticipantTile>`, `<ControlBar>`, `<TracksList>`) | Pre-built, accesible, mantenido oficialmente |
| State / hooks | Hooks oficiales (`useRoom`, `useParticipant`, `useTracks`, `useParticipants`, `useLiveKitRoom`) | LiveKit recomienda explícitamente — no reimplementar |
| Infrastructure custom | `livekit-client` en `src/core/infrastructure/livekit/` | Solo para features no expuestas: audio espacial 3D, suscripción selectiva por proximidad, métricas custom, advanced lifecycle |
| Efectos cámara | `@livekit/track-processors` | Único proveedor de blur/virtual-bg/mirror — NUNCA eliminar |
| Regla dura | NO remount `<LiveKitRoom>` al cambiar props | Causa `Client initiated disconnect errors` — UX crítica. Usar memo/keys estables |

**Impacto en P0-03 (god-hook `useLiveKit.ts` 1205 líneas):** buena parte se ELIMINA usando hooks oficiales — el esfuerzo total se reduce significativamente. Solo audio espacial + proximidad + métricas custom queda en `src/core/infrastructure/livekit/`.

## Decisiones aún pendientes

1. **TASK B (vitest baseline) — ¿regenerar lockfile?**: el lockfile actual fue generado en host Windows. Regenerar en WSL/Linux desbloquea vitest local pero podría romper dev en host Windows. Alternativa: instalar solo el binding faltante con `npm install @rollup/rollup-linux-x64-gnu --no-save` (no toca lockfile, solo el dev de WSL).

## Items para Grupo 3 (requieren autorización explícita de Andrés)

- ~~**E1**: 4 deps `@mediapipe/{hands,selfie_segmentation,camera_utils,drawing_utils}`~~ — ✅ removidas (ver ITEM 3 cerrado).
- **E2**: `hooks/space3d/useLiveKit.ts` (después de ITEM 7).
- **E3**: Carpeta `store/` completa (después de ITEM 8).
- **E4**: Carpeta `services/` completa (después de ITEM 9).
- **E5**: Carpeta `hooks/` completa (después de ITEM 10).
- **E6**: Carpeta `components/` completa (después de ITEM 11).
- **E7**: Carpeta `modules/` (después de ITEM 14).
- **E8**: `lib/database.types.ts` (después de ITEM 13).
- **E9**: Carpeta `lib/` completa (después de ITEM 12).
- **E10**: `node_modules` y `package-lock.json` LOCALES — refresh de instalación, no eliminación de código del producto. Si se opta por la opción destructiva del ITEM 1.

## Riesgos transversales

- **Working tree dirty** (130+ archivos WIP en `feature/terreno-rios`): cualquier merge debe coordinarse con el WIP de Andrés.
- **Sin browser testing**: ITEMs que tocan UI (especialmente ITEM 3 HandController, ITEM 7 useLiveKit, ITEMs 11/15 god-components R3F) requieren verificación manual de Andrés tras merge.
- **Vitest baseline**: dependencia transversal de ITEM 1. Cualquier refactor sin vitest verde es ciego.
- **Cross-platform lockfile**: si Andrés desarrolla en Windows y CI/Vercel en Linux, el lockfile no debería regenerarse desde solo una plataforma.

## Bugfixes tácticos 2026-05-07 / 2026-05-08 (deuda extra)

| SHA | Subject | Archivo legacy tocado | ITEM relacionado |
|---|---|---|---|
| `e5d9d83` | fix limpiarLivekit identity | `hooks/space3d/useLiveKit.ts` + `src/modules/realtime-room/presentation/*` | 7 |
| `c4ae8c9` | replay subscribed tracks | `hooks/space3d/useLiveKit.ts` + `src/modules/realtime-room/*` | 7 |
| `8f3bfe4` | bump livekit-client 2.18.9 | `package.json` + `package-lock.json` | n/a (versions) |
| `bef39f8` | movement packets siempre | `hooks/space3d/useBroadcast.ts`, `useSpace3D.ts` | 10 + 7 |
| `4e52156` | auth (0,0) sentinel | `store/slices/authSlice.ts` | 8 |
| `f763a23` | presence sentinel + force-sync | `hooks/workspace/usePresence*.ts`, `hooks/space3d/useChunkSystem.ts` + `src/modules/realtime-room/domain/*` (NEW) | 7/10 |
| `4401657` | getPublishedVideoTrack identity | `src/modules/realtime-room/presentation/useLiveKitLocalPublishing.ts` | 7 |
| `c1d486a` | unify remote-avatar position | `lib/ecs/AvatarECS.ts` | 12 |
| `6e804d3` | socket recovery heartbeats | `lib/supabase.ts` | 12 |
| `b685d1d` | preservar animStates | `lib/ecs/AvatarSystems.ts` | 12 |
| `1cc2f2c` | stale-position on peer join | `hooks/space3d/useProximity.ts` + `src/modules/realtime-room/presentation/useLiveKitRoomLifecycle.ts` | 7 + 10 |
| `04e667d` | delay 1s welcome-broadcast | `src/modules/realtime-room/presentation/useLiveKitRoomLifecycle.ts` | 7 |

(Excluidos `379f97b` y `739031d` por ser revert chain sin impacto neto.)

> **Lectura del impacto en migración:** ninguno de estos commits cierra un ITEM del roadmap; son parches tácticos sobre legacy mientras se prepara la migración a `src/`. Aumentan la superficie a migrar en `hooks/space3d/*`, `lib/ecs/*`, `store/slices/authSlice.ts` y `hooks/workspace/*`. Re-evaluar el effort estimado de los ITEMs 7, 8, 10 y 12 a la luz de esta deuda extra.
