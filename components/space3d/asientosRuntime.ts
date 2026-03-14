import type { AnimationState } from '../avatar3d/shared';
import type { EspacioObjeto } from '@/hooks/space3d/useEspacioObjetos';
import { obtenerDimensionesObjetoRuntime, obtenerRadioInteraccionObjeto, normalizarNumeroRuntime3D, rotarOffsetXZ } from './objetosRuntime';
import { CHAIR_POSITIONS_3D, CHAIR_SIT_RADIUS, RADIO_COLISION_AVATAR } from './shared';

export interface PerfilAsiento3D {
  tipoPerfil: 'silla' | 'sofa' | 'banco' | 'generico';
  factorCaderaSentada: number;
  ajusteVertical: number;
  retrocesoMin: number;
  retrocesoMax: number;
  profundidadFactor: number;
  adelantoMaximo: number;
  correccionFrontal: number;
  aproximacionFrontal: number;
}

const PERFILES_ASIENTO: Record<PerfilAsiento3D['tipoPerfil'], PerfilAsiento3D> = {
  silla: {
    tipoPerfil: 'silla',
    factorCaderaSentada: 0.56,
    ajusteVertical: 0,
    retrocesoMin: 0.08,
    retrocesoMax: 0.16,
    profundidadFactor: 0.15,
    adelantoMaximo: 0.05,
    correccionFrontal: 0.045,
    aproximacionFrontal: 0.08,
  },
  sofa: {
    tipoPerfil: 'sofa',
    factorCaderaSentada: 0.54,
    ajusteVertical: 0,
    retrocesoMin: 0.12,
    retrocesoMax: 0.22,
    profundidadFactor: 0.18,
    adelantoMaximo: 0.04,
    correccionFrontal: 0.13,
    aproximacionFrontal: 0.14,
  },
  banco: {
    tipoPerfil: 'banco',
    factorCaderaSentada: 0.58,
    ajusteVertical: 0,
    retrocesoMin: 0.06,
    retrocesoMax: 0.12,
    profundidadFactor: 0.12,
    adelantoMaximo: 0.06,
    correccionFrontal: 0.02,
    aproximacionFrontal: 0.05,
  },
  generico: {
    tipoPerfil: 'generico',
    factorCaderaSentada: 0.56,
    ajusteVertical: 0,
    retrocesoMin: 0.08,
    retrocesoMax: 0.18,
    profundidadFactor: 0.16,
    adelantoMaximo: 0.05,
    correccionFrontal: 0.03,
    aproximacionFrontal: 0.07,
  },
};

const resolverPerfilAsientoObjeto = (objeto: EspacioObjeto, profundidad: number): PerfilAsiento3D => {
  const tipoCompuesto = `${String(objeto.tipo || '')} ${String((objeto as any).catalogo_tipo || '')}`.toLowerCase();
  if (tipoCompuesto.includes('sofa') || tipoCompuesto.includes('couch') || tipoCompuesto.includes('sillon')) {
    return PERFILES_ASIENTO.sofa;
  }
  if (tipoCompuesto.includes('banco') || tipoCompuesto.includes('bench') || tipoCompuesto.includes('taburete') || tipoCompuesto.includes('stool')) {
    return PERFILES_ASIENTO.banco;
  }
  if (tipoCompuesto.includes('silla') || tipoCompuesto.includes('chair') || tipoCompuesto.includes('seat')) {
    return PERFILES_ASIENTO.silla;
  }
  if (profundidad >= 0.85) {
    return PERFILES_ASIENTO.sofa;
  }
  return PERFILES_ASIENTO.generico;
};

export interface Posicion3DPlano {
  x: number;
  z: number;
}

export interface AsientoRuntime3D {
  id: string;
  posicion: {
    x: number;
    y: number;
    z: number;
  };
  rotacion: number;
  radioActivacion: number;
  radioCaptura: number;
  tipo: 'silla_demo' | 'objeto_persistente';
  objetoId?: string | null;
  claveAsiento?: string;
  obstaculoId?: string | null;
  perfil: PerfilAsiento3D;
}

const CENTRO_ASIENTOS_DEMO = CHAIR_POSITIONS_3D.reduce(
  (acc, [x, z]) => ({ x: acc.x + x, z: acc.z + z }),
  { x: 0, z: 0 }
);

CENTRO_ASIENTOS_DEMO.x /= CHAIR_POSITIONS_3D.length || 1;
CENTRO_ASIENTOS_DEMO.z /= CHAIR_POSITIONS_3D.length || 1;

