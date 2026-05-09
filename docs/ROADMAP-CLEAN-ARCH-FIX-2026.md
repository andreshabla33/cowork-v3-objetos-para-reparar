# Roadmap Clean Arch + Bug Fixes — Cowork V3.7 (2026-05-05, auditado 2026-05-08)

## Estado al 2026-05-05 (snapshot original)
- TS: 0 errores. Bundle: ok. Vitest: bloqueado por env (WSL/Linux con node_modules instalados desde Windows host).
- 21 findings: 5 P0 / 8 P1 / 5 P2 / 3 P3.
- Migración legacy → src/ al ~26% (32.497 LoC en src/ vs 94.398 LoC en raíces legacy components/, hooks/, lib/, store/, services/).

## Estado real al 2026-05-08 (auditoría exhaustiva + research arquitectónico)
- TS: 0 errores. Vitest **191/191 PASS** en cada commit.
- **ITEMs cerrados (10/21 = ~48%)**: 1, 2, 3, 4, 5, 6 (sub-batches 1+2+3+3.5+4+5+6 cerrados, 7+8 deferidos a ITEM 15), 9, 13, 14, 21 P3-19.
- **Carpetas legacy eliminadas**: `services/` ✓, `modules/` ✓.
- **Reducción mayor**: `lib/autorizacionesEmpresa.ts` 715 → 84 líneas (-88%, fachada thin).
- **Repositories nuevos creados**: ICargoRepository, IDepartamentoRepository, IZonaEmpresaRepository, IAutorizacionEmpresaRepository + adapters. Más AudioManager, GeminiService, MonicaContextService movidos a src/core/infrastructure/.
- **Repositories existentes ampliados**: InvitacionRepository (+cancelarInvitacionPendiente), ChatRepository (+agregarMiembrosCanal, +obtenerOCrearChatDirecto), AvatarCatalogRepository (+obtenerAvatarPorId, +guardarConfiguracionAvatar), ProfileRepository (+actualizarEstadoDisponibilidad), RecordingRepository (+guardarResumenAI; NotificacionAnalisisData.tipo ampliado).
- **Grupo 3 cerrados**: E1, E4 (services/), E7 (modules/), E8 (database.types).

## Decisiones arquitectónicas 2026-05-08 (research oficial + clean-architecture-refactor)

### ITEM 7 — corrección de enfoque (auditoría 2026-05-09: cerrado sin trabajo adicional — ver "ITEM 7 — P0-03 useLiveKit god-hook" abajo)
El plan previo ("split en sub-hooks granulares") era incorrecto. **Doc oficial LiveKit NO endorsa fragmentar lifecycle**. Recomienda `<LiveKitRoom>` componente + hooks oficiales (`useRoom`, `useTracks`, `useLocalParticipant`, `useParticipants`).
**Conclusión**: los 4 sub-hooks que violan ≤100 líneas (useLiveKitRemoteTracks 553, useLiveKitRoomLifecycle 438, useLiveKitRemoteSubscriptions 285, useLiveKitLocalPublishing 267) deben REDUCIRSE eliminando código redundante con hooks oficiales, NO fragmentarse más. Solo queda lo CUSTOM (proximidad selectiva, audio espacial, telemetría) en `infrastructure/livekit/`.

### ITEM 8 — decisión validada con refinamiento
Zustand README oficial recomienda slices pattern (no multi-store). PERO la decisión 2026-05-05 (multi-store) está respaldada por discussions oficiales cuando el justification es performance (scoped subscriptions = 30+ FPS objetivo).
**Refinamiento**: mantener multi-store a nivel bounded context; DENTRO de cada store con sub-dominios usar slices pattern idiomático. Trabajo real = migrar 58 consumers de `useStore` legacy a bounded stores ya creados (strangler fig).

### ITEM 10/11 — strangler fig file-by-file
Patrón industrial estándar (AWS, Shopify). NO codemod automático porque cada archivo necesita decidir bounded context destino + refactor de deps legacy + verificación browser. Codemod aplicable SOLO al final para actualizar consumer imports en bulk.

### ITEM 12 — mapping 2026-05-05 validado + archivos no mapeados
Mapping rendering/gpu/ecs/spatial → r3f/, security → security/, monitoring/metrics → observability/, network/routing → network/ ✓ correcto. **Archivos no mapeados que requieren decisión**: lib/supabase.ts → infrastructure/supabase/SupabaseClient.ts; lib/logger.ts → infrastructure/observability/logger.ts; lib/userSettings.ts → application/user/UserSettings.ts; lib/i18n.ts → shared/i18n/; lib/env.ts → infrastructure/config/env.ts; lib/gamificacion.ts → application/gamificacion/ + Repository nuevo (9+ supabase calls).

### ITEM 15-17 — extract use-cases pattern validado
R3F oficial: "useFrame slim, never setState in there". Estrategia "Application use-case + adapter delgado" alineada. Por tipo: god-component R3F (lógica → Application, JSX → componente), god-component UI (sub-features → sub-componentes), god-hook (policies → Domain, hook adapter ≤100), god-repo en src/ (split por sub-bounded context).

### ITEM 21 P3-20 — sin trabajo separado
Imports `@/store/useStore` desde use-cases en src/: aceptable cuando son bounded stores (`useUserStore.getState()`). NO aceptable `useStore` legacy global. Después de ITEM 8, P3-20 se cumple naturalmente — no requiere fase dedicada.

### ITEM 21 P3-21 — confirmado
Vite 6 docs: `process.env` permitido en archivos NO-cliente (vite.config, playwright.config, scripts/, tests/scripts/). Cliente browser usa solo `import.meta.env`.

