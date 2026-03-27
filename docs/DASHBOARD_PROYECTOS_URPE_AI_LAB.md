# Dashboard de Proyectos Urpe AI Lab

## Especificación Técnica v1.0 — 2026

---

## 1. Resumen Ejecutivo

Dashboard tipo marketplace para que el liderazgo de Urpe AI Lab tenga visibilidad total del portafolio de proyectos MVP. Estilo visual 2026 con Bento Grid, Glassmorphism 2.0 y datos en tiempo real desde GitHub.

### Proyectos a mapear

| # | Repo | Tecnología Principal | Fase Actual |
|---|------|---------------------|-------------|
| 1 | `galaxy-ia` | Next.js, TypeScript, AI | MVP Live |
| 2 | `blender-studio-multiagent` | Python, FastAPI, Blender MCP | Desarrollo |
| 3 | `UAL-Office-Virtual-Agent` | React, Supabase, WhatsApp API | MVP Live |
| 4 | `v2-cowork` | React, Three.js, LiveKit | Desarrollo |

---

## 2. Tendencias UX/UI 2026 Implementadas

### 2.1 Bento Grid Evolucionado

- Layout de tarjetas asimétricas tipo caja japonesa
- Cards "inteligentes": el proyecto con más actividad reciente se muestra más grande
- Bordes ultra-suaves con border-radius 16-24px

### 2.2 Glassmorphism 2.0 (Spatial UI)

- Capas con profundidad: elementos flotan sobre fondo dinámico
- Backdrop blur 12-20px en cards
- Bordes sutiles con transparencia (white/10%)
- Jerarquía visual clara: lo que necesita atención está "más arriba"

### 2.3 Vibe Coding / Raw Aesthetics

- Fragmentos de código visibles en hover
- Fuentes monoespaciadas (JetBrains Mono) para métricas técnicas
- Micro-animaciones tipo terminal/proceso
- Estética técnica pero elegante (laboratorio de IA)

### 2.4 Indicadores de Estatus Predictivos

- No solo punto verde/rojo
- Mini gráfica de tendencia al lado del estatus
- Muestra si el proyecto está acelerando o estancándose
- Basado en frecuencia de commits (API GitHub)

---

## 3. Estructura del Dashboard (Estilo Marketplace)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Urpe AI Lab • Command Center                    [🔍] │
├─────────────────────────────────────────────────────────────────┤
│  HERO: Métricas Globales                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 4        │ │ 2        │ │ 1        │ │ 85%      │          │
│  │ Proyectos│ │ Activos  │ │ En Pausa │ │ Salud    │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│  BENTO GRID: Proyectos                                          │
│  ┌─────────────────────────┐ ┌─────────┐ ┌─────────┐          │
│  │     V2-COWORK           │ │ GALAXY  │ │ BLENDER │          │
│  │     (Large Card)        │ │   IA    │ │ STUDIO  │          │
│  │     [===========] 80%   │ │ [====]  │ │ [===]   │          │
│  │     🟢 Active           │ │ 🟢 Live │ │ 🟡 Dev  │          │
│  │     last: 22min ago     │ │ last:   │ │ last:   │          │
│  │                         │ │ 3d ago  │ │ 2w ago  │          │
│  └─────────────────────────┘ └─────────┘ └─────────┘          │
│  ┌─────────┐ ┌─────────────────────────────────────┐          │
│  │  UAL    │ │                                     │          │
│  │ AGENT   │ │        FILTROS / SEARCH             │          │
│  │ [===]   │ │        [Fase ▼] [Tech ▼] [Status]  │          │
│  └─────────┘ └─────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Card de Proyecto (Detalle)

Cada proyecto en el marketplace se muestra con:

| Campo | Implementación UX 2026 |
|-------|----------------------|
| **Nombre** | Tipografía Bold 24px con gradiente sutil (brand colors) |
| **Descripción** | Resumen auto-generado (140 chars) con efecto typewriter |
| **Fase** | Barra de progreso segmentada: Idea → Dev → MVP → Testing → Live |
| **Estatus** | Pill animado (Active=verde con pulso, Paused=gris mate, Error=rojo) |
| **Repo Link** | Icono GitHub con hover que muestra últimos 3 contribuidores |
| **Tecnología AI** | Badge: "LLM" / "Vision" / "RAG" / "Multi-Agent" / "3D" |
| **Último Commit** | Timestamp relativo ("hace 22 min") + indicador de tendencia |
| **Trending** | Mini sparkline: ↗️ acelerando / → estable / ↘️ estancado |

