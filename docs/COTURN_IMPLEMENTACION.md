# 🔄 Implementación de Coturn TURN Server para Cowork

## Descripción General

Este documento describe la implementación de un servidor TURN dedicado usando **Coturn** (open source) para mejorar la estabilidad de las conexiones WebRTC en Cowork.

## Problema Actual

La configuración actual usa servidores STUN/TURN gratuitos que tienen limitaciones:

```typescript
// Archivo: components/VirtualSpace3D.tsx (líneas 883-888)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];
```

### Limitaciones de servidores gratuitos:
- Alta latencia (servidores compartidos)
- Disponibilidad ~95% (sin SLA)
- Ancho de banda limitado
- Conexiones inconsistentes en NAT simétrico

---

## Solución Propuesta

### Arquitectura

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Usuario A     │      │  Coturn Server   │      │   Usuario B     │
│   (Vercel)      │◄────►│  (VPS dedicado)  │◄────►│   (Vercel)      │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                        │                        │
        └────────────────────────┴────────────────────────┘
                    Conexión P2P vía TURN relay
```

### Componentes:
1. **Frontend (Vercel)**: Aplicación Next.js existente
2. **Coturn Server (VPS)**: Servidor TURN dedicado
3. **Supabase**: Señalización WebRTC (ya implementado)

---

## Guía de Despliegue de Coturn

### Opción A: DigitalOcean Droplet (Recomendado)

#### 1. Crear Droplet
- **Imagen**: Ubuntu 22.04 LTS
- **Plan**: Basic $6/mes (1GB RAM, 1 vCPU)
- **Región**: NYC1 o la más cercana a usuarios
- **Firewall**: Habilitar

#### 2. Conectar por SSH
```bash
ssh root@TU_IP_DEL_DROPLET
```

#### 3. Instalar Coturn
```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Coturn
apt install coturn -y

# Habilitar servicio
systemctl enable coturn
```

#### 4. Configurar Coturn
```bash
# Editar configuración principal
nano /etc/turnserver.conf
```

Contenido del archivo:
```ini
# /etc/turnserver.conf

# Configuración de red
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=TU_IP_PUBLICA

# Realm (tu dominio)
realm=cowork.tudominio.com
server-name=cowork.tudominio.com

# Autenticación con secreto compartido (credenciales efímeras)
use-auth-secret
static-auth-secret=TU_SECRETO_SEGURO_AQUI

# Logs
log-file=/var/log/turnserver.log
verbose

# Seguridad
no-multicast-peers
no-cli
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255

# Certificados SSL (opcional pero recomendado)
# cert=/etc/letsencrypt/live/cowork.tudominio.com/fullchain.pem
# pkey=/etc/letsencrypt/live/cowork.tudominio.com/privkey.pem

# Cuotas
total-quota=100
user-quota=10
max-bps=1000000

# Fingerprint para WebRTC
fingerprint
lt-cred-mech
```

#### 5. Habilitar Coturn como servicio
```bash
# Editar defaults
nano /etc/default/coturn

# Descomentar la línea:
TURNSERVER_ENABLED=1
```

#### 6. Configurar Firewall
```bash
# UFW
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 5349/udp
ufw allow 49152:65535/udp
ufw enable
```

#### 7. Iniciar servicio
```bash
systemctl restart coturn
systemctl status coturn
```

#### 8. Verificar funcionamiento
```bash
# Ver logs
tail -f /var/log/turnserver.log

# Probar conectividad
turnutils_uclient -T -u test -w test TU_IP_PUBLICA
```

---

## Generación de Credenciales Efímeras

### Función para generar credenciales (Node.js/Edge Function)

```typescript
// lib/turnCredentials.ts
import crypto from 'crypto';

interface TurnCredentials {
  username: string;
  credential: string;
  urls: string[];
  ttl: number;
}