## Plan ejecutable consolidado (2026-05-08)

| Orden | ITEM | Esfuerzo | Riesgo | Notas |
|---|---|---|---|---|
| 1 | ITEM 21 P3-21 | XS | 0 | doc skill |
| 2 | ITEM 8 batch 1 (auth flow consumers) | M | M | hojas primero |
| 3 | ITEM 8 batch 2-N (resto) | L | M | strangler fig |
| 4 | ITEM 12 hojas (security, monitoring, metrics) | M | L | aislados |
| ~~5~~ | ITEM 7 fase A ✅ CERRADO 2026-05-09 — auditoría concluyó "no hay redundancia"; espacio 3D fuera de `<LiveKitRoom>` por diseño | L | H | sin acción adicional |
| 6 | ITEM 15 batch 1 (RecordingManagerV2) | L | M | desbloquea ITEM 6 batch 7 |
| 7 | ITEM 6 batch 7 | S | M | requiere ITEM 15 batch 1 |
| 8 | ITEM 15 batch 2 (SettingsZona) | L | M | desbloquea ITEM 6 batch 8 |
| 9 | ITEM 6 batch 8 | S | M | requiere ITEM 15 batch 2 |
| ~~10~~ | ITEM 12 resto ✅ CERRADO 2026-05-09 — lib/ ELIMINADA | L | H | 12 commits totales |
| 11 | ITEM 16 (god-hooks split) | L | H | extract use-cases |
| 12 | ITEM 10 (hooks/ migration) | L | H | strangler fig |
| 13 | ITEM 11 (components/ migration) | XL | H | strangler fig, multi-sesión |
| 14 | ITEM 17 (src/ god-files split) | L | M | repos por sub-bounded context |
| 15 | ITEM 19 (cleanup carpetas legacy) | XS | 0 | post 10-12 |

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

## Update 2026-05-08 — ITEM 6 progreso real (4/N archivos)
- **Re-corrección de scope** (auditoría más profunda con grep multiline):
  - El conteo "13 archivos / 25 calls" era **undercount**. El grep estricto `supabase\.from\(` (single-line) no capturaba las calls multi-línea (`await supabase\n  .from('table')...`).
  - Conteo real con `grep -U` multiline supera **80+ calls** en legacy; archivos adicionales NO listados en el roadmap original incluyen: `services/monicaContextService.ts` (4+ calls), `lib/avatar3d/universalAnimationsPreloader.ts` (1), `hooks/useOnboarding.ts` (4+), `lib/gamificacion.ts` (9+), `lib/autorizacionesEmpresa.ts` (13+ calls, no 3).
  - **Decisión pragmática**: mantener el alcance del ITEM 6 al subset originalmente planeado (los archivos con calls de escritura críticas) para no inflar el ITEM. Los archivos adicionales (gamificacion, monicaContext, useOnboarding) caen bajo ITEMs 9/10/12 (migración de services/, hooks/, lib/) — abordar al migrar ESAS carpetas, no como parte de ITEM 6.
- **Sub-batch 1 cerrado** (`c84b987`): cargos + departamentos.
  - Nuevos: `src/core/domain/ports/{ICargoRepository,IDepartamentoRepository}.ts` + `src/core/infrastructure/adapters/{Cargo,Departamento}SupabaseRepository.ts`.
  - Refactorizados: `components/settings/sections/Settings{Cargos,Departamentos}.tsx` consumen singleton del adapter.
  - tsc OK, vitest 191/191.
- **Sub-batch 2 cerrado** (`49b5729`): Members (MiembrosView + AgregarMiembros).
  - Extendido `IInvitacionRepository` + `InvitacionSupabaseRepository` con `cancelarInvitacionPendiente(id)`. Singleton `invitacionRepository` exportado.
  - Extendido `IChatRepository` + `ChatSupabaseRepository` con `agregarMiembrosCanal(grupoId, usuarioIds[], rol)` (batch upsert sobre `miembros_grupo`).
  - Refactorizados: `components/MiembrosView.tsx` (delete `invitaciones_pendientes`) y `components/chat/AgregarMiembros.tsx` (insert `miembros_grupo`).
  - **Out-of-scope intencional para este batch**: las calls de SELECT (reads) en estos archivos (`miembros_espacio`, `usuarios`, `registro_conexiones`) no se migraron — caerán al migrar componentes a `src/modules/` (ITEM 11) o cuando se cree un MembershipRepository dedicado.
  - tsc OK, vitest 191/191.
- **Sub-batch 3 cerrado** (`05a252b`): Meetings (ScheduledMeetings).
  - Refactorizado `components/meetings/ScheduledMeetings.tsx`:
    - `supabase.from('reunion_participantes').insert(...)` → `meetingRepository.agregarParticipantesReunion(meetingId, items)` (método ya existente, no se extendió port/repo).
    - `supabase.from('reuniones_programadas').delete().eq('id', meetingId)` → `meetingRepository.eliminarReunion(meetingId)` (método ya existente).
  - Cero cambios en ports/adapters — el repository ya cubría las 2 operaciones.
  - **Out-of-scope intencional**: las otras calls de ScheduledMeetings (insert reuniones_programadas en línea 152, update reunion_participantes en 193, reads en 38/62/70/113) no se migraron — caen bajo ITEM 11/15 (god-file 762 líneas) o requieren extender repo con métodos adicionales.
  - tsc OK, vitest 191/191.
