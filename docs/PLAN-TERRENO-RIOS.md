# Plan de Implementación — Terreno (Montañas) y Ríos

**Proyecto:** Cowork Virtual Workspace 3D v3.7
**Fecha:** 2026-05-04
**Autor:** Claude (Opus 4.7) — sesión con Andrés Maldonado
**Estado:** ⏸️ PAUSADO 2026-05-04 — priorizando otras funcionalidades del MVP. Código listo para retomar. Render deshabilitado vía DB (`tipo='flat'`).

## ⏸️ Pausa MVP (2026-05-04)

**Decisión técnica:** dejar los edificios del `DistantSkyline.tsx` (ya funcionan)
y posponer las montañas. ROI muy bajo para MVP — el skyline ya cubre el 80%
del trabajo visual del horizonte.

**Estado al pausar:**
- Row de DB en `espacio_terreno` cambiado a `tipo='flat'` → `Terrain3D` retorna
  null automáticamente, las montañas no se renderizan.
- Bucket `heightmaps` queda creado (puede contener el PNG de prueba — eliminable
  manualmente desde Dashboard si se quiere).
- Todo el código permanece: `Terrain3D.tsx`, `useTerreno.ts`,
  `extractHeightsFromTexture.ts`, repos, use cases, migración SQL.
- Para retomar: cambiar el row a `tipo='heightfield'` con un heightmap válido.
- Para refactor mayor (recomendado por skill clean-architecture-refactor):
  sustituir `Terrain3D.tsx` por `DistantMountains.tsx` siguiendo el patrón
  de `DistantSkyline.tsx` (InstancedMesh procedural sin Storage).

**Próximas prioridades MVP:**
1. Configurar secrets en GitHub Actions → destrabar `test-smoke` del PR #6
2. Mergear PR #6 (Aurora GLASS)
3. Items de la memoria del proyecto (deuda técnica 2026-04-24)

---

## Progreso (actualizado 2026-05-04)

| Fase | Estado | Commits |
|---|---|---|
| 0 — Pre-requisito GitHub (rama base) | ✅ `feature/terreno-rios` desde `redisenomayo` + cherry-picks | varios |
| 1.1 — Migración SQL `espacio_terreno` | ✅ aplicada en remoto (Management API) + registrada en `schema_migrations` v20260504000000 | `2fbfa16` `6cff7bb` |
| 1.2 — Bucket Storage `heightmaps` + RLS policies | ✅ bucket creado por usuario (public=true) + 4 policies aplicadas | `fa31473` |
| 1.3 — `TerrenoEntity.ts` (Domain) | ✅ tipos + `validarTerreno()` + `TERRENO_FLAT_DEFAULT` | `2fbfa16` |
| 1.4 — `ITerrenoRepository.ts` (port) | ✅ `obtener / guardar / eliminar` | `2fbfa16` |
| 1.5 — `TerrenoSupabaseRepository.ts` (adapter) | ✅ upsert por `espacio_id`, mapeo snake↔camel | `2fbfa16` |
| 1.6 — `CargarTerrenoUseCase` + `GuardarTerrenoUseCase` | ✅ con `TerrenoInvalidoError` | `2fbfa16` |
| 2.1 — `Terrain3D.tsx` (PlaneGeometry + displacementMap) | ✅ | (este commit) |
| 2.2 — `extractHeightsFromTexture()` helper (canvas → Float32Array) | ✅ | (este commit) |
| 2.3 — `<HeightfieldCollider>` con `useMemo` | ✅ | (este commit) |
| 2.4 — Integrar en `Scene3D.tsx` (render condicional, no rompe `flat`) | ✅ | (este commit) |
| Hook `useTerreno()` + DI container slot | ✅ | (este commit) |
| 3.1 — Shaders WATER_VS / WATER_FS | ⏳ pendiente | — |
| 3.2 — `Water3D.tsx` con `ShaderMaterial` + `useFrame` | ⏳ pendiente | — |
| 3.3 — Sensor collider para zonas de río | ⏳ pendiente | — |
| 3.4 — Flotación del avatar dentro del río | ⏳ pendiente | — |
| 4 — UI admin (`TerrenoPanel.tsx`) | ⏳ pendiente | — |
| 5 — Validación + release | ⏳ pendiente | — |

---

---

## 0. Pre-requisito (antes de implementar)

Tarea pendiente del usuario en GitHub antes de arrancar este plan. Definir aquí:

- [ ] Branch destino: `feature/terreno-rios` (ver §0.5 — partir de `origin/redisenomayo`)
- [ ] Issue / PR de tracking: _pendiente_
- [ ] Aprobación de la migración Supabase
- [ ] Estado de `redisenomayo` confirmado (ver §0.5)

