import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  normalizarConfiguracionGeometricaObjeto,
  type AberturaArquitectonica,
} from '@/src/core/domain/entities/objetosArquitectonicos';
import { resolverPerfilVisualArquitectonico } from '@/src/core/domain/entities/estilosVisualesArquitectonicos';
import {
  crearMaterialMarcoArquitectonico,
  crearMaterialPBRArquitectonico,
} from '@/src/core/infrastructure/fabricaMaterialesArquitectonicos';

interface ObjetoProceduralLike {
  built_in_geometry?: string | null;
  built_in_color?: string | null;
  ancho?: number | string | null;
  alto?: number | string | null;
  profundidad?: number | string | null;
  configuracion_geometria?: unknown;
}

interface GeometriaProceduralObjeto3DProps {
  objeto: ObjetoProceduralLike;
  dimensiones: [number, number, number];
  opacidad: number;
  transparente: boolean;
  resaltar: boolean;
}

interface AberturaRenderizable extends AberturaArquitectonica {
  izquierda: number;
  derecha: number;
  inferior: number;
  superior: number;
}

const clamp = (valor: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

const normalizarGeometriaLegacy = (valor?: string | null) => (valor || '').trim().toLowerCase();

const crearGeneradorUVPared = (ancho: number, alto: number) => ({
  generateTopUV: (_geometry: THREE.ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number) => {
    const leer = (index: number) => new THREE.Vector2(
      (vertices[index * 3] + ancho / 2) / Math.max(ancho, 0.001),
      (vertices[index * 3 + 1] + alto / 2) / Math.max(alto, 0.001),
    );
    return [leer(indexA), leer(indexB), leer(indexC)];
  },
  generateSideWallUV: (_geometry: THREE.ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number, indexD: number) => {
    const puntos = [indexA, indexB, indexC, indexD].map((indice) => ({
      x: vertices[indice * 3],
      y: vertices[indice * 3 + 1],
      z: vertices[indice * 3 + 2],
    }));
    const anchoSegmento = Math.max(Math.abs(puntos[0].x - puntos[1].x), Math.abs(puntos[0].y - puntos[1].y), 0.001);
    const profundidadSegmento = Math.max(...puntos.map((punto) => punto.z)) - Math.min(...puntos.map((punto) => punto.z)) || 0.001;
    return [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(anchoSegmento, 0),
      new THREE.Vector2(anchoSegmento, profundidadSegmento),
      new THREE.Vector2(0, profundidadSegmento),
    ];
  },
});

const normalizarAberturas = (
  aberturas: AberturaArquitectonica[],
  ancho: number,
  alto: number,
): AberturaRenderizable[] => {
  const margen = 0.08;
  return aberturas.map((abertura) => {
    const anchoAbertura = clamp(abertura.ancho, 0.2, Math.max(0.2, ancho - margen * 2));
    const altoAbertura = clamp(abertura.alto, 0.2, Math.max(0.2, alto - margen * 2));
    const izquierda = clamp(abertura.posicion_x - anchoAbertura / 2, -ancho / 2 + margen, ancho / 2 - margen - anchoAbertura);
    const inferior = clamp(abertura.posicion_y - altoAbertura / 2, -alto / 2 + margen, alto / 2 - margen - altoAbertura);
    return {
      ...abertura,
      ancho: anchoAbertura,
      alto: altoAbertura,
      izquierda,
      derecha: izquierda + anchoAbertura,
      inferior,
      superior: inferior + altoAbertura,
    };
  });
};

const crearHuecoAbertura = (abertura: AberturaRenderizable) => {
  const hueco = new THREE.Path();
  if (abertura.forma === 'arco') {
    const radio = Math.min(abertura.ancho / 2, abertura.alto * 0.4);
    const alturaArranqueArco = abertura.superior - radio;
    const centroX = (abertura.izquierda + abertura.derecha) / 2;

    hueco.moveTo(abertura.izquierda, abertura.inferior);
    hueco.lineTo(abertura.izquierda, alturaArranqueArco);
    hueco.absarc(
      centroX,
      alturaArranqueArco,
      radio,
      Math.PI,
      0,
      true,
    );
    hueco.lineTo(abertura.derecha, abertura.inferior);
    hueco.closePath();
    return hueco;
  }
  hueco.moveTo(abertura.izquierda, abertura.inferior);
  hueco.lineTo(abertura.izquierda, abertura.superior);
  hueco.lineTo(abertura.derecha, abertura.superior);
  hueco.lineTo(abertura.derecha, abertura.inferior);
  hueco.closePath();
  return hueco;
};

export const GeometriaProceduralObjeto3D: React.FC<GeometriaProceduralObjeto3DProps> = ({
  objeto,
  dimensiones,
  opacidad,
  transparente,
  resaltar,
}) => {
  const [ancho, alto, profundidad] = dimensiones;
  const geometriaLegacy = normalizarGeometriaLegacy(objeto.built_in_geometry);
  const esMamparaOficina = geometriaLegacy === 'wall-glass';
  const esVentanaOficina = geometriaLegacy === 'wall-window' || geometriaLegacy === 'wall-window-double';
  const esArco = geometriaLegacy === 'wall-arch';
  const esPuertaLegacy = geometriaLegacy === 'wall-door' || geometriaLegacy === 'wall-door-double';
  const esDivisionInteriorOficina = esMamparaOficina || esVentanaOficina;
  const esMuroPerimetral = esVentanaOficina || esArco || esPuertaLegacy;
  const configuracion = useMemo(() => {
    return normalizarConfiguracionGeometricaObjeto({
      built_in_geometry: objeto.built_in_geometry,
      built_in_color: objeto.built_in_color,
      configuracion_geometria: objeto.configuracion_geometria,
      ancho,
      alto,
      profundidad,
    });
  }, [alto, ancho, objeto.built_in_color, objeto.built_in_geometry, objeto.configuracion_geometria, profundidad]);

  const aberturas = useMemo(() => {
    return configuracion?.tipo_geometria === 'pared'
      ? normalizarAberturas(configuracion.aberturas, ancho, alto)
      : [];
  }, [alto, ancho, configuracion]);

  const opacidadFinal = transparente
    ? Math.min(opacidad, configuracion?.opacidad ?? opacidad)
    : (configuracion?.opacidad ?? opacidad);

  const perfilVisual = useMemo(() => {
    return resolverPerfilVisualArquitectonico(configuracion?.estilo_visual ?? 'corporativo');
  }, [configuracion?.estilo_visual]);

  const materialFrontal = useMemo(() => {
    if (!configuracion) return null;
    return crearMaterialPBRArquitectonico({
      tipo_material: configuracion.tipo_material,
      ancho,
      alto,
      repetir_textura: configuracion.repetir_textura,
      escala_textura: configuracion.escala_textura,
      color_base: configuracion.color_base,
      opacidad: opacidadFinal,
      rugosidad: configuracion.rugosidad ?? undefined,
      metalicidad: configuracion.metalicidad ?? undefined,
      resaltar,
    });
  }, [alto, ancho, configuracion, opacidadFinal, resaltar]);

  const materialLateral = useMemo(() => {
    if (!configuracion) return null;
    return crearMaterialPBRArquitectonico({
      tipo_material: configuracion.tipo_material,
      ancho: Math.max(profundidad, 0.08),
      alto,
      repetir_textura: configuracion.repetir_textura,
      escala_textura: configuracion.escala_textura,
      color_base: configuracion.color_base,
      opacidad: opacidadFinal,
      rugosidad: configuracion.rugosidad ?? undefined,
      metalicidad: configuracion.metalicidad ?? undefined,
      resaltar,
    });
  }, [alto, configuracion, opacidadFinal, profundidad, resaltar]);

  const materialMarco = useMemo(() => {
    if (!configuracion) return null;
    return crearMaterialMarcoArquitectonico(configuracion.tipo_material, resaltar);
  }, [configuracion, resaltar]);

  const materialVidrio = useMemo(() => {
    return crearMaterialPBRArquitectonico({
      tipo_material: 'vidrio',
      ancho: Math.max(ancho * 0.5, 1),
      alto: Math.max(alto * 0.5, 1),
      repetir_textura: false,
      escala_textura: 1,
      color_base: perfilVisual.materiales.color_vidrio,
      opacidad: esMamparaOficina ? perfilVisual.materiales.opacidad_vidrio_mampara : perfilVisual.materiales.opacidad_vidrio_ventana,
      rugosidad: esMamparaOficina ? perfilVisual.materiales.rugosidad_vidrio_mampara : perfilVisual.materiales.rugosidad_vidrio_ventana,
      metalicidad: 0,
      resaltar,
    });
  }, [alto, ancho, esMamparaOficina, perfilVisual, resaltar]);

  const materialMetal = useMemo(() => {
    return crearMaterialPBRArquitectonico({
      tipo_material: 'metal',
      ancho: 1,
      alto: 1,
      repetir_textura: true,
      escala_textura: 1,
      color_base: perfilVisual.materiales.color_metal,
      opacidad: 1,
      rugosidad: 0.32,
      metalicidad: 0.88,
      resaltar,
    });
  }, [perfilVisual, resaltar]);

  const aberturaPrincipal = aberturas[0] ?? null;
  const alturaRemateDivision = aberturaPrincipal
    ? clamp(aberturaPrincipal.inferior, -alto / 2 + 0.18, alto / 2 - 0.24)
    : null;
  const alturaBandaPerimetral = aberturaPrincipal
    ? clamp(aberturaPrincipal.superior + 0.035, -alto / 2 + 0.24, alto / 2 - 0.05)
    : null;
  const alturaPechoPerimetral = aberturaPrincipal
    ? clamp(aberturaPrincipal.inferior - 0.045, -alto / 2 + 0.08, alto / 2 - 0.12)
    : null;

  const geometriaPared = useMemo(() => {
    if (!configuracion || configuracion.tipo_geometria !== 'pared') return null;
    const shape = new THREE.Shape();
    shape.moveTo(-ancho / 2, -alto / 2);
    shape.lineTo(ancho / 2, -alto / 2);
    shape.lineTo(ancho / 2, alto / 2);
    shape.lineTo(-ancho / 2, alto / 2);
    shape.lineTo(-ancho / 2, -alto / 2);
    aberturas.forEach((abertura) => {
      shape.holes.push(crearHuecoAbertura(abertura));
    });
    const geometria = new THREE.ExtrudeGeometry(shape, {
      depth: profundidad,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 24,
      UVGenerator: crearGeneradorUVPared(ancho, alto),
    });
    geometria.translate(0, 0, -profundidad / 2);
    geometria.computeVertexNormals();
    return geometria;
  }, [aberturas, alto, ancho, configuracion, profundidad]);

  const geometriaCaja = useMemo(() => {
    if (!configuracion || configuracion.tipo_geometria !== 'caja') return null;
    return new THREE.BoxGeometry(ancho, alto, profundidad);
  }, [alto, ancho, configuracion, profundidad]);

  const geometriaCilindro = useMemo(() => {
    if (!configuracion || configuracion.tipo_geometria !== 'cilindro') return null;
    return new THREE.CylinderGeometry(ancho / 2, ancho / 2, alto, 32);
  }, [alto, ancho, configuracion]);

  const geometriaPlano = useMemo(() => {
    if (!configuracion || configuracion.tipo_geometria !== 'plano') return null;
    return new THREE.PlaneGeometry(ancho, alto, 1, 1);
  }, [alto, ancho, configuracion]);

  useEffect(() => {
    return () => {
      geometriaPared?.dispose();
      geometriaCaja?.dispose();
      geometriaCilindro?.dispose();
      geometriaPlano?.dispose();
      materialFrontal?.material.dispose();
      materialLateral?.material.dispose();
      materialMarco?.material.dispose();
      materialVidrio?.material.dispose();
      materialMetal?.material.dispose();
      materialFrontal?.texturas.forEach((textura) => textura.dispose());
      materialLateral?.texturas.forEach((textura) => textura.dispose());
      materialMarco?.texturas.forEach((textura) => textura.dispose());
      materialVidrio?.texturas.forEach((textura) => textura.dispose());
      materialMetal?.texturas.forEach((textura) => textura.dispose());
    };
  }, [geometriaCaja, geometriaCilindro, geometriaPared, geometriaPlano, materialFrontal, materialLateral, materialMarco, materialVidrio, materialMetal]);

  if (!configuracion || !materialFrontal) {
    return null;
  }

  return (
    <group>
      {geometriaPared && materialLateral && (
        <mesh geometry={geometriaPared} material={[materialFrontal.material, materialLateral.material]} castShadow receiveShadow />
      )}

      {configuracion.tipo_geometria === 'pared' && esDivisionInteriorOficina && materialMetal && alturaRemateDivision !== null && perfilVisual.render.mostrar_remates_division && (
        <>
          <mesh position={[0, alturaRemateDivision, 0]} castShadow receiveShadow>
            <boxGeometry args={[Math.max(ancho - 0.02, 0.08), perfilVisual.render.espesor_remate_division, Math.min(Math.max(profundidad * 0.82, 0.022), 0.05)]} />
            <primitive object={materialMetal.material} attach="material" />
          </mesh>
          <mesh position={[0, alto / 2 - 0.03, 0]} castShadow receiveShadow>
            <boxGeometry args={[Math.max(ancho - 0.02, 0.08), perfilVisual.render.espesor_cabezal_division, Math.min(Math.max(profundidad * 0.78, 0.02), 0.045)]} />
            <primitive object={materialMetal.material} attach="material" />
          </mesh>
        </>
      )}

      {configuracion.tipo_geometria === 'pared' && esMamparaOficina && materialMetal && perfilVisual.render.mostrar_montantes_laterales_mampara && (
        <>
          <mesh position={[-ancho / 2 + 0.022, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[perfilVisual.render.espesor_montante_lateral, Math.max(alto - 0.02, 0.2), Math.min(Math.max(profundidad * 0.76, 0.02), 0.04)]} />
            <primitive object={materialMetal.material} attach="material" />
          </mesh>
          <mesh position={[ancho / 2 - 0.022, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[perfilVisual.render.espesor_montante_lateral, Math.max(alto - 0.02, 0.2), Math.min(Math.max(profundidad * 0.76, 0.02), 0.04)]} />
            <primitive object={materialMetal.material} attach="material" />
          </mesh>
        </>
      )}

      {configuracion.tipo_geometria === 'pared' && esMuroPerimetral && aberturaPrincipal && alturaPechoPerimetral !== null && perfilVisual.render.mostrar_bandas_perimetrales && (
        <mesh position={[0, alturaPechoPerimetral, 0]} castShadow receiveShadow>
          <boxGeometry args={[Math.max(ancho - 0.04, 0.12), perfilVisual.render.grosor_banda_perimetral_inferior, Math.min(Math.max(profundidad * 0.86, 0.03), 0.075)]} />
          <primitive object={materialFrontal.material} attach="material" />
        </mesh>
      )}

      {configuracion.tipo_geometria === 'pared' && esMuroPerimetral && aberturaPrincipal && alturaBandaPerimetral !== null && perfilVisual.render.mostrar_bandas_perimetrales && (
        <mesh position={[0, alturaBandaPerimetral, 0]} castShadow receiveShadow>
          <boxGeometry args={[Math.max(ancho - 0.02, 0.12), perfilVisual.render.grosor_banda_perimetral_superior, Math.min(Math.max(profundidad * 0.86, 0.03), 0.07)]} />
          <primitive object={materialFrontal.material} attach="material" />
        </mesh>
      )}

      {geometriaCaja && (
        <mesh geometry={geometriaCaja} material={materialFrontal.material} castShadow receiveShadow />
      )}

      {geometriaCilindro && (
        <mesh geometry={geometriaCilindro} material={materialFrontal.material} castShadow receiveShadow />
      )}

      {geometriaPlano && (
        <mesh geometry={geometriaPlano} material={materialFrontal.material} castShadow receiveShadow />
      )}

      {configuracion.tipo_geometria === 'pared' && materialMarco && materialVidrio && materialMetal && aberturas.map((abertura) => {
        const frameDepth = clamp(Math.max(profundidad * 0.92, abertura.profundidad_marco), 0.02, Math.max(profundidad, 0.02));
        const grosorBase = clamp(abertura.grosor_marco, 0.02, Math.min(abertura.ancho * 0.2, abertura.alto * 0.2));
        const grosor = esMamparaOficina
          ? Math.min(grosorBase, perfilVisual.render.grosor_perfil_mampara_max)
          : esVentanaOficina
            ? clamp(grosorBase, perfilVisual.render.grosor_perfil_ventana_min, perfilVisual.render.grosor_perfil_ventana_max)
            : grosorBase;
        const anchoInterior = Math.max(0.08, abertura.ancho - grosor * 2);
        const altoInterior = Math.max(0.08, abertura.alto - grosor * 2);
        const centroX = (abertura.izquierda + abertura.derecha) / 2;
        const centroY = (abertura.inferior + abertura.superior) / 2;
        const zPuerta = profundidad / 2 - frameDepth / 2;
        const espesorHoja = Math.max(0.02, Math.min(profundidad * 0.45, 0.05));
        const usarMarcoMetal = esMamparaOficina || abertura.tipo === 'ventana';
        const materialPerfil = usarMarcoMetal ? materialMetal.material : materialMarco.material;
        const alturaArranqueArco = abertura.superior - Math.min(abertura.ancho / 2, abertura.alto * 0.4);
        const alturaJambaArco = Math.max(0.08, alturaArranqueArco - abertura.inferior + grosor);
        const montanteVentana = (esMamparaOficina || esVentanaOficina) && anchoInterior > 1.05;
        const espesorVidrio = Math.min(frameDepth * 0.22, 0.025);
        return (
          <group key={abertura.id}>
            {abertura.forma !== 'arco' && (
              <mesh position={[centroX, abertura.superior - grosor / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[abertura.ancho, grosor, frameDepth]} />
                <primitive object={materialPerfil} attach="material" />
              </mesh>
            )}
            {(abertura.tipo === 'ventana' || abertura.insertar_cerramiento) && (
              <mesh position={[centroX, abertura.inferior + grosor / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[abertura.ancho, grosor, frameDepth]} />
                <primitive object={materialPerfil} attach="material" />
              </mesh>
            )}
            <mesh position={[abertura.izquierda + grosor / 2, abertura.forma === 'arco' ? ((abertura.inferior + alturaArranqueArco) / 2) : centroY, 0]} castShadow receiveShadow>
              <boxGeometry args={[grosor, abertura.forma === 'arco' ? alturaJambaArco : abertura.alto, frameDepth]} />
              <primitive object={materialPerfil} attach="material" />
            </mesh>
            <mesh position={[abertura.derecha - grosor / 2, abertura.forma === 'arco' ? ((abertura.inferior + alturaArranqueArco) / 2) : centroY, 0]} castShadow receiveShadow>
              <boxGeometry args={[grosor, abertura.forma === 'arco' ? alturaJambaArco : abertura.alto, frameDepth]} />
              <primitive object={materialPerfil} attach="material" />
            </mesh>

            {abertura.tipo === 'ventana' && (
              <>
                <mesh position={[centroX, centroY, 0]} castShadow receiveShadow>
                  <boxGeometry args={[anchoInterior, altoInterior, espesorVidrio]} />
                  <primitive object={materialVidrio.material} attach="material" />
                </mesh>
                {montanteVentana && (
                  <mesh position={[centroX, centroY, 0]} castShadow receiveShadow>
                    <boxGeometry args={[grosor * 0.7, altoInterior, Math.min(frameDepth * 0.92, 0.04)]} />
                    <primitive object={materialMetal.material} attach="material" />
                  </mesh>
                )}
              </>
            )}

            {abertura.tipo === 'puerta' && abertura.insertar_cerramiento && !esArco && !esPuertaLegacy && (
              <mesh position={[centroX, centroY, zPuerta]} castShadow receiveShadow>
                <boxGeometry args={[anchoInterior, altoInterior, espesorHoja]} />
                <primitive object={materialMarco.material} attach="material" />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};