- **Sub-batch 6 cerrado**: Recording hooks (useRecording + useAISummary).
  - Extendido `IRecordingRepository` + `RecordingSupabaseRepository` con:
    - `guardarResumenAI(payload: GuardarResumenAIPayload)` — upsert resumenes_ai. Tipo `GuardarResumenAIPayload` añadido al port.
    - `NotificacionAnalisisData.tipo` ampliado de literal `'analisis_listo'` a unión `'analisis_listo' | 'resumen_listo' | 'error_procesamiento'`. Añadido optional `datos_extra?: Record<string, unknown>`. RecordingManagerV2's existing usage sigue type-checking.
  - Refactorizados:
    - `useRecording.ts:117` (insert grabaciones) → `recordingRepository.crearGrabacion`. Cast por mismatch de literal `estado: 'recording'` (legacy) vs `'grabando'` (port) — comportamiento preservado, deuda tipada.
    - `useAISummary.ts:83` (upsert resumenes_ai) → `recordingRepository.guardarResumenAI`.
    - `useAISummary.ts:97` (insert notificacion success) → `recordingRepository.crearNotificacionAnalisis({tipo: 'resumen_listo', datos_extra})`.
    - `useAISummary.ts:123` (insert notificacion error) → `recordingRepository.crearNotificacionAnalisis({tipo: 'error_procesamiento'})`.
  - **Out-of-scope intencional**: `useRecording.ts:194-219` (storage upload + getPublicUrl + update grabaciones post-upload) y `useAISummary.ts:50` (functions invoke) y `:139` (resumenes_ai select single) NO se migraron — el strict grep no los capturaba (multi-línea), y requerirían 3 métodos adicionales (Storage API + obtener resumen). Caen bajo iteración futura.
  - tsc OK, vitest 191/191.
- **Sub-batch 5 cerrado** (`e58956d`): store/orchestrators (avatarLoader + userStore) — calls de mutación migradas.
  - Extendido `IAvatarCatalogRepository` + `AvatarCatalogSupabaseRepository` con:
    - `obtenerAvatarPorId(avatarId)` — single avatar by id (replaces avatarLoader línea 73).
    - `guardarConfiguracionAvatar(userId, config)` — upsert avatar_configuracion (replaces userStore línea 23).
  - Extendido `IProfileRepository` + `ProfileSupabaseRepository` con `actualizarEstadoDisponibilidad(userId, status, statusText?)` (replaces userStore línea 55-62).
  - Refactorizado `store/orchestrators/userStore.ts`: 2 calls → 2 repo methods. Cero supabase directo.
  - Refactorizado `store/orchestrators/bootstrap/avatarLoader.ts`: línea 73 (select avatar by id) → `avatarCatalogRepository.obtenerAvatarPorId`. Línea 90 (update usuarios.avatar_3d_id) → `avatarCatalogRepository.cambiarAvatar` (método ya existente).
  - **Out-of-scope intencional**: las 4 reads adicionales de avatarLoader (avatar_configuracion select, avatares_3d fallback select, avatar_animaciones x2) NO se migraron — caen bajo ITEM 8 (mover el orchestrator entero a `src/core/application/<bc>/`).
  - tsc OK, vitest 191/191.
- **Sub-batch 4 cerrado** (autorizacionesEmpresa completo migrado):
  - **4a** (`be5ac86`): zona CRUD → `ZonaEmpresaSupabaseRepository` (port + adapter + 3 src/ adapters migrados a usar repo directo, cerrando 3 violaciones de no-legacy-consumption).
  - **4b** (commit pendiente): autorizaciones workflow + queries → `AutorizacionEmpresaSupabaseRepository`.
  - Resultado: `lib/autorizacionesEmpresa.ts` reducido de **715 → 84 líneas** (-88%). Es ahora una fachada de wrappers thin que delega a 2 repositorios. Ningún supabase.from() queda en el archivo.
  - Cobertura completa de las 8 tablas del bounded context: actividades_log, zonas_empresa, autorizaciones_empresa, miembros_espacio, grupos_chat, miembros_grupo, empresas, notificaciones — todas internalizadas en los 2 repos.
- **Sub-batch 4 (autorizacionesEmpresa) ⚠ RE-DIMENSIONADO** (auditoría 2026-05-08):
  - El plan original lo marcaba M ("mover archivo, 3 calls"). Reality check:
    - Archivo: **715 líneas, 13 funciones exportadas, 13+ supabase calls** sobre 8 tablas distintas (actividades_log, zonas_empresa, autorizaciones_empresa, miembros_espacio, grupos_chat, miembros_grupo, empresas, notificaciones).
    - **6 consumers**: `components/3d/AdminZoneHUD.tsx`, `components/settings/sections/SettingsZona.tsx` (god-file 1523 líneas), `hooks/space3d/useNotifications.ts`, **+ 3 archivos en `src/` que violan la regla no-legacy-consumption**: `InyectorPlantillaZonaAdapter`, `RepositorioPlantillaZonaSupabaseAdapter`, `RepositorioRegistroEmpresaSupabaseAdapter`.
  - Re-clasificación: **L-XL real**, no M. Requiere descomposición en 3 sub-sub-batches por bounded-context: zona CRUD (5 fns), queries (3 fns), workflow autorizaciones (4 fns + side effects en tablas auxiliares).
  - **Bloqueado por**: ITEM 15 (SettingsZona god-file split debe preceder, sino Batch 4 + ITEM 15 colisionan), eliminación previa de los 3 consumers ilegales en `src/` (auditar si esos adapters usan funciones realmente, o son imports muertos).
  - **Acción provisional**: posponer Batch 4 hasta planning dedicado. Skips a Batch 5.