---

## 0.5 Estrategia de branching (decisión 2026-05-04)

**Contexto:** existe la rama `origin/redisenomayo` con un rediseño UI "Aurora GLASS" (3 commits, último 2026-05-03). El último commit base está marcado como **WIP**.

### Análisis de cruce con este plan

| Archivo crítico del plan | ¿Lo toca redisenomayo? | Riesgo de conflicto |
|---|---|---|
| `components/space3d/Scene3D.tsx` | ❌ No | 0 |
| `components/space3d/Player3D.tsx` | ❌ No | 0 |
| `hooks/space3d/useEspacioObjetos.ts` | ❌ No | 0 |
| `src/core/application/usecases/` | ❌ No | 0 |
| `supabase/migrations/` | ❌ No | 0 |
| `components/customizer/panels/ObjectPanel.tsx` | ⚠️ Cosmético (Aurora GLASS) | Bajo (no se modifica en este plan) |

**Conclusión:** las capas Domain / Application / Infrastructure no chocan. Solo hay riesgo cosmético en panels.

### Decisión: partir de `redisenomayo`

```bash
git fetch origin
git checkout -b feature/terreno-rios origin/redisenomayo
git cherry-pick <commit del override Rapier 0.19.3>   # de fix/post-test-12users-fixes-2026-04-23
```

### Justificación

1. **Aurora GLASS es el diseño objetivo.** Si `TerrenoPanel.tsx` nace desde la rama actual heredará el theme viejo y habrá doble trabajo cosmético.
2. **Los 7 commits stress test de la rama actual NO deben ir en el PR de terreno.** Se mantienen en su propia rama y siguen su camino a main.
3. **Cero conflictos garantizados en Fase 1** (capas profundas no las toca redisenomayo).
4. Cuando `redisenomayo` se mergee a main, `feature/terreno-rios` se rebasa limpio.

### Pre-validación antes de ejecutar

- [ ] Confirmar que `redisenomayo` no será descartada
- [ ] Verificar si tiene PR abierto a main (`gh pr list --head redisenomayo`)
- [ ] Si está estable, proceder. Si está en flujo activo, esperar al merge a main.

---

## 1. Contexto

### 1.1 Estado actual del flujo de objetos

| Capa | Archivo | Línea |
|---|---|---|
| Modal | `components/customizer/panels/ObjectPanel.tsx` | 16-121 |
| Hook orquestador | `hooks/space3d/useEspacioObjetos.ts` | 226-766 |
| Render edición | `components/space3d/ObjetoEscena3D.tsx` | 320 |
| Render runtime (instanced) | `components/space3d/Scene3D.tsx` | 1410-1420 |
| Tabla DB instancias | `espacio_objetos` | migración 20260314 |
| Tabla DB catálogo | `catalogo_objetos_3d` | migración 20260314 |
| Físicas | `@react-three/rapier@2.2.0` + `@dimforge/rapier3d-compat@0.19.3` | — |

### 1.2 Por qué montañas y ríos NO encajan en el flujo actual

| Asunción del flujo actual | Conflicto con terreno/río |
|---|---|
| `modelo_url` apunta a un GLB | Terreno se construye desde un **heightmap PNG** (R = altura) |
| Render via `InstancedMesh` (`ObjetosInstanciados`) | Terreno y ríos son **únicos** por espacio, no se instancian |
| Collider por defecto = `CuboidCollider` | Terreno requiere `HeightfieldCollider`; río requiere `sensor` |
| Posición libre XYZ | Terreno es una **superficie continua** que ocupa todo el espacio |
| Categorías del catálogo (mesa, silla, etc.) | El terreno no es "un objeto", es **el mundo** |

**Decisión:** introducir una entidad nueva separada (`espacio_terreno`) y un panel propio. No mezclar con `catalogo_objetos_3d`.

---

## 2. Arquitectura propuesta

### 2.1 Capas (Clean Architecture)

```
src/core/
├── domain/
│   ├── entities/
│   │   └── TerrenoEntity.ts          # entidad pura (sin THREE/Rapier)
│   └── ports/
│       └── ITerrenoRepository.ts     # interfaz de persistencia
├── application/
│   └── usecases/
│       ├── CargarTerrenoUseCase.ts   # lee + valida + parsea heightmap
│       └── GuardarTerrenoUseCase.ts  # escribe a DB con validaciones
└── infrastructure/
    └── repositories/
        └── TerrenoSupabaseRepository.ts

components/
├── space3d/
│   ├── Terrain3D.tsx                 # PlaneGeometry + displacementMap
│   └── Water3D.tsx                   # ShaderMaterial animado
└── customizer/panels/
    └── TerrenoPanel.tsx              # UI admin
```

