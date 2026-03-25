import * as THREE from 'three';
import type { TipoMaterialArquitectonico } from '../domain/entities/objetosArquitectonicos';

interface ConfiguracionMaterialArquitectonico {
  tamano_baldosa: number;
  rugosidad: number;
  metalicidad: number;
  opacidad: number;
  transparente: boolean;
  color_fallback: string;
  generar_albedo: () => THREE.CanvasTexture;
  generar_rugosidad: () => THREE.CanvasTexture;
  generar_normal: () => THREE.CanvasTexture;
}

interface OpcionesMaterialArquitectonico {
  tipo_material: TipoMaterialArquitectonico;
  ancho: number;
  alto: number;
  repetir_textura: boolean;
  escala_textura?: number;
  color_base?: string | null;
  opacidad?: number | null;
  rugosidad?: number | null;
  metalicidad?: number | null;
  resaltar?: boolean;
}

const cacheAlbedo = new Map<TipoMaterialArquitectonico, THREE.CanvasTexture>();
const cacheRugosidad = new Map<TipoMaterialArquitectonico, THREE.CanvasTexture>();
const cacheNormal = new Map<TipoMaterialArquitectonico, THREE.CanvasTexture>();

const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

const normalizarColor = (valor?: string | null, fallback = '#94a3b8') => {
  if (!valor) return fallback;
  return valor.startsWith('#') ? valor : `#${valor}`;
};

const crearTexturaCanvas = (
  tamano: number,
  dibujar: (ctx: CanvasRenderingContext2D, tamano: number) => void,
  colorSpace?: THREE.ColorSpace,
) => {
  const canvas = document.createElement('canvas');
  canvas.width = tamano;
  canvas.height = tamano;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear el contexto 2D para la textura procedural.');
  }
  dibujar(ctx, tamano);
  const textura = new THREE.CanvasTexture(canvas);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  if (colorSpace) {
    textura.colorSpace = colorSpace;
  }
  textura.needsUpdate = true;
  return textura;
};

const agregarRuido = (ctx: CanvasRenderingContext2D, tamano: number, intensidad = 18) => {
  const image = ctx.getImageData(0, 0, tamano, tamano);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const delta = (Math.random() - 0.5) * intensidad;
    data[i] = Math.max(0, Math.min(255, data[i] + delta));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + delta));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + delta));
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
};

const crearNormalSimple = (tamano: number, variacion = 10) => {
  return crearTexturaCanvas(tamano, (ctx) => {
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, tamano, tamano);
    const image = ctx.getImageData(0, 0, tamano, tamano);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(96, Math.min(160, 128 + (Math.random() - 0.5) * variacion));
      data[i + 1] = Math.max(96, Math.min(160, 128 + (Math.random() - 0.5) * variacion));
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  });
};

const crearRugosidadSimple = (tamano: number, base: number, variacion = 16) => {
  const nivel = Math.round(clamp(base, 0, 1) * 255);
  return crearTexturaCanvas(tamano, (ctx) => {
    ctx.fillStyle = `rgb(${nivel},${nivel},${nivel})`;
    ctx.fillRect(0, 0, tamano, tamano);
    agregarRuido(ctx, tamano, variacion);
  });
};

const generarLadrillo = () => crearTexturaCanvas(512, (ctx, tamano) => {
  ctx.fillStyle = '#b55233';
  ctx.fillRect(0, 0, tamano, tamano);
  const alto = 72;
  const ancho = 144;
  const junta = 8;
  for (let fila = 0; fila < tamano; fila += alto + junta) {
    const offset = (Math.floor(fila / (alto + junta)) % 2) * ((ancho + junta) / 2);
    for (let col = -offset; col < tamano; col += ancho + junta) {
      const g = ctx.createLinearGradient(col, fila, col + ancho, fila + alto);
      g.addColorStop(0, '#cf744d');
      g.addColorStop(0.5, '#b55233');
      g.addColorStop(1, '#924127');
      ctx.fillStyle = g;
      ctx.fillRect(col + junta / 2, fila + junta / 2, ancho, alto);
    }
  }
  ctx.fillStyle = 'rgba(215,206,196,0.8)';
  for (let fila = 0; fila < tamano; fila += alto + junta) {
    ctx.fillRect(0, fila, tamano, junta);
  }
  for (let col = 0; col < tamano; col += ancho + junta) {
    ctx.fillRect(col, 0, junta, tamano);
  }
  agregarRuido(ctx, tamano, 18);
}, THREE.SRGBColorSpace);