---

## 5. Implementación Técnica

### 5.1 Stack Recomendado

| Capa | Tecnología |
|------|------------|
| **Framework** | Next.js 15+ (App Router) |
| **Estilos** | Tailwind CSS + shadcn/ui |
| **Componentes UI** | Magic UI o Aceternity UI (aurora backgrounds, bento grids) |
| **Animaciones** | Framer Motion |
| **Datos** | GitHub REST API + Octokit |
| **Hosting** | Vercel (mismo ecosistema) |

### 5.2 GitHub API Integration

```typescript
// Endpoints necesarios
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/commits?per_page=1
GET /repos/{owner}/{repo}/contributors
GET /repos/{owner}/{repo}/languages

// Status automático
- Sin commits en 3 días → "Stalled"
- +5 commits en 24h → "Accelerating"
- 1-3 commits/semana → "Stable"
```

### 5.3 Estructura de Datos

```typescript
interface Proyecto {
  id: string
  nombre: string
  repo: string
  owner: string
  descripcion: string
  fase: 'idea' | 'desarrollo' | 'mvp' | 'testing' | 'live'
  estatus: 'active' | 'paused' | 'stalled' | 'error'
  tecnologias: string[]  // ['LLM', 'Vision', 'RAG', '3D', 'Multi-Agent']
  ultimoCommit: Date
  tendencia: 'up' | 'stable' | 'down'
  contributors: Contributor[]
  lenguaje: string
  estrellas: number
}
```

---

## 6. Comparativa con Grandes Apps

### Patrones adoptados de productos top

| Producto | Patrón | Implementación |
|----------|--------|----------------|
| **Vercel Dashboard** | Métricas visuales en tiempo real | Sparklines de actividad |
| **GitHub Projects** | Kanban con cards ricas | Bento Grid con fases |
| **Linear** | Minimalismo con micro-interacciones | Hover states con detalles técnicos |
| **Notion** | Progressive disclosure | Click en card → expande detalles |
| **Raycast** | Command palette | Cmd+K para buscar proyectos |

---

## 7. Roadmap de Implementación

### Fase 1: MVP (1 semana)
- [ ] Setup Next.js 15 + Tailwind + shadcn/ui
- [ ] Integración GitHub API básica
- [ ] Bento Grid con las 4 cards
- [ ] Datos estáticos (hardcoded) por proyecto

### Fase 2: Live Data (1 semana)
- [ ] Octokit integration
- [ ] Auto-refresh cada 5 minutos
- [ ] Tendencias basadas en frecuencia de commits
- [ ] Filtros por fase/tecnología

### Fase 3: Polish (3 días)
- [ ] Glassmorphism completo
- [ ] Micro-interacciones Framer Motion
- [ ] Dark mode
- [ ] Mobile responsive

### Fase 4: Features (opcional)
- [ ] Command palette (Cmd+K)
- [ ] Detalle expandido por proyecto
- [ ] Historial de actividad
- [ ] Notificaciones de cambios de estatus

---

## 8. Variables de Entorno

```env
# GitHub (para mayor rate limit)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Optional: Para métricas avanzadas
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
```

---

## 9. Consideraciones Adicionales

### Rate Limiting
- GitHub API: 60 requests/hora (sin token), 5000/hora (con token)
- Implementar caching con stale-while-revalidate
- Actualizar datos en background

### Autenticación
- ¿Dashboard público o requiere login?
- Si requiere login: integrar con Supabase (mismo auth que v2-cowork)

### Dominio
- Opción: `dashboard.urpeailab.com` o `proyectos.urpeailab.com`
- Alternativa: subruta en dominio existente

---

## 10. Próximos Pasos

1. **Confirmar alcance**: ¿Solo estos 4 proyectos o más?
2. **Definir hosting**: ¿Mismo Vercel o dominio nuevo?
3. **Autenticación**: ¿Público o privado?
4. **Prioridad**: ¿Empezar con MVP o full features?

---

*Documento generado: 2026-03-09*
*Para: Urpe AI Lab - Command Center Dashboard*