### 2.2 Esquema DB

```sql
-- Migración: supabase/migrations/<timestamp>_terreno_rios.sql
create table espacio_terreno (
  id              uuid primary key default gen_random_uuid(),
  espacio_id      uuid not null references espacios(id) on delete cascade,
  tipo            text not null check (tipo in ('flat','heightfield')),
  heightmap_url   text,                                       -- URL Supabase Storage
  nrows           integer check (nrows between 16 and 256),
  ncols           integer check (ncols between 16 and 256),
  scale_xyz       jsonb default '{"x":100,"y":10,"z":100}',
  zonas_agua      jsonb default '[]',                         -- [{x,z,w,d,nivel,color}]
  configuracion   jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (espacio_id)
);

-- RLS: solo super_admin del espacio puede modificar
alter table espacio_terreno enable row level security;

create policy "espacio_terreno_select"
  on espacio_terreno for select
  using (
    espacio_id in (
      select espacio_id from miembros_espacio
      where usuario_id = auth.uid()
    )
  );

create policy "espacio_terreno_modify"
  on espacio_terreno for all
  using (
    espacio_id in (
      select espacio_id from miembros_espacio
      where usuario_id = auth.uid() and rol = 'super_admin'
    )
  );

-- Bucket Supabase Storage: heightmaps/{espacio_id}/{filename}.png
```

### 2.3 Entidad de dominio

```ts
// src/core/domain/entities/TerrenoEntity.ts
export type TipoTerreno = 'flat' | 'heightfield';

export interface ZonaAgua {
  id: string;
  x: number; z: number;        // centro XZ
  ancho: number; profundo: number;
  nivel: number;                // altura Y de la superficie
  color: string;                // hex
}

export interface TerrenoEntity {
  id: string;
  espacioId: string;
  tipo: TipoTerreno;
  heightmapUrl: string | null;
  nrows: number;
  ncols: number;
  escala: { x: number; y: number; z: number };
  zonasAgua: ZonaAgua[];
}
```

---

## 3. Justificación de coste cero (CPU/GPU)