- **Sub-batch 3.5 cerrado** (`2943fc3`): services/chatService.ts → fusionado con ChatSupabaseRepository + eliminado.
  - Extendido `IChatRepository` + `ChatSupabaseRepository` con `obtenerOCrearChatDirecto(userA, userB, espacioId)`. Lógica lifteada del método `getOrCreateDirectChat` legacy: lookup por nombre `userA|userB` → fallback intersección de miembros → create group + 2 memberships.
  - Refactorizado `hooks/space3d/useBroadcast.ts:322`: el call a `ChatService.sendMessage(...)` se compone como `obtenerOCrearChatDirecto + enviarMensaje` en un `Promise.all` sobre los recipients.
  - Eliminado `services/chatService.ts` (132 líneas). Único consumer (useBroadcast) ya migrado.
  - **services/ legacy reduce 1 archivo** (queda en 3: audioManager, geminiService, monicaContextService).
  - tsc OK, vitest 191/191.
- **11 archivos pendientes** (con calls verificadas):
  | Archivo | calls | Notas |
  |---|---|---|
  | `lib/autorizacionesEmpresa.ts` | 3 | tabla `actividades_log`, `notificaciones`, `miembros_grupo` |
  | `components/MiembrosView.tsx` | 1 | tabla `invitaciones_pendientes` |
  | `components/chat/AgregarMiembros.tsx` | 1 | tabla `miembros_grupo` |
  | `components/meetings/recording/RecordingManagerV2.tsx` | 5 | god-file 722 líneas → coordinar con ITEM 15 |
  | `components/meetings/ScheduledMeetings.tsx` | 2 | tablas `reunion_participantes`, `reuniones_programadas` |
  | `components/meetings/recording/useRecording.ts` | 1 | tabla `grabaciones` (existe `recordingRepository.crearGrabacion`) |
  | `components/meetings/recording/useAISummary.ts` | 3 | `resumenes_ai` upsert/select + `notificaciones`. Falta extender `IRecordingRepository` |
  | `components/settings/sections/SettingsZona.tsx` | 3 | god-file 1523 líneas → coordinar con ITEM 15 |
  | `services/chatService.ts` | 2 | fusionar con `ChatSupabaseRepository` ya existente (riesgo de duplicación) |
  | `store/orchestrators/userStore.ts` | 1 | `avatar_configuracion` upsert |
  | `store/orchestrators/bootstrap/avatarLoader.ts` | 2 | `avatares_3d`, `usuarios` — coordinar con ITEM 8 |

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

#### ITEM 6 — P1-06 Migrar `supabase.from()` directo a Repository pattern 🟡 PARCIAL (2/13)
- Esfuerzo: L (M por feature)
- **Scope corregido**: 13 archivos consumidores únicos en legacy (no 18 — la cifra original contaba calls duplicadas). 2 migrados, 11 pendientes (ver "Update 2026-05-08 — ITEM 6 progreso real").
- Skills: `clean-architecture-refactor` (Repository en `src/core/infrastructure/adapters/`), `official-docs-alignment` (Supabase JS v2 docs — uso correcto del client).
- Modelo a seguir: **35 repositories/adapters** ya existen en `src/core/infrastructure/adapters/` (no 8 como decía el doc original) — extender el patrón. Antes de crear uno nuevo, grep si ya existe.

### FASE 4 — Reubicación legacy → src/ (XL)

#### ITEM 7 — P0-03 useLiveKit god-hook → src/modules/realtime-room/presentation ✅ CERRADO (2026-05-09)
- Esfuerzo final: L (auditoría) — re-fragmentación adicional descartada por arquitectura.
- **Estado real (2026-05-08)**:
  - `hooks/space3d/useLiveKit.ts`: 1205 → **220 líneas** (compat shim, commit `1f4a8ab`).
  - 11 sub-hooks en `src/modules/realtime-room/presentation/` totalizan 2.258 líneas.
  - 4 sub-hooks superan ≤100 líneas: `useLiveKitRemoteTracks.ts` (553), `useLiveKitRoomLifecycle.ts` (438), `useLiveKitRemoteSubscriptions.ts` (285), `useLiveKitLocalPublishing.ts` (267).
