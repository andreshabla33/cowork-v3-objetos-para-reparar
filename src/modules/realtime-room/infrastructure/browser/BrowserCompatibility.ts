/**
 * BrowserCompatibility - Detects browser capabilities and known limitations
 * for WebRTC, getUserMedia, and screen sharing.
 *
 * Provides early detection of unsupported or partially-supported browsers
 * (e.g. ARK, legacy WebKit, in-app browsers) so the UI can inform users
 * before they attempt to join a room.
 */

import { logger } from '@/lib/logger';

const log = logger.child('browser-compatibility');

export interface BrowserInfo {
  name: string;
  version: string;
  engine: string;
  isSupported: boolean;
  warnings: string[];
  capabilities: BrowserCapabilities;
}

export interface BrowserCapabilities {
  getUserMedia: boolean;
  getDisplayMedia: boolean;
  webRTC: boolean;
  mediaRecorder: boolean;
  permissionsAPI: boolean;
  screenShareAudio: boolean;
}

interface ParsedUserAgent {
  name: string;
  version: string;
  engine: string;
}

const KNOWN_PROBLEMATIC_BROWSERS: Record<string, string> = {
  ark: 'ARK Browser tiene soporte limitado para WebRTC. Algunas funciones como cámara o micrófono pueden no funcionar correctamente. Recomendamos usar Chrome, Edge o Firefox.',
  uc: 'UC Browser tiene soporte parcial de WebRTC. Recomendamos usar Chrome, Edge o Firefox.',
  brave: '',
  opera: '',
};

function parseUserAgent(): ParsedUserAgent {
  if (typeof navigator === 'undefined') {
    return { name: 'unknown', version: '0', engine: 'unknown' };
  }

  const ua = navigator.userAgent;

  if (ua.includes('ArkWeb') || ua.includes('ArkBrowser') || ua.includes('Ark/')) {
    const arkMatch = ua.match(/(?:ArkWeb|ArkBrowser|Ark)\/([\d.]+)/);
    return { name: 'ark', version: arkMatch?.[1] ?? 'unknown', engine: 'chromium' };
  }

  if (ua.includes('UCBrowser') || ua.includes('UCWEB')) {
    const ucMatch = ua.match(/UCBrowser\/([\d.]+)/);
    return { name: 'uc', version: ucMatch?.[1] ?? 'unknown', engine: 'chromium' };
  }

  if (ua.includes('Edg/')) {
    const edgeMatch = ua.match(/Edg\/([\d.]+)/);
    return { name: 'edge', version: edgeMatch?.[1] ?? 'unknown', engine: 'chromium' };
  }

  if (ua.includes('OPR/') || ua.includes('Opera')) {
    const operaMatch = ua.match(/(?:OPR|Opera)\/([\d.]+)/);
    return { name: 'opera', version: operaMatch?.[1] ?? 'unknown', engine: 'chromium' };
  }

  if (ua.includes('Firefox/')) {
    const ffMatch = ua.match(/Firefox\/([\d.]+)/);
    return { name: 'firefox', version: ffMatch?.[1] ?? 'unknown', engine: 'gecko' };
  }

  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const safariMatch = ua.match(/Version\/([\d.]+)/);
    return { name: 'safari', version: safariMatch?.[1] ?? 'unknown', engine: 'webkit' };
  }

  if (ua.includes('Chrome/')) {
    const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    return { name: 'chrome', version: chromeMatch?.[1] ?? 'unknown', engine: 'chromium' };
  }

  return { name: 'unknown', version: '0', engine: 'unknown' };
}

function detectCapabilities(): BrowserCapabilities {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return {
      getUserMedia: false,
      getDisplayMedia: false,
      webRTC: false,
      mediaRecorder: false,
      permissionsAPI: false,
      screenShareAudio: false,
    };
  }

  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasGetDisplayMedia = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const hasWebRTC = Boolean(window.RTCPeerConnection);
  const hasMediaRecorder = Boolean(window.MediaRecorder);
  const hasPermissionsAPI = Boolean(navigator.permissions?.query);

  // Screen share audio is only reliably supported in Chromium-based browsers
  const ua = navigator.userAgent;
  const isChromium = ua.includes('Chrome/') || ua.includes('Edg/') || ua.includes('OPR/');
  const screenShareAudio = isChromium && hasGetDisplayMedia;

  return {
    getUserMedia: hasGetUserMedia,
    getDisplayMedia: hasGetDisplayMedia,
    webRTC: hasWebRTC,
    mediaRecorder: hasMediaRecorder,
    permissionsAPI: hasPermissionsAPI,
    screenShareAudio,
  };
}

export function detectBrowserInfo(): BrowserInfo {
  const parsed = parseUserAgent();
  const capabilities = detectCapabilities();
  const warnings: string[] = [];

  // Check for known problematic browsers
  const knownWarning = KNOWN_PROBLEMATIC_BROWSERS[parsed.name];
  if (knownWarning) {
    warnings.push(knownWarning);
  }

  // Core capability checks
  if (!capabilities.getUserMedia) {
    warnings.push('Tu navegador no soporta acceso a cámara/micrófono (getUserMedia). No podrás participar con audio o video.');
  }

  if (!capabilities.webRTC) {
    warnings.push('Tu navegador no soporta WebRTC. No podrás unirte a videollamadas.');
  }

  if (!capabilities.getDisplayMedia) {
    warnings.push('Tu navegador no soporta compartir pantalla.');
  }

  if (!capabilities.screenShareAudio) {
    warnings.push('Tu navegador no soporta audio en pantalla compartida. Si compartes pantalla, los demás no escucharán el audio del sistema.');
  }

  const isSupported = capabilities.getUserMedia && capabilities.webRTC;

  if (warnings.length > 0) {
    log.info('Browser compatibility check', {
      browser: parsed.name,
      version: parsed.version,
      engine: parsed.engine,
      isSupported,
      warningCount: warnings.length,
    });
  }

  return {
    name: parsed.name,
    version: parsed.version,
    engine: parsed.engine,
    isSupported,
    warnings: warnings.filter(Boolean),
    capabilities,
  };
}

/**
 * Check if the current browser can reliably handle screen share with audio.
 * Only Chromium-based browsers support this via tab sharing.
 */
export function canShareScreenWithAudio(): boolean {
  const info = detectBrowserInfo();
  return info.capabilities.screenShareAudio;
}
