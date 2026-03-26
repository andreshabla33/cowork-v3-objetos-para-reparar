# 📅 Sistema de Calendario con Google Calendar - Fase 1

> **Fecha de implementación:** 27 de Enero 2026  
> **Estado:** ✅ COMPLETADO

---

## 📋 Resumen

Sistema completo de reuniones programadas con integración bidireccional a Google Calendar, incluyendo:
- Creación de reuniones con invitaciones automáticas por email
- Sincronización con Google Calendar
- Google Meet automático para cada reunión
- Eliminación sincronizada (Cowork → Google Calendar)
- Notificaciones a participantes

---

## 🏗️ Arquitectura

### Componentes Implementados

```
lib/
└── googleCalendar.ts          # Servicio de integración con Google Calendar API

components/meetings/
├── CalendarPanel.tsx          # Panel principal de calendario
├── ScheduledMeetings.tsx      # Lista de reuniones programadas
└── recording/                 # Sistema de grabación (Fase 2)

supabase/migrations/
└── 20260127_reuniones_calendario.sql  # Tablas y RLS policies
```

### Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                     CREAR REUNIÓN                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuario crea reunión en CalendarPanel/ScheduledMeetings     │
│                          ↓                                      │
│  2. Obtener emails de participantes (Supabase)                  │
│                          ↓                                      │
│  3. Crear evento en Google Calendar (con invitaciones)          │
│     - Se genera Google Meet automáticamente                     │
│     - Se envían emails de invitación a participantes            │
│                          ↓                                      │
│  4. Guardar en Supabase con google_event_id                     │
│     - meeting_link = Google Meet URL                            │
│     - google_event_id = ID para sincronización                  │
│                          ↓                                      │
│  5. Trigger notifica a participantes en la app                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ELIMINAR REUNIÓN                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Usuario elimina reunión en el Cowork                        │
│                          ↓                                      │
│  2. Eliminar de Google Calendar (sendUpdates: 'all')            │
│     - Se envía email de cancelación a invitados                 │
│                          ↓                                      │
│  3. Eliminar de Supabase                                        │
│     - Trigger notifica cancelación a participantes              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Tablas Supabase (Proyecto: mvp)

### `reuniones_programadas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `espacio_id` | UUID | Espacio de trabajo (FK) |
| `sala_id` | UUID | Sala de reunión opcional (FK) |
| `titulo` | VARCHAR | Título de la reunión |
| `descripcion` | TEXT | Descripción/agenda |
| `fecha_inicio` | TIMESTAMPTZ | Fecha y hora de inicio |
| `fecha_fin` | TIMESTAMPTZ | Fecha y hora de fin |
| `creado_por` | UUID | Usuario creador (FK) |
| `google_event_id` | TEXT | **ID del evento en Google Calendar** |
| `meeting_link` | TEXT | Link de Google Meet o interno |
| `es_recurrente` | BOOLEAN | Si es evento recurrente (default: false) |
| `recurrencia_regla` | TEXT | Regla RRULE (ej: FREQ=WEEKLY) |
| `recordatorio_minutos` | INTEGER | Minutos antes del recordatorio (default: 15) |
| `creado_en` | TIMESTAMPTZ | Fecha de creación |

### `reunion_participantes`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `reunion_id` | UUID | Reunión (FK) |
| `usuario_id` | UUID | Usuario invitado (FK) |
| `estado` | VARCHAR | pendiente/aceptado/rechazado/tentativo |
| `notificado` | BOOLEAN | Si fue notificado en la app |
| `respondido_en` | TIMESTAMPTZ | Fecha de respuesta |

### `notificaciones` (Sistema general)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `usuario_id` | UUID | Usuario destinatario |
| `espacio_id` | UUID | Espacio relacionado |
| `tipo` | TEXT | Tipo de notificación |
| `titulo` | TEXT | Título de la notificación |
| `mensaje` | TEXT | Contenido del mensaje |
| `leida` | BOOLEAN | Si fue leída |

---

## 🔧 Servicio Google Calendar

### Ubicación: `lib/googleCalendar.ts`

### Métodos Disponibles

#### `getAuthUrl()`
Genera URL para autenticación OAuth con Google.

```typescript
const url = googleCalendar.getAuthUrl();
window.location.href = url;
```

#### `createEvent(params)`
Crea un evento con Google Meet y envía invitaciones.

```typescript
const event = await googleCalendar.createEvent({
  summary: 'Daily Standup',
  description: 'Reunión diaria del equipo',
  start: '2026-01-27T10:00:00.000Z',
  end: '2026-01-27T11:00:00.000Z',
  attendees: ['user1@email.com', 'user2@email.com'],
  sendUpdates: 'all' // Envía emails de invitación
});

// Respuesta incluye:
// - event.id → google_event_id para sincronización
// - event.hangoutLink → Link de Google Meet
// - event.htmlLink → Link al evento en Google Calendar
```

#### `updateEvent(eventId, params)`
Actualiza un evento existente.

```typescript
await googleCalendar.updateEvent('evento123', {
  summary: 'Nuevo título',
  attendees: ['nuevo@email.com'],
  sendUpdates: 'all'
});
```