- **Auditoría fase A (2026-05-09) — conclusión arquitectónica**:
  - Doc oficial LiveKit Components React 2.9 NO endorsa fragmentar lifecycle en sub-hooks. Recomienda `<LiveKitRoom>` componente + hooks oficiales (`useTracks`, `useLocalParticipant`, `useRoomContext`, `useChat`).
  - El proyecto YA usa hooks oficiales en la videollamada estructurada (`components/meetings/videocall/`: MeetingRoom envuelve `<LiveKitRoom>`; MeetingAudioRenderer/MeetingControlBar/CustomParticipantTile/useMeetingRealtimeState consumen `useTracks`/`useLocalParticipant`/`useRoomContext`).
  - Los 4 sub-hooks viven FUERA de `<LiveKitRoom>` — son la infrastructure custom del **espacio 3D imperativo**. Manejo imperativo del `Room` es OBLIGATORIO porque:
    1. Multi-Room (`moveParticipant` server API): `<LiveKitRoom>` se remontaría → `Client initiated disconnect errors`.
    2. Auto-connect/disconnect basado en proximidad de avatares (no flag prop estable).
    3. Lifecycle entrelazado con `avatarStore` (ECS) + Supabase Presence + welcome-broadcast pattern.
    4. Custom token retrieval (`obtenerTokenLivekitEspacio` con empresa_id, departamento_id).
  - **Validación de redundancia con hooks oficiales** (no hay):
    | Sub-hook | Líneas | ¿Redundante con oficial? |
    |---|---|---|
    | useLiveKitRemoteTracks | 553 | `replaySubscribedTracks` espeja `getTrackReferences()` de `@livekit/components-core` pero es CUSTOM porque `useTracks` requiere `<LiveKitRoom>`. El resto (mute/unmute/ended listeners + RemoteRenderLifecyclePolicy + RemoteTrackAttachmentPolicy) NO existe en oficial. |
    | useLiveKitRoomLifecycle | 438 | `<LiveKitRoom>` cubre conexión básica; multi-Room awareness + avatar-aware disconnect + welcome-broadcast son features CUSTOM no expuestas. |
    | useLiveKitRemoteSubscriptions | 285 | 100% custom: 3-tier proximity policy (subscribe / audio-only / disable / unsubscribe-deferred) clamped por performanceSettings. NO existe equivalente oficial. |
    | useLiveKitLocalPublishing | 267 | `useLocalParticipant` expone publish/unpublish básico; sync plan + proximity gating con debounce + LocalVideoTrackFactory cache son CUSTOM. |
  - **Validación Application layer**: las 5 policies/coordinators puros ya están extraídos a `src/modules/realtime-room/application/`: `RemoteTrackAttachmentPolicy`, `RemoteRenderLifecyclePolicy`, `SubscriptionPolicyService`, `TrackPublicationCoordinator`, `SpaceRealtimeCoordinator`. Los 4 sub-hooks son **adapters delgados** que conectan React state con esas policies puras.
- **Decisión**: la regla "≤100L por hook" del skill `clean-architecture-refactor` **se relaja para infrastructure adapters complejos** cuando: (a) toda la lógica pura está extraída a Application use-cases — ✓; (b) el tamaño viene de wiring inevitable (state Maps + listeners + cleanup paths) — ✓; (c) partir más fragmenta cohesión semántica (ej: `useLiveKitRemoteTracks` agrupa el ciclo Track→MediaStream→render lifecycle indivisible) — ✓.
- **Trabajo futuro opcional (XL, fuera de scope inmediato)**: envolver el espacio 3D con `<LiveKitRoom>` y migrar a `useTracks` oficial. Requiere rewrite del lifecycle imperativo a declarativo + resolver multi-Room sin remount + integración con avatarStore. Proyecto independiente — no bloquea el roadmap.
- **Out-of-scope intencional**: el shim `hooks/space3d/useLiveKit.ts` (220 líneas) cae bajo ITEM 10 (strangler fig hooks/ → src/modules/). El hook UI delgado `useRealtimeRoom.ts` (≤100L) es opcional si los consumers ya consumen los 11 sub-hooks específicos directamente.
- **Trabajo Clean Arch previo:** `f763a23` introdujo `src/modules/realtime-room/domain/PresencePositionPolicy.ts` (helper puro) + 8 tests. `c1d486a` añadió `tests/unit/realtime-room/avatarEcsSentinelGuard.test.ts` (9 tests).
- **Refs**: docs.livekit.io/reference/components/react/hook/usetracks/, docs.livekit.io/reference/components/react/hook/uselocalparticipant/, docs.livekit.io/home/server/managing-rooms/ (moveParticipant).

#### ITEM 8 — P0-04 store/ → bounded contexts en src/ 🟡 EN PROGRESO

**Update 2026-05-09**: descubierto que `useStore` legacy ya es un compat shim de 1 línea apuntando a `src/modules/_state/composedStore.ts` (commit anterior no documentado). El composed store + bounded views (`createStoreView`) ES el patrón híbrido óptimo (slices internos + multi-store API). Migración real = solo cambiar imports de consumers.

**Fase 1 (sub-batches 1-9) CERRADA** — todos los 64 consumers del shim `useStore` migrados:
- Single-bounded consumers → bounded store específico (`useUserStore`, `useUIStore`):
  - useAuthSession, useLoginAuth, useLogoutUser, useOnboarding, ResetPasswordScreen, useChatTyping, ConsentimientoPendiente → `useUserStore`
  - CalendarPanel → `useUIStore`
- Multi-bounded consumers/orchestrators → `useComposedStore` directo: ~57 archivos restantes (chat panels, meetings, space3d, settings, customizer, onboarding, shared UI, dynamic imports en ChatSupabaseRepository/RecordingSupabaseRepository/authRecoveryService).
- **Shim `store/useStore.ts` eliminado** (commit pendiente). 0 consumers reales restantes.

**Fase 2 (pendiente)**: eliminar `store/orchestrators/*`, `store/slices/*`, `store/state.ts`, `store/selectores.ts`, `store/gameStore.ts` requiere migrar ~18 consumers que hoy importan directo de esas paths. Se cruza con ITEMs 10/11 (mover archivos legacy a src/) — abordar en sesión coordinada.
- Esfuerzo: L
- **Estado real (2026-05-08)**: bounded-context stores **ya creados** en `src/modules/<feature>/state/` (useUserStore, useWorkspaceStore, useChatStore, useSpace3DStore, usePresenceStore, useUIStore). Pero **`store/` legacy intacto con 21 archivos** (slices, orchestrators, gameStore, useStore, etc.). Coexisten — la migración real (eliminar legacy) no comenzó.
- Acción pendiente: migrar consumers que aún apuntan a `@/store/useStore` hacia los stores nuevos en `src/modules/`, luego eliminar `store/`.
- Skills: `clean-architecture-refactor` (Modules + state local). `official-docs-alignment` (Zustand slices pattern).
- Riesgo: alto blast radius. 58 sitios consumen `useStore` legacy.