export const crearAsientosDemo3D = (): AsientoRuntime3D[] => {
  return CHAIR_POSITIONS_3D.map(([x, z], indice) => {
    const haciaCentroX = CENTRO_ASIENTOS_DEMO.x - x;
    const haciaCentroZ = CENTRO_ASIENTOS_DEMO.z - z;

    return {
      id: `asiento_demo_${indice + 1}`,
      posicion: {
        x,
        y: 0.35,
        z,
      },
      rotacion: Math.atan2(haciaCentroX, haciaCentroZ),
      radioActivacion: CHAIR_SIT_RADIUS,
      radioCaptura: 0.7,
      tipo: 'silla_demo',
      objetoId: null,
      claveAsiento: 'principal',
      obstaculoId: `obstaculo_asiento_demo_${indice + 1}`,
      perfil: PERFILES_ASIENTO.silla,
    };
  });
};

export const crearAsientosObjetos3D = (objetos: EspacioObjeto[]): AsientoRuntime3D[] => {
  return objetos
    .filter((objeto) => !!objeto.es_sentable)
    .map((objeto) => {
      const dimensiones = obtenerDimensionesObjetoRuntime(objeto);
      const perfil = resolverPerfilAsientoObjeto(objeto, dimensiones.profundidad);
      const radioActivacion = obtenerRadioInteraccionObjeto(
        objeto,
        Math.max(CHAIR_SIT_RADIUS, Math.max(dimensiones.ancho, dimensiones.profundidad) * 0.55)
      );
      const profundidadAcceso = Math.max(0.18, dimensiones.profundidad / 2);
      const radioCaptura = Math.min(
        radioActivacion,
        Math.max(0.72, Math.min(1.15, profundidadAcceso + RADIO_COLISION_AVATAR + 0.18))
      );
      const retrocesoPelvis = Math.min(
        perfil.retrocesoMax,
        Math.max(perfil.retrocesoMin, dimensiones.profundidad * perfil.profundidadFactor)
      );
      const offsetZBruto = normalizarNumeroRuntime3D(objeto.sit_offset_z, 0);
      const offsetZLimitado = Math.min(offsetZBruto, Math.min(perfil.adelantoMaximo, dimensiones.profundidad * 0.08));
      const offsetRotado = rotarOffsetXZ(
        normalizarNumeroRuntime3D(objeto.sit_offset_x, 0),
        offsetZLimitado - retrocesoPelvis + perfil.correccionFrontal,
        objeto.rotacion_y || 0
      );

      return {
        id: `asiento_objeto_${objeto.id}`,
        posicion: {
          x: objeto.posicion_x + offsetRotado.x,
          y: objeto.posicion_y + normalizarNumeroRuntime3D(objeto.sit_offset_y, dimensiones.alto * 0.4),
          z: objeto.posicion_z + offsetRotado.z,
        },
        rotacion: (objeto.rotacion_y || 0) + normalizarNumeroRuntime3D(objeto.sit_rotation_y, 0),
        radioActivacion,
        radioCaptura,
        tipo: 'objeto_persistente',
        objetoId: objeto.id,
        claveAsiento: 'principal',
        obstaculoId: `obstaculo_objeto_${objeto.id}`,
        perfil,
      };
    });
};

export const buscarAsientoCercano = (
  posicionUsuario: Posicion3DPlano,
  asientos: AsientoRuntime3D[] = crearAsientosDemo3D()
): AsientoRuntime3D | null => {
  let asientoCercano: AsientoRuntime3D | null = null;
  let distanciaMinima = Number.POSITIVE_INFINITY;

  for (const asiento of asientos) {
    const dx = posicionUsuario.x - asiento.posicion.x;
    const dz = posicionUsuario.z - asiento.posicion.z;
    const distancia = Math.sqrt(dx * dx + dz * dz);

    if (distancia <= asiento.radioActivacion && distancia < distanciaMinima) {
      distanciaMinima = distancia;
      asientoCercano = asiento;
    }
  }

  return asientoCercano;
};

export const resolverAsientoUsuario = (
  posicionUsuario: Posicion3DPlano,
  animacion?: AnimationState | null,
  asientos: AsientoRuntime3D[] = crearAsientosDemo3D()
): AsientoRuntime3D | null => {
  if (animacion && !esAnimacionAsiento(animacion)) {
    return null;
  }

  return buscarAsientoCercano(posicionUsuario, asientos);
};

export const esAnimacionAsiento = (animacion?: AnimationState | null): boolean => {
  return animacion === 'sit' || animacion === 'sit_down' || animacion === 'stand_up';
};