export function generateTurnCredentials(
  secret: string,
  userId: string,
  ttlSeconds: number = 86400 // 24 horas
): TurnCredentials {
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${timestamp}:${userId}`;
  
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');
  
  return {
    username,
    credential,
    urls: [
      'turn:TU_IP_PUBLICA:3478?transport=udp',
      'turn:TU_IP_PUBLICA:3478?transport=tcp',
      'turns:TU_IP_PUBLICA:5349?transport=tcp',
    ],
    ttl: ttlSeconds,
  };
}
```

### Endpoint API (pages/api/turn-credentials.ts)

```typescript
// pages/api/turn-credentials.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const TURN_SECRET = process.env.TURN_SECRET!;
const TURN_SERVER_IP = process.env.TURN_SERVER_IP!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar autenticación del usuario
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Generar credenciales efímeras (válidas 24h)
    const ttl = 86400;
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${user.id}`;
    
    const hmac = crypto.createHmac('sha1', TURN_SECRET);
    hmac.update(username);
    const credential = hmac.digest('base64');

    const iceServers = [
      // STUN público (fallback)
      { urls: 'stun:stun.l.google.com:19302' },
      // TURN dedicado con credenciales efímeras
      {
        urls: [
          `turn:${TURN_SERVER_IP}:3478?transport=udp`,
          `turn:${TURN_SERVER_IP}:3478?transport=tcp`,
        ],
        username,
        credential,
      },
    ];

    return res.status(200).json({ iceServers, ttl });
  } catch (error) {
    console.error('Error generando credenciales TURN:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
```

---

## Integración en VirtualSpace3D.tsx

### Cambios Propuestos (NO APLICAR AÚN)

```typescript
// ANTES (estático)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', ... },
];

// DESPUÉS (dinámico con credenciales efímeras)
const [iceServers, setIceServers] = useState(ICE_SERVERS_FALLBACK);

useEffect(() => {
  async function fetchTurnCredentials() {
    try {
      const res = await fetch('/api/turn-credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setIceServers(data.iceServers);
      }
    } catch (error) {
      console.warn('Using fallback ICE servers');
    }
  }
  
  if (session?.access_token) {
    fetchTurnCredentials();
  }
}, [session?.access_token]);
```

---

## Variables de Entorno Requeridas

### En Vercel:
```env
# Servidor TURN
TURN_SECRET=tu_secreto_seguro_de_32_caracteres_minimo
TURN_SERVER_IP=123.45.67.89

# Supabase (ya existentes)
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### En el servidor Coturn:
El mismo `TURN_SECRET` debe estar en `/etc/turnserver.conf` como `static-auth-secret`.

---

## Testing

### 1. Probar servidor TURN
Usar https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

- **STUN/TURN URI**: `turn:TU_IP:3478`
- **Username**: timestamp:userId (generado)
- **Credential**: HMAC-SHA1 del username

### 2. Verificar ICE Candidates
En la consola del navegador, verificar que aparezcan candidatos tipo `relay` además de `host` y `srflx`.

---

## Costos Estimados

| Proveedor | Plan | Costo/mes | Usuarios simultáneos |
|-----------|------|-----------|---------------------|
| DigitalOcean | 1GB/1vCPU | $6 | ~50-100 |
| DigitalOcean | 2GB/2vCPU | $18 | ~200-300 |
| Vultr | 1GB/1vCPU | $5 | ~50-100 |
| Hetzner | CX11 | €4.15 | ~50-100 |

---

## Plan de Implementación

### Fase 1: Preparación (No afecta producción)
- [ ] Crear VPS y configurar Coturn
- [ ] Probar conectividad del servidor
- [ ] Crear endpoint API de credenciales

### Fase 2: Integración (Con fallback)
- [ ] Agregar lógica de credenciales dinámicas
- [ ] Mantener servidores gratuitos como fallback
- [ ] Probar en desarrollo

### Fase 3: Producción
- [ ] Desplegar cambios a Vercel
- [ ] Monitorear conexiones
- [ ] Remover fallback si todo funciona

---

## Rollback

Si hay problemas, revertir a la configuración estática original:

```typescript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];
```

---

## Referencias

- [Coturn GitHub](https://github.com/coturn/coturn)
- [WebRTC ICE](https://webrtc.org/getting-started/turn-server)
- [Guía WebRTC Ventures](https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/)

---

**Última actualización**: 2026-01-27
**Estado**: 📋 Documentado, pendiente implementación