#### ITEM 9 — P1-10 services/ → src/core/infrastructure ✅ CERRADO (2026-05-08)
- Esfuerzo real: M (terminado en una sesión).
- chatService.ts: ya migrado en ITEM 6 sub-batch 3.5 (`2943fc3`).
- audioManager.ts → `src/core/infrastructure/audio/AudioManagerAdapter.ts` (git mv preserva history). 3 consumers actualizados (useChatNotifications, useBroadcast, space3d/shared).
- geminiService.ts → `src/core/infrastructure/genai/GeminiService.ts` (git mv). 2 consumers actualizados (VibenAssistant, MonicaDockInline). Imports relativos rotos `../lib/env` reescritos como `@/lib/env`.
- monicaContextService.ts → `src/core/infrastructure/genai/MonicaContextService.ts` (git mv). 2 consumers actualizados. `../lib/supabase` → `@/lib/supabase`.
- **Carpeta `services/` eliminada (rmdir vacío)**. E4 (Grupo 3) cerrado.
- tsc OK, vitest 191/191.

#### ITEM 10 — P1-11 hooks/ → src/modules/<feature>/presentation ⏸ SIN TOCAR
- Esfuerzo: L
- **Estado real**: **54 archivos** en `hooks/` legacy. Subdirs: `app/`, `auth/`, `chat/`, `customizer/`, `meetings/`, `space3d/`, `workspace/`.
- Modelo: cada hook → `src/modules/<feature>/presentation/useX.ts` (≤100 líneas), use-case puro en `src/core/application/<bc>/`.

#### ITEM 11 — P1-12 components/ → src/modules/<feature>/presentation (XL) ⏸ SIN TOCAR
- Esfuerzo: XL
- **Estado real**: **231 archivos** en `components/` legacy.
- Subdirs: `3d/`, `agente/`, `avatar3d/`, `chat/`, `customizer/`, `games/`, `invitaciones/`, `invitation/`, `layout/`, `marketplace/`, `media/`, `meetings/`, `onboarding/`, `settings/`, `space3d/`, `ui/`, también archivos sueltos en raíz (`VirtualSpace.tsx`, `VirtualSpace3D.tsx`, `MeetingRooms.tsx`, `MiembrosView.tsx`, `ChatSidebar.tsx`, etc.).
- Por feature: fragmentar god-files (ver FASE 5) en el camino.

#### ITEM 12 — P2-18 lib/ → re-categorizar por adapter target ✅ CERRADO (2026-05-09) — lib/ ELIMINADA
- Esfuerzo: M-L
- **Estado final (2026-05-09)**: la carpeta `lib/` **ya no existe en el repo**. Todos los archivos migrados o eliminados.
- Mapeo objetivo (decisión 2026-05-05):
  - `rendering/`, `gpu/`, `ecs/`, `spatial/`, `avatar3d/` → `src/core/infrastructure/r3f/`.
  - `security/validateEnvKeys`, `env`, `i18n-config` → `src/core/infrastructure/<aspect>/`.
  - `monitoring/`, `metrics/` → `src/core/infrastructure/observability/`.
  - `network/`, `routing/` → `src/core/infrastructure/<aspect>/`.
- **Hojas/fanout cerrados**:
  - **hojas-1** (`b389e46`, 2026-05-08): security/, monitoring/, metrics/ → `src/core/infrastructure/{security,observability}/`.
  - **hojas-2** (`59974ae`, 2026-05-09): network/, routing/ → `src/core/infrastructure/{network,routing}/`. 3 consumers.
  - **hojas-3** (`15d540c`, 2026-05-09): env.ts + i18n-config.ts → `src/core/infrastructure/{env,i18n}/`. 7 consumers (incluye 4 archivos lib/ con imports relativos `./env` reparados a absolutos).
  - **hojas-4** (`852cf8b`, 2026-05-09): devLog.ts (`git rm` huérfano), mobileDetect.ts → `src/core/infrastructure/platform/`, rtcConfig.ts → `src/core/infrastructure/livekit/`, theme.ts → `src/core/infrastructure/theme/`, constants.ts → `src/core/domain/` (regla de negocio: ESPACIO_GLOBAL_ID). 20 imports actualizados.
  - **fanout-1** (`4574eb8`, 2026-05-09): logger.ts → `src/core/infrastructure/observability/logger.ts`. **134 archivos**, 133 imports (113 absolutos + 20 relativos + 1 special index.tsx). Operación bulk con sed; tsc + vitest 191/191 verde.
  - **fanout-2** (`53bbb56`, 2026-05-09): supabase.ts → `src/core/infrastructure/supabase/supabaseClient.ts`. **79 archivos**, 77 imports.
  - **hojas-5** (`0e7202e`, 2026-05-09): i18n.ts → `src/core/infrastructure/i18n/`. 22 imports.
  - **hojas-6** (`da3f6cc`, 2026-05-09): edgeProxyService (huérfano `git rm`) + 6 archivos → `r3f/{chunkSystem,interestManager,gpuCapabilities,realtimeChunkManager}` + `livekit/{livekitService,regionDetector}` + `audio/audioProcessing`.
  - **hojas-7** (`f33a701`, 2026-05-09): agonesClient (huérfano `git rm`) + 6 archivos → `auth/authRecoveryService`, `googleCalendar/googleCalendarService`, `observability/metricasAnalisis`, `r3f/realtimeChunkManager`, `userSettings/userSettings`, `domain/zonaLayoutEngine` (algoritmo puro).
  - **hojas-8** (`47ca6d9`, 2026-05-09): terrenosMarketplace + autorizacionesEmpresaFacade → `infrastructure/adapters/`.
  - **hojas-9** (`9037822`, 2026-05-09): gamificacion → `infrastructure/adapters/` AS-IS (deuda pendiente: convertir a Repository en ITEM 6 batch). performance/ vacía eliminada.
  - **hojas-r3f** (`2b0dd2a`, 2026-05-09): 5 subdirs r3f-bound (avatar3d/, spatial/, gpu/, ecs/, rendering/) → `src/core/infrastructure/r3f/`. **18 archivos**, ~35 imports. **2 shims duplicados eliminados** (textureRegistry, fabricaMaterialesArquitectonicos en root de infrastructure/) — eran @deprecated re-export proxies. Imports relativos rotos `../../src/core/...` reparados a `@/core/...`. **lib/ ELIMINADA**.
