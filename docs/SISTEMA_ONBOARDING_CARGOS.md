# Sistema de Onboarding con Selección de Cargo Laboral

## Descripción General

Sistema que permite a los usuarios seleccionar su cargo laboral al unirse a un espacio de trabajo mediante invitación. El cargo determina qué análisis avanzados (lenguaje corporal, microexpresiones) tendrá disponibles durante las grabaciones de reuniones.

---

## Arquitectura

### Base de Datos (Supabase - Proyecto MVP)

**Proyecto ID:** `lcryrsdyrzotjqdxcwtp`

#### Tipo ENUM: `cargo_laboral`

```sql
CREATE TYPE cargo_laboral AS ENUM (
  'ceo',
  'coo',
  'director_rrhh',
  'coordinador_rrhh',
  'reclutador',
  'director_comercial',
  'coordinador_ventas',
  'asesor_comercial',
  'manager_equipo',
  'team_lead',
  'product_owner',
  'scrum_master',
  'colaborador',
  'otro'
);
```

#### Tabla: `miembros_espacio`

Campos añadidos:
| Campo | Tipo | Descripción |
|:------|:-----|:------------|
| `cargo` | `cargo_laboral` (nullable) | Cargo del usuario en el equipo |
| `onboarding_completado` | `boolean` (default false) | Indica si completó selección de cargo |

#### Tabla: `invitaciones_pendientes`

Campo añadido:
| Campo | Tipo | Descripción |
|:------|:-----|:------------|
| `cargo_sugerido` | `cargo_laboral` (nullable) | Cargo sugerido por admin al invitar |

---

## Flujo de Usuario

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. ADMIN ENVÍA INVITACIÓN                                  │
│     ├─ Email del invitado                                   │
│     ├─ Rol de plataforma (admin/miembro/invitado)           │
│     └─ (Opcional) Cargo sugerido                            │
│                          ↓                                  │
│  2. USUARIO RECIBE EMAIL CON LINK                           │
│                          ↓                                  │
│  3. USUARIO ACEPTA INVITACIÓN (InvitationProcessor)         │
│     └─ Se crea registro en miembros_espacio                 │
│                          ↓                                  │
│  4. REDIRECCIÓN A ONBOARDING (view='onboarding')            │
│                          ↓                                  │
│  5. PANTALLA DE SELECCIÓN DE CARGO (CargoSelector)          │
│     ├─ Pre-selecciona si admin sugirió cargo                │
│     ├─ Muestra categorías colapsables                       │
│     └─ Indica qué análisis tiene cada cargo                 │
│                          ↓                                  │
│  6. GUARDADO EN SUPABASE                                    │
│     ├─ miembros_espacio.cargo = cargo_seleccionado          │
│     └─ miembros_espacio.onboarding_completado = true        │
│                          ↓                                  │
│  7. REDIRECCIÓN A DASHBOARD                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Componentes Frontend

### CargoSelector

**Ubicación:** `components/onboarding/CargoSelector.tsx`

Componente principal de selección con diseño UX 2026:

- **Categorías colapsables:**
  - 👑 Liderazgo Ejecutivo (CEO, COO)
  - 👥 Recursos Humanos (Director, Coordinador, Reclutador)
  - 📈 Área Comercial (Director, Coordinador, Asesor)
  - 📦 Producto y Desarrollo (Manager, Team Lead, PO, Scrum Master)
  - 👤 Otros Roles (Colaborador, Otro)

- **Características:**
  - Cards interactivas con micro-animaciones
  - Indicador de "Análisis avanzado disponible" por cargo
  - Tooltip con tipos de análisis disponibles
  - Pre-selección de cargo sugerido
  - Diseño responsive

### OnboardingCargoView

**Ubicación:** `App.tsx` (componente interno)

Vista que integra CargoSelector con:
- Verificación de membresía activa
- Carga de cargo sugerido desde invitación
- Guardado en Supabase al confirmar
- Redirección automática si ya completó onboarding
- Manejo de estados de carga y error

### useOnboarding Hook

**Ubicación:** `hooks/useOnboarding.ts`

Hook reutilizable que provee:
- `isLoading`: Estado de carga
- `error`: Mensaje de error si hay
- `espacioId`: ID del espacio
- `espacioNombre`: Nombre del espacio
- `cargoSugerido`: Cargo sugerido por admin
- `onboardingCompletado`: Si ya completó
- `miembroId`: ID de membresía
- `completarOnboarding(cargo)`: Función para guardar
- `verificarOnboarding()`: Función para re-verificar

---

## Matriz de Permisos por Cargo

| Cargo | RRHH Entrevista | RRHH One-to-One | Deals | Equipo | Transcripción |
|:------|:---------------:|:---------------:|:-----:|:------:|:-------------:|
| **CEO** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **COO** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Director RRHH** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Coordinador RRHH** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Reclutador** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Director Comercial** | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Coordinador Ventas** | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Asesor Comercial** | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Manager Equipo** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Team Lead** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Product Owner** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Scrum Master** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Colaborador** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Otro** | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Archivos del Sistema

### Nuevos

| Archivo | Descripción |
|:--------|:------------|
| `components/onboarding/CargoSelector.tsx` | Selector de cargo con UX 2026 |
| `components/onboarding/index.ts` | Exports del módulo |
| `hooks/useOnboarding.ts` | Hook de estado de onboarding |

### Modificados

| Archivo | Cambios |
|:--------|:--------|
| `App.tsx` | +OnboardingCargoView, +redirección post-invitación |
| `store/useStore.ts` | +vista 'onboarding' en tipo AppState |
| `components/meetings/recording/types/analysis.ts` | +CargoLaboral, +PERMISOS_ANALISIS |

---

## Integración con Sistema de Análisis

El cargo seleccionado se usa en `RecordingManagerV2` para determinar qué tipos de grabación con análisis avanzado están disponibles:

```typescript
// VirtualSpace3D.tsx
<RecordingManagerV2
  cargoUsuario={currentUser.cargo as CargoLaboral || 'colaborador'}
  // ... otras props
/>

// RecordingManagerV2.tsx
const tiposDisponibles = getTiposGrabacionDisponibles(cargoUsuario);
const tienePermiso = tienePermisoAnalisis(cargoUsuario, tipoGrabacion);
```

---

## Consideraciones de Seguridad

1. **El cargo es seleccionado por el usuario**, no impuesto por el sistema
2. **Los permisos de análisis son verificados en tiempo de ejecución**
3. **El admin puede sugerir un cargo** pero el usuario decide
4. **Los datos sensibles del análisis** solo se muestran si el cargo tiene permiso

---

## Próximos Pasos Sugeridos

1. [ ] Añadir opción de editar cargo desde configuración de perfil
2. [ ] Implementar notificación al admin cuando usuario selecciona cargo diferente al sugerido
3. [ ] Dashboard de analytics de distribución de cargos por espacio
4. [ ] Historial de cambios de cargo

---

## Referencias

- **Documentación Supabase:** `wp_documentacion.clave = 'sistema_onboarding_cargos_v2cowork'`
- **Commit:** `ac4c55c`
- **Fecha:** Enero 2026
