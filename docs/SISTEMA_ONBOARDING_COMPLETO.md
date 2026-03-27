# Sistema de Onboarding Completo - v2 Cowork

## Descripción General

Sistema de onboarding diferenciado según el tipo de usuario, siguiendo las mejores prácticas UX de plataformas B2B como Slack, Notion y HubSpot.

---

## Arquitectura de Flujos

### 🔀 Diagrama de Decisión Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USUARIO NUEVO SE REGISTRA                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │  ¿Tiene invitación   │
               │  pendiente (token)?  │
               └──────────┬───────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
      ┌─────────┐               ┌──────────────┐
      │   SÍ    │               │      NO      │
      └────┬────┘               └──────┬───────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────────┐
│  FLUJO INVITADO      │    │  FLUJO CREADOR           │
│  (OnboardingCargo)   │    │  (OnboardingCreador)     │
└──────────────────────┘    └──────────────────────────┘
```

---

## FLUJO 1: Onboarding para CREADORES (CEO/Coordinadores)

### Cuándo se activa
- Usuario nuevo sin espacios de trabajo
- No tiene invitaciones pendientes
- Es quien iniciará el equipo en la plataforma

### Componente: `OnboardingCreador.tsx`

### Pasos del Flujo

```
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 0: BIENVENIDA                                                 │
│  ────────────────────────────────────────────────────────────────── │
│  • Saludo personalizado con nombre del usuario                      │
│  • Indicador de progreso (3 pasos)                                  │
│  • Botón "Comenzar"                                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 1: SELECCIÓN DE CARGO                                         │
│  ────────────────────────────────────────────────────────────────── │
│  Componente: CargoSelector                                          │
│                                                                     │
│  Categorías disponibles:                                            │
│  • 👑 Liderazgo Ejecutivo: CEO, COO                                 │
│  • 👥 Recursos Humanos: Director, Coordinador, Reclutador           │
│  • 📈 Área Comercial: Director, Coordinador, Asesor                 │
│  • 📦 Producto y Desarrollo: Manager, Team Lead, PO, Scrum Master   │
│  • 👤 Otros: Colaborador, Otro                                      │
│                                                                     │
│  El cargo determina los análisis disponibles en grabaciones         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 2: CREAR ESPACIO DE TRABAJO                                   │
│  ────────────────────────────────────────────────────────────────── │
│  Campos:                                                            │
│  • Nombre del espacio (requerido)                                   │
│  • Descripción (opcional)                                           │
│                                                                     │
│  Acciones automáticas:                                              │
│  • Crea espacio en espacios_trabajo                                 │
│  • Asigna al usuario como super_admin                               │
│  • Crea 6 departamentos por defecto:                                │
│    - General, Desarrollo, Diseño, Marketing, Ventas, Soporte        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 3: INVITAR EQUIPO (Opcional)                                  │
│  ────────────────────────────────────────────────────────────────── │
│  • Campo para agregar múltiples emails                              │
│  • Envía invitaciones usando Edge Function enviar-invitacion        │
│  • Opción de "Omitir por ahora"                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ✅ COMPLETADO                                                       │
│  ────────────────────────────────────────────────────────────────── │
│  • Animación de éxito                                               │
│  • Redirección automática a Dashboard                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## FLUJO 2: Onboarding para INVITADOS (Empleados/Miembros)

### Cuándo se activa
- Usuario acepta invitación por email
- URL contiene token de invitación
- Ya existe registro en invitaciones_pendientes

### Componente: `OnboardingCargoView` + `InvitationProcessor`

### Pasos del Flujo