const generarMadera = () => crearTexturaCanvas(512, (ctx, tamano) => {
  const g = ctx.createLinearGradient(0, 0, tamano, tamano * 0.25);
  g.addColorStop(0, '#d4b07a');
  g.addColorStop(0.5, '#b98545');
  g.addColorStop(1, '#8f6333');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tamano, tamano);
  for (let i = 0; i < 24; i++) {
    const x = (tamano / 24) * i + (Math.random() * 18 - 9);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y < tamano; y += 6) {
      ctx.lineTo(x + Math.sin(y * 0.022 + i) * 10, y);
    }
    ctx.strokeStyle = `rgba(85,53,21,${0.16 + Math.random() * 0.22})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.stroke();
  }
  agregarRuido(ctx, tamano, 14);
}, THREE.SRGBColorSpace);

const generarYeso = () => crearTexturaCanvas(512, (ctx, tamano) => {
  ctx.fillStyle = '#e8e3da';
  ctx.fillRect(0, 0, tamano, tamano);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * tamano;
    const y = Math.random() * tamano;
    const r = 20 + Math.random() * 64;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tamano, tamano);
  }
  agregarRuido(ctx, tamano, 8);
}, THREE.SRGBColorSpace);

const generarConcreto = () => crearTexturaCanvas(512, (ctx, tamano) => {
  ctx.fillStyle = '#949aa1';
  ctx.fillRect(0, 0, tamano, tamano);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * tamano;
    const y = Math.random() * tamano;
    const r = 20 + Math.random() * 56;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() > 0.5 ? 'rgba(70,74,80,0.18)' : 'rgba(180,184,190,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tamano, tamano);
  }
  agregarRuido(ctx, tamano, 16);
}, THREE.SRGBColorSpace);

const generarMetal = () => crearTexturaCanvas(256, (ctx, tamano) => {
  const g = ctx.createLinearGradient(0, 0, tamano, tamano);
  g.addColorStop(0, '#4b5563');
  g.addColorStop(0.5, '#9ca3af');
  g.addColorStop(1, '#374151');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tamano, tamano);
  ctx.globalAlpha = 0.14;
  for (let i = -tamano; i < tamano * 2; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + tamano, tamano);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  agregarRuido(ctx, tamano, 10);
}, THREE.SRGBColorSpace);

const generarVidrio = () => crearTexturaCanvas(256, (ctx, tamano) => {
  ctx.fillStyle = '#e8f4fc';
  ctx.fillRect(0, 0, tamano, tamano);
  const g = ctx.createLinearGradient(0, 0, tamano, tamano);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.3, 'rgba(200,220,240,0.08)');
  g.addColorStop(0.7, 'rgba(180,210,235,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tamano, tamano);
}, THREE.SRGBColorSpace);

const registroMateriales: Record<TipoMaterialArquitectonico, ConfiguracionMaterialArquitectonico> = {
  ladrillo: {
    tamano_baldosa: 0.55,
    rugosidad: 0.92,
    metalicidad: 0.02,
    opacidad: 1,
    transparente: false,
    color_fallback: '#b55233',
    generar_albedo: generarLadrillo,
    generar_rugosidad: () => crearRugosidadSimple(512, 0.92, 20),
    generar_normal: () => crearNormalSimple(512, 18),
  },
  madera: {
    tamano_baldosa: 1.2,
    rugosidad: 0.62,
    metalicidad: 0.04,
    opacidad: 1,
    transparente: false,
    color_fallback: '#b98545',
    generar_albedo: generarMadera,
    generar_rugosidad: () => crearRugosidadSimple(512, 0.62, 12),
    generar_normal: () => crearNormalSimple(512, 14),
  },
  yeso: {
    tamano_baldosa: 2.4,
    rugosidad: 0.86,
    metalicidad: 0.01,
    opacidad: 1,
    transparente: false,
    color_fallback: '#e8e3da',
    generar_albedo: generarYeso,
    generar_rugosidad: () => crearRugosidadSimple(512, 0.86, 8),
    generar_normal: () => crearNormalSimple(512, 8),
  },
  concreto: {
    tamano_baldosa: 2.2,
    rugosidad: 0.9,
    metalicidad: 0.01,
    opacidad: 1,
    transparente: false,
    color_fallback: '#949aa1',
    generar_albedo: generarConcreto,
    generar_rugosidad: () => crearRugosidadSimple(512, 0.9, 16),
    generar_normal: () => crearNormalSimple(512, 12),
  },
  vidrio: {
    tamano_baldosa: 2.0,
    rugosidad: 0.05,
    metalicidad: 0.0,
    opacidad: 0.6,
    transparente: true,
    color_fallback: '#d4e8f5',
    generar_albedo: generarVidrio,
    generar_rugosidad: () => crearRugosidadSimple(256, 0.05, 2),
    generar_normal: () => crearNormalSimple(256, 2),
  },
  metal: {
    tamano_baldosa: 1.1,
    rugosidad: 0.28,
    metalicidad: 0.85,
    opacidad: 1,
    transparente: false,
    color_fallback: '#9ca3af',
    generar_albedo: generarMetal,
    generar_rugosidad: () => crearRugosidadSimple(256, 0.28, 10),
    generar_normal: () => crearNormalSimple(256, 8),
  },
};

const obtenerTexturaBase = (
  cache: Map<TipoMaterialArquitectonico, THREE.CanvasTexture>,
  tipo: TipoMaterialArquitectonico,
  creador: () => THREE.CanvasTexture,
) => {
  const actual = cache.get(tipo);
  if (actual) return actual;
  const textura = creador();
  cache.set(tipo, textura);
  return textura;
};

const clonarTextura = (
  textura: THREE.Texture,
  repeatX: number,
  repeatY: number,
) => {
  const clon = textura.clone();
  clon.wrapS = THREE.RepeatWrapping;
  clon.wrapT = THREE.RepeatWrapping;
  clon.repeat.set(repeatX, repeatY);
  clon.needsUpdate = true;
  return clon;
};

const calcularRepeticion = (ancho: number, alto: number, tamano_baldosa: number, repetir: boolean, escala = 1) => {
  if (!repetir) return { repeatX: 1, repeatY: 1 };
  const divisor = Math.max(tamano_baldosa * Math.max(escala, 0.25), 0.1);
  return {
    repeatX: Math.max(ancho / divisor, 1),
    repeatY: Math.max(alto / divisor, 1),
  };
};

export const crearMaterialPBRArquitectonico = ({
  tipo_material,
  ancho,
  alto,
  repetir_textura,
  escala_textura = 1,
  color_base,
  opacidad,
  rugosidad,
  metalicidad,
  resaltar = false,
}: OpcionesMaterialArquitectonico) => {
  const config = registroMateriales[tipo_material];
  const { repeatX, repeatY } = calcularRepeticion(ancho, alto, config.tamano_baldosa, repetir_textura, escala_textura);
  const albedoBase = obtenerTexturaBase(cacheAlbedo, tipo_material, config.generar_albedo);
  const rugosidadBase = obtenerTexturaBase(cacheRugosidad, tipo_material, config.generar_rugosidad);
  const normalBase = obtenerTexturaBase(cacheNormal, tipo_material, config.generar_normal);

  const albedo = clonarTextura(albedoBase, repeatX, repeatY);
  const roughnessMap = clonarTextura(rugosidadBase, repeatX, repeatY);
  const normalMap = clonarTextura(normalBase, repeatX, repeatY);

  const material = tipo_material === 'vidrio'
    ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(normalizarColor(color_base, config.color_fallback)),
        roughness: rugosidad ?? config.rugosidad,
        metalness: 0,
        transparent: true,
        opacity: opacidad ?? config.opacidad,
        transmission: 0.85,
        thickness: 0.02,
        ior: 1.5,
        reflectivity: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.0,
        emissive: new THREE.Color(resaltar ? '#9ec5ff' : '#000000'),
        emissiveIntensity: resaltar ? 0.1 : 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    : new THREE.MeshStandardMaterial({
        map: albedo,
        roughnessMap,
        normalMap,
        color: new THREE.Color(normalizarColor(color_base, config.color_fallback)),
        roughness: rugosidad ?? config.rugosidad,
        metalness: metalicidad ?? config.metalicidad,
        transparent: config.transparente || (opacidad ?? config.opacidad) < 1,
        opacity: opacidad ?? config.opacidad,
        emissive: new THREE.Color(resaltar ? '#6b7bff' : '#000000'),
        emissiveIntensity: resaltar ? 0.05 : 0,
        side: THREE.DoubleSide,
      });

  return { material, texturas: [albedo, roughnessMap, normalMap] };
};

export const crearMaterialMarcoArquitectonico = (tipo_material: TipoMaterialArquitectonico, resaltar = false) => {
  const materialMarco = tipo_material === 'metal' ? 'metal' : tipo_material === 'vidrio' ? 'metal' : 'madera';
  return crearMaterialPBRArquitectonico({
    tipo_material: materialMarco,
    ancho: 1,
    alto: 1,
    repetir_textura: true,
    escala_textura: 1,
    resaltar,
  });
};

export const liberarCachesMaterialesArquitectonicos = () => {
  cacheAlbedo.forEach((textura) => textura.dispose());
  cacheRugosidad.forEach((textura) => textura.dispose());
  cacheNormal.forEach((textura) => textura.dispose());
  cacheAlbedo.clear();
  cacheRugosidad.clear();
  cacheNormal.clear();
};