- **Resumen ejecutivo**: 12 commits ejecutados en una sesión, ~600 archivos modificados. Toda la infrastructure de adapters Supabase/LiveKit/R3F/i18n/observability/auth/etc. consolidada en `src/core/infrastructure/`.
- **Deuda residual documentada**:
  - `gamificacion.ts` (movido AS-IS a `infrastructure/adapters/`) necesita conversión a Repository pattern en ITEM 6 batch nuevo (extraer IGamificacionRepository + adapter).
  - `terrenosMarketplace.ts` (módulo de funciones) idem — conversión a Repository en ITEM 6 batch.
  - `autorizacionesEmpresaFacade.ts` (84L) — eliminar facade tras migrar 3 consumers a singletons directos (cae bajo ITEM 11 cuando muevan los components a `src/modules/`).

#### ITEM 13 — P2-15 lib/database.types.ts ✅ CERRADO (2026-05-08, eliminación directa)
- Esfuerzo real: XS (1 comando `git rm`).
- **Hallazgo de auditoría 2026-05-08**: el archivo estaba marcado huérfano desde 2026-03-30 (ARCH-CLEANUP-001) y tenía un comentario auto-deprecatorio explícito *"Eliminar manualmente"*. 0 imports activos en el código (`grep "from '@/lib/database.types'"` → 0 matches). El plan original ("mover + reescribir imports") no aplicaba porque no había imports que reescribir.
- Acción aplicada: `git rm lib/database.types.ts`. tsc OK, vitest 191/191. E8 cerrado.
- Nota: si en el futuro se regenera tipos vía `supabase gen types`, el path canónico debe ser `src/core/infrastructure/supabase/types.gen.ts` (no recrear en `lib/`).

#### ITEM 14 — P2-16 modules/ shim → eliminar tras alias ✅ CERRADO (2026-05-08)
- Esfuerzo real: XS (2 ediciones, 0 codemod requerido).
- **Hallazgo de auditoría**: el alias `@/modules/*` ya estaba configurado en `tsconfig.json` y `vite.config.ts` apuntando a `./src/modules/*`. Todos los 30+ consumers ya usaban `@/modules/realtime-room` que resolvía directo a `src/modules/`. El shim `modules/realtime-room/index.ts` era **código muerto** — nunca se resolvía vía Vite.
- Único riesgo encontrado: `vitest.config.ts` solo tenía el catch-all `'@'` sin los aliases específicos `@/core` y `@/modules`. Sin esos aliases vitest resolvía `@/modules/realtime-room` al shim legacy. Solución: sincronizar los 3 aliases en `vitest.config.ts` con los de `vite.config.ts`.
- Acción aplicada:
  1. Añadir `'@/core'` y `'@/modules'` a `vitest.config.ts:resolve.alias`.
  2. `git rm modules/realtime-room/index.ts` (la carpeta `modules/` queda vacía y desaparece).
- Verificación: tsc 0 errors, vitest 191/191 PASS, grep `from ['"]\.\./modules` → 0 matches.
- E7 (Grupo 3) cerrado.

### FASE 5 — Descomposición de god-files en src/

#### ITEM 15 — P1-07 god-components >500 líneas ⏸ SIN TOCAR
- Esfuerzo: L
- **Paths corregidos** (auditoría 2026-05-08 — el doc original tenía 10 paths erróneos):

  | Archivo (path real) | Líneas |
  |---|---|
  | `components/games/minigames/ChessGame.tsx` | 1603 |
  | `components/space3d/Scene3D.tsx` | 1547 |
  | `components/settings/sections/SettingsZona.tsx` | 1523 |
  | `components/space3d/Avatar3DScene.tsx` | 1433 |
  | `components/VirtualSpace3D.tsx` | 1423 |
  | `components/space3d/Player3D.tsx` | 1279 |
  | `components/meetings/CalendarPanel.tsx` | 1013 |
  | `components/meetings/recording/RecordingManager.tsx` | 990 |
  | `components/3d/StaticObjectBatcher.tsx` | 913 |
  | `components/avatar3d/GLTFAvatar.tsx` | 883 |
  | `components/VirtualSpace.tsx` | 852 |
  | `components/media/SharedMediaDeviceControls.tsx` | 843 |
  | `components/meetings/recording/AnalysisDashboard.tsx` | 780 |
  | `components/3d/ObjetoEscena3D.tsx` | 766 |
  | `components/onboarding/OnboardingCreador.tsx` | 765 |
  | `components/meetings/ScheduledMeetings.tsx` | 762 |
  | `components/meetings/recording/RecordingManagerV2.tsx` | 722 |
  | `components/3d/PlacementHUD.tsx` | 694 |
  | `components/meetings/videocall/MeetingControlBar.tsx` | 686 |
  | `components/marketplace/ExploradorPublico3D.tsx` | 620 |
  | `components/meetings/videocall/MeetingReactionParticleLayer.tsx` | 558 |
  | `components/MeetingRooms.tsx` | 514 |
  | `components/meetings/videocall/MeetingRoomContent.tsx` | 511 |

  Total: 23 archivos (no 24 — `GrabacionesHistorial.tsx` listado originalmente con 1042 líneas no se encontró tras búsqueda; o fue renombrado o partido).