#### `deleteEvent(eventId, sendUpdates)`
Elimina un evento y notifica a invitados.

```typescript
// Notificar a todos los invitados de la cancelación
await googleCalendar.deleteEvent('evento123', 'all');

// Eliminar sin notificar
await googleCalendar.deleteEvent('evento123', 'none');
```

#### `fetchEvents(timeMin?, timeMax?)`
Obtiene eventos del calendario.

```typescript
const events = await googleCalendar.fetchEvents();
```

#### `getEvent(eventId)`
Obtiene un evento específico por ID.

```typescript
const event = await googleCalendar.getEvent('evento123');
```

#### Utilidades

```typescript
// Verificar si está conectado
const connected = googleCalendar.isConnected();

// Guardar token después de OAuth
googleCalendar.saveToken(accessToken);

// Remover token (desconectar)
googleCalendar.removeToken();

// Obtener email del usuario autenticado
const email = await googleCalendar.getUserEmail();
```

---

## 🎯 Funcionalidades Implementadas

### ✅ Crear Reunión con Invitaciones

1. Usuario crea reunión en el modal
2. Selecciona participantes del espacio
3. Si Google Calendar está conectado:
   - Se crea evento con Google Meet
   - Se envían emails de invitación automáticamente
   - Se guarda `google_event_id` para sincronización
4. Participantes reciben:
   - Email de Google Calendar con botón "Sí/No/Quizás"
   - Notificación en la app del Cowork

### ✅ Eliminar Reunión

1. Organizador hace clic en eliminar
2. Se elimina de Google Calendar (notifica a invitados)
3. Se elimina de Supabase
4. Invitados reciben email de cancelación

### ✅ Responder a Invitación

- Desde la app: botones de Aceptar/Quizás/Rechazar
- Desde Google Calendar: click en el email

### ✅ Ver en Calendario

- Mini calendario con indicadores de reuniones
- Lista de reuniones próximas
- Badges "EN VIVO" y "EN 15 MIN"

---

## 🔐 Configuración OAuth

### Google Cloud Console

1. Crear proyecto en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar Google Calendar API
3. Configurar OAuth Consent Screen
4. Crear credenciales OAuth 2.0
5. Agregar orígenes autorizados:
   - `http://localhost:5173` (desarrollo)
   - `https://tu-dominio.com` (producción)

### Variables de Entorno

El `GOOGLE_CLIENT_ID` está configurado en `lib/googleCalendar.ts`:

```typescript
const GOOGLE_CLIENT_ID = '628870318014-35io6nhdj8rld9de0ng5voorrmr2neq4.apps.googleusercontent.com';
```

---

## 📱 Uso en Componentes

### CalendarPanel.tsx

```tsx
// Estado de conexión
const [googleConnected, setGoogleConnected] = useState(googleCalendar.isConnected());

// Crear reunión con Google Calendar
const createMeeting = async () => {
  if (googleConnected) {
    const googleEvent = await googleCalendar.createEvent({
      summary: titulo,
      start: fechaInicio.toISOString(),
      end: fechaFin.toISOString(),
      attendees: participantesEmails,
      sendUpdates: 'all'
    });
    
    // Guardar google_event_id
    await supabase.from('reuniones_programadas').insert({
      ...datos,
      google_event_id: googleEvent.id,
      meeting_link: googleEvent.hangoutLink
    });
  }
};

// Eliminar con sincronización
const deleteMeeting = async (meetingId, googleEventId) => {
  if (googleConnected && googleEventId) {
    await googleCalendar.deleteEvent(googleEventId, 'all');
  }
  await supabase.from('reuniones_programadas').delete().eq('id', meetingId);
};
```

---

## 🚀 Próximos Pasos (Mejoras Futuras)

1. **Sincronización bidireccional completa**
   - Webhook de Google Calendar para detectar cambios externos
   - Actualizar reuniones cuando se modifican desde Google

2. **Reuniones recurrentes**
   - Soporte para reglas RRULE
   - Crear serie de eventos

3. **Recordatorios automáticos**
   - Edge Function programada para enviar recordatorios
   - Notificaciones push antes de reunión

4. **Integración con otros calendarios**
   - Microsoft Outlook
   - Apple Calendar (CalDAV)

---

## 📊 Checklist Implementación

- [x] Servicio `googleCalendar.ts` con métodos completos
- [x] Crear evento con Google Meet automático
- [x] Enviar invitaciones por email a participantes
- [x] Guardar `google_event_id` en Supabase
- [x] Eliminar sincronizado (Cowork ↔ Google Calendar)
- [x] Notificaciones de cancelación a invitados
- [x] Tablas Supabase con RLS policies
- [x] Triggers para notificaciones internas
- [x] CalendarPanel.tsx actualizado
- [x] ScheduledMeetings.tsx actualizado
- [x] Documentación completa

---

## 🔗 Referencias

- [Google Calendar API](https://developers.google.com/calendar/api)
- [OAuth 2.0 for Client-side Applications](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [Calendar Events Resource](https://developers.google.com/calendar/api/v3/reference/events)