```
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 0: VERIFICACIÓN DE INVITACIÓN                                 │
│  ────────────────────────────────────────────────────────────────── │
│  Componente: InvitationProcessor                                    │
│  • Verifica token en URL                                            │
│  • Muestra info del espacio e invitador                             │
│  • Botón "Aceptar invitación"                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 1: SELECCIÓN DE CARGO                                         │
│  ────────────────────────────────────────────────────────────────── │
│  Componente: CargoSelector                                          │
│  • Puede tener cargo pre-sugerido por admin                         │
│  • Usuario selecciona o cambia                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PASO 2: SELECCIÓN DE DEPARTAMENTO                                  │
│  ────────────────────────────────────────────────────────────────── │
│  • Muestra departamentos del espacio                                │
│  • Grid visual con iconos y colores                                 │
│  • General, Desarrollo, Diseño, Marketing, Ventas, Soporte          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ✅ COMPLETADO                                                       │
│  ────────────────────────────────────────────────────────────────── │
│  • Guarda cargo y departamento en miembros_espacio                  │
│  • Marca onboarding_completado = true                               │
│  • Redirección a Dashboard                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Comparativa con Plan Original

| Aspecto | Plan Original | Implementación Actual | Estado |
|:--------|:--------------|:----------------------|:-------|
| **Segmentación por tipo de usuario** | Separar Creador vs Invitado | ✅ Dos flujos diferenciados | ✅ |
| **Sin pantallas vacías** | Evitar Dashboard vacío | ✅ Onboarding inmediato si no hay espacios | ✅ |
| **Selección de cargo** | Preguntar rol/cargo | ✅ CargoSelector con categorías | ✅ |
| **Creación de espacio** | Guiar creación | ✅ Paso integrado en onboarding | ✅ |
| **Invitar equipo** | Permitir invitar desde onboarding | ✅ Paso 3 con múltiples emails | ✅ |
| **Departamentos** | Asignar departamento | ✅ Para invitados (Paso 2) | ✅ |
| **Progreso visual** | Indicadores de pasos | ✅ Badges "Paso X de Y" | ✅ |
| **Animaciones** | UX moderna | ✅ Framer Motion | ✅ |

---

## Base de Datos

### Tablas Involucradas

| Tabla | Campos Relevantes |
|:------|:------------------|
| `usuarios` | id, email, nombre |
| `espacios_trabajo` | id, nombre, descripcion, slug, creado_por |
| `miembros_espacio` | usuario_id, espacio_id, rol, cargo, departamento_id, onboarding_completado |
| `departamentos` | id, nombre, color, icono, espacio_id |
| `invitaciones_pendientes` | token, email, espacio_id, rol, cargo_sugerido, usada |

### Roles de Sistema

| Rol | Descripción | Creado por |
|:----|:------------|:-----------|
| `super_admin` | Creador del espacio, acceso total | OnboardingCreador |
| `admin` | Administrador del espacio | Asignación manual |
| `moderador` | Moderador de canales | Asignación manual |
| `miembro` | Miembro estándar | Invitación aceptada |
| `invitado` | Acceso limitado | Invitación aceptada |

### Cargos Laborales (ENUM)

```sql
CREATE TYPE cargo_laboral AS ENUM (
  'ceo', 'coo',
  'director_rrhh', 'coordinador_rrhh', 'reclutador',
  'director_comercial', 'coordinador_ventas', 'asesor_comercial',
  'manager_equipo', 'team_lead', 'product_owner', 'scrum_master',
  'colaborador', 'otro'
);
```

---

## Permisos de Análisis por Cargo

| Cargo | RRHH Entrevista | RRHH 1:1 | Deals | Equipo | Transcripción |
|:------|:---------------:|:--------:|:-----:|:------:|:-------------:|
| CEO/COO | ✅ | ✅ | ✅ | ✅ | ✅ |
| Director/Coord RRHH | ✅ | ✅ | ❌ | ❌ | ✅ |
| Reclutador | ✅ | ❌ | ❌ | ❌ | ✅ |
| Área Comercial | ❌ | ❌ | ✅ | ❌ | ✅ |
| Manager/Team Lead/PO/SM | ❌ | ❌ | ❌ | ✅ | ✅ |
| Colaborador/Otro | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Archivos del Sistema

### Nuevos Componentes

| Archivo | Descripción |
|:--------|:------------|
| `components/onboarding/OnboardingCreador.tsx` | Flujo completo para creadores |
| `components/onboarding/CargoSelector.tsx` | Selector de cargo con categorías |
| `components/onboarding/index.ts` | Exports del módulo |

### Modificados

| Archivo | Cambios |
|:--------|:--------|
| `App.tsx` | +vista 'onboarding_creador', +OnboardingCargoView con departamentos |
| `store/useStore.ts` | +tipo 'onboarding_creador', lógica de redirección |

---

## Referencias

- **Mejores Prácticas UX**: Basado en Slack, Notion, HubSpot (aakashg.com)
- **Commit**: `9a246c9`
- **Fecha**: Enero 2026
- **Documentación Supabase**: `wp_documentacion`