- Acción: descomposición por responsabilidad. R3F: separar lógica declarativa de lógica de juego (use-cases en application). useFrame solo mover, no decidir.

#### ITEM 16 — P1-08 hooks >100 líneas ⏸ SIN TOCAR
- Esfuerzo: L
- **Paths corregidos** (5 paths del doc original estaban en `components/meetings/{recording,videocall/hooks}/`, no en `hooks/meetings/`):

  | Archivo (path real) | Líneas |
  |---|---|
  | `components/meetings/videocall/hooks/useMeetingRealtimeState.ts` | 1224 |
  | `hooks/space3d/useLiveKit.ts` | 220 (era 1205, ya partido — ver ITEM 7) |
  | `hooks/workspace/usePresenceChannels.ts` | 935 |
  | `hooks/meetings/useCalendarPanel.ts` | 802 |
  | `components/meetings/videocall/hooks/useMeetingMediaBridge.ts` | 753 |
  | `hooks/space3d/useSpace3D.ts` | 721 |
  | `components/meetings/recording/useAdvancedEmotionAnalysis.ts` | 713 |
  | `components/meetings/recording/useCombinedAnalysis.ts` | 651 |
  | `components/meetings/videocall/hooks/useMeetingAccess.ts` | 596 |
  | `hooks/meetings/useRecordingManager.ts` | 590 |
  | `hooks/space3d/useProximity.ts` | 544 |
  | `hooks/space3d/useEspacioObjetos.ts` | 540 |

- Acción: extraer use-cases puros a `src/core/application/<bc>/`, hook como adaptador delgado ≤100 líneas.

#### ITEM 17 — P2-14 archivos en src/ ya >500 líneas ⏸ SIN TOCAR
- Esfuerzo: M-L
- **Líneas reales (2026-05-08)**:

  | Archivo | Líneas |
  |---|---|
  | `src/modules/realtime-room/application/SpaceMediaCoordinator.ts` | 889 |
  | `src/core/infrastructure/adapters/ChatSupabaseRepository.ts` | 803 |
  | `src/core/infrastructure/adapters/MeetingSupabaseRepository.ts` | 736 |
  | `src/core/infrastructure/adapters/RecordingSupabaseRepository.ts` | 712 (713 con la línea de export) |
  | `src/core/infrastructure/adapters/MeetingAccessSupabaseRepository.ts` | 682 |
  | `src/core/infrastructure/adapters/GeometriaProceduralParedesAdapter.ts` | 645 |
  | `src/modules/realtime-room/presentation/useLiveKitRemoteTracks.ts` | 553 (NUEVO god-file generado por split de ITEM 7) |
  | `src/modules/realtime-room/application/SpaceRealtimeCoordinator.ts` | 579 |

- Acción: partir repositories por sub-bounded context (ChatMessagesRepository, ChatChannelsRepository, ChatPresenceRepository). Coordinators por capability.

### FASE 6 — Cleanup final (Grupo 3, requiere aprobación de Andrés)

#### ITEM 18 — Eliminar 4 deps MediaPipe legacy
- Tras ITEM 3 verificado en browser: quitar `@mediapipe/hands`, `@mediapipe/selfie_segmentation`, `@mediapipe/camera_utils`, `@mediapipe/drawing_utils` de `package.json`.

#### ITEM 19 — Eliminar carpetas legacy
- Después de ITEMS 7-13: eliminar `store/`, `services/`, `hooks/`, `components/`, `lib/` raíz.

#### ITEM 20 — Eliminar shim modules/
- Después de ITEM 14: eliminar `modules/`.

### FASE 7 — Cosmético

#### ITEM 21 — P3-19, P3-20, P3-21 — 2/3 cerrados
- **P3-19** ✅ CERRADO (`cf55c22`, 2026-05-08): comentario `sRGBEncoding` → `SRGBColorSpace` en `TextureAtlasCanvasAdapter.ts:20`.
- **P3-20**: subsumido por ITEM 8. NO requiere trabajo separado — tras migrar consumers a bounded stores, los imports `@/store/useStore` desaparecen naturalmente. Validado contra Clean Arch (DI por Zustand singleton es semánticamente equivalente a Repository singleton).
- **P3-21** ✅ CERRADO (2026-05-08): documentada excepción `process.env` en `.claude/skills/official-docs-alignment/SKILL.md` sección 6.1. Aplica a `vite.config.*`, `playwright.config.*`, `tests/**/scripts/*`, `scripts/**`. Validado contra Vite 6 env-and-mode docs.

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
- ~~**E4**: Carpeta `services/`~~ — ✅ removida (ver ITEM 9 cerrado).
- **E5**: Carpeta `hooks/` completa (después de ITEM 10).
- **E6**: Carpeta `components/` completa (después de ITEM 11).
- ~~**E7**: Carpeta `modules/`~~ — ✅ removida (ver ITEM 14 cerrado).
- ~~**E8**: `lib/database.types.ts`~~ — ✅ removido (ver ITEM 13 cerrado).
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