| Decisión | Coste GPU | Coste CPU | Fuente oficial |
|---|---|---|---|
| `displacementMap` en vertex shader | Paralelo en GPU, ~0.5ms | **0** por frame | [Three.js — `MeshStandardMaterial`](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.displacementMap) |
| `HeightfieldCollider` vs `Trimesh` | n/a | "much less memory, easier to use" | [Rapier docs — Colliders](https://rapier.rs/docs/user_guides/javascript/colliders) |
| `sensor` collider para río | n/a | "no contact points, no forces" | [Rapier docs — Sensors](https://rapier.rs/docs/user_guides/javascript/colliders) |
| 1 plano grande terreno | 1 draw call | n/a | Three.js best practices |
| `ShaderMaterial` agua | ~0.2ms GPU | **0** por frame (animación en uniform `time`) | [Three.js — `ShaderMaterial`](https://threejs.org/docs/#api/en/materials/ShaderMaterial) |
| Heightmap → `Float32Array` | n/a | One-shot al cargar (memoizado) | — |

**Frame budget estimado adicional:** < 1ms GPU, ~0ms CPU. Indistinguible del baseline en máquinas con la VRAM actual.

---

## 4. Plan de ejecución (orden hojas → raíz)

### Fase 1 — Base de datos y dominio (sin tocar render)

| # | Tarea | Verificación |
|---|---|---|
| 1.1 | Crear migración `<timestamp>_terreno_rios.sql` | `supabase migration up` ok |
| 1.2 | Crear bucket Storage `heightmaps` con RLS | upload manual ok |
| 1.3 | `TerrenoEntity.ts` + `ZonaAgua` types | typecheck verde |
| 1.4 | `ITerrenoRepository.ts` (port) | typecheck verde |
| 1.5 | `TerrenoSupabaseRepository.ts` (adapter) | tests unitarios verdes |
| 1.6 | `CargarTerrenoUseCase.ts` + `GuardarTerrenoUseCase.ts` | tests unitarios verdes |

### Fase 2 — Render (montaña)

| # | Tarea | Verificación |
|---|---|---|
| 2.1 | `Terrain3D.tsx` — `PlaneGeometry` + `displacementMap` | render visual ok |
| 2.2 | `extractHeightsFromTexture()` helper (lectura `<canvas>` → `Float32Array`) | unit test con PNG fixture |
| 2.3 | `<HeightfieldCollider>` con `useMemo` sobre `heights` | colisión avatar↔montaña funcional |
| 2.4 | Integrar `Terrain3D` en `Scene3D.tsx` (renderizado condicional si `tipo='heightfield'`) | sin regresión de FPS (medir con stress fase1) |

### Fase 3 — Render (río)

| # | Tarea | Verificación |
|---|---|---|
| 3.1 | Shaders `WATER_VS` / `WATER_FS` (vertex displacement + alpha azulado) | render visual ok |
| 3.2 | `Water3D.tsx` con `ShaderMaterial` y `useFrame` actualizando uniform `time` | sin frame drops |
| 3.3 | `CuboidCollider sensor` con callbacks `onIntersectionEnter/Exit` | `DetectarColisionesUseCase` recibe eventos |
| 3.4 | Aplicar fuerza de flotación al avatar dentro del río (impulse Y + damping) | avatar flota correctamente |

### Fase 4 — UI admin

| # | Tarea | Verificación |
|---|---|---|
| 4.1 | `TerrenoPanel.tsx` — selector heightmap (upload + presets) | upload a Supabase Storage funciona |
| 4.2 | Sliders de escala XYZ (sin re-mount, solo `useRef` + setter) | cambio en vivo sin lag |
| 4.3 | Botón "+ Río" con bbox draggable | persiste a `zonas_agua` JSONB |
| 4.4 | Integrar panel solo si `rol === 'super_admin'` | usuarios normales no lo ven |

### Fase 5 — Validación y release

| # | Tarea | Verificación |
|---|---|---|
| 5.1 | Stress test fase1 con terreno + 2 ríos + 12 avatares | FPS ≥ baseline (95% percentil) |
| 5.2 | Test e2e: admin crea terreno → otro usuario lo ve | playwright `test:funcional` verde |
| 5.3 | Bundle budget no excede límite | `check:bundle-budget` verde |
| 5.4 | PR review + merge a main | revisor: Andrés |

---

## 5. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Heightmap PNG mal formado provoca crash al parsear | Media | Alto | Validar dimensiones + formato R8/R16 en `CargarTerrenoUseCase` |
| `HeightfieldCollider` con grid muy grande baja FPS | Baja | Medio | Cap a 128×128 en check de la migración |
| Shader de agua incompatible con dispositivos móviles antiguos | Media | Bajo | Fallback a `MeshStandardMaterial` con `transparent: true` si WebGL2 no disponible |
| Conflicto con suelo plano actual de `Scene3D` | Alta | Medio | Render condicional: si `tipo='heightfield'` ocultar el plano default |
| Permisos RLS demasiado restrictivos | Media | Medio | Tests SQL con usuarios `member`, `admin`, `super_admin` |

---

## 6. Lo que NO está en alcance

- Generación procedural de terreno (Perlin/Simplex en cliente) — futuro
- Múltiples terrenos por espacio — futuro (hoy `unique(espacio_id)`)
- Vegetación procedural sobre terreno — futuro
- Erosión / física de partículas en ríos — fuera de alcance, Rapier no simula fluidos
- Animación de ríos con corriente que arrastra avatares — futuro
- Caída de agua / cascadas — futuro

---

## 7. Decisiones pendientes de validar con Andrés

1. **¿Heightmap subido por admin o set de presets predefinidos?** _Recomendación: ambos. Empezar con 3 presets (montaña, valle, desierto) + opción de subir custom._
2. **¿Tamaño máximo del heightmap?** _Recomendación: 128×128 (suficiente para 100m × 100m con detalle de 0.78m)._
3. **¿El río afecta físicamente al avatar (flotación) o es solo visual?** _Recomendación: flotación opcional, configurable por zona en JSONB._
4. **¿Branch y PR?** _Pendiente paso GitHub previo._

---

## 8. Referencias oficiales consultadas

- [Rapier.js — Colliders](https://rapier.rs/docs/user_guides/javascript/colliders)
- [Rapier.js — Heightfield example](https://rapier.rs/docs/user_guides/javascript/colliders#heightfield)
- [@react-three/rapier — docs](https://pmndrs.github.io/react-three-rapier/)
- [Three.js — `MeshStandardMaterial.displacementMap`](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.displacementMap)
- [Three.js — `ShaderMaterial`](https://threejs.org/docs/#api/en/materials/ShaderMaterial)
- [Supabase — RLS policies](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase — Storage buckets](https://supabase.com/docs/guides/storage)

---

## 9. Skills usadas en la elaboración del plan

Conforme a la regla `feedback_skills_flow` de la memoria del proyecto:

1. ✅ `official-docs-alignment` — verificación de versiones Rapier + best practices Three.js
2. ✅ `clean-architecture-refactor` — validación de fronteras Domain / Application / Infrastructure

---

**Próximo paso:** completar el pre-requisito de GitHub (sección 0), luego ejecutar Fase 1.
