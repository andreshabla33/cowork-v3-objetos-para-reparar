/**
 * @module infrastructure/adapters/ThreeTextureFactoryAdapter
 *
 * Adapter que implementa ITextureFactory usando Three.js.
 * Clean Architecture: capa de infraestructura — único lugar donde se importa THREE.
 *
 * Conecta el port de dominio (ITextureFactory) con la implementación concreta
 * en lib/rendering/textureRegistry.ts y lib/rendering/fabricaMaterialesArquitectonicos.ts
 *
 * Ref CLEAN-ARCH-F3: Adapter registrado en el contenedor DI.
 */

import * as THREE from 'three';
import type { ITextureFactory, TexturaAbstracta, PBRMaterialProps, ColorLineal } from '../../domain/ports/ITextureFactory';
import type { FloorType } from '../../domain/entities';
import { crearPropsMaterialSueloPbr } from '../../../../lib/rendering/textureRegistry';

// ─── Adaptación de tipos ──────────────────────────────────────────────────────

/** Convierte un THREE.Color al ColorLineal del dominio */
const threeColorAColorLineal = (color: THREE.Color): ColorLineal => ({
  r: color.r,
  g: color.g,
  b: color.b,
});

/** Convierte una THREE.Texture a TexturaAbstracta del dominio */
const threeTextureAAbstracta = (texture: THREE.Texture): TexturaAbstracta => ({
  id: texture.uuid,
  ready: texture.image !== undefined && texture.image !== null,
  // Referencia interna para el adapter (no expuesta al dominio)
  _threeTexture: texture,
} as TexturaAbstracta & { _threeTexture: THREE.Texture });

// ─── Cache interna del adapter ────────────────────────────────────────────────

const cacheTexturas = new Map<FloorType, THREE.Texture>();
const cacheAbstractas = new Map<FloorType, TexturaAbstracta>();

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class ThreeTextureFactoryAdapter implements ITextureFactory {

  /**
   * Obtiene la textura de albedo para un tipo de suelo.
   * Usa lazy loading + cache para evitar re-creación en cada frame.
   */
  getAlbedoTexture(floorType: FloorType): TexturaAbstracta {
    if (cacheAbstractas.has(floorType)) {
      return cacheAbstractas.get(floorType)!;
    }

    // Delegamos al registro existente para generar la textura THREE.js
    const propsConcretos = crearPropsMaterialSueloPbr(floorType, 1, 1, 1);
    const threeTexture = propsConcretos.map as THREE.Texture;

    cacheTexturas.set(floorType, threeTexture);
    const abstracta = threeTextureAAbstracta(threeTexture);
    cacheAbstractas.set(floorType, abstracta);

    return abstracta;
  }

  /**
   * Construye las propiedades de material PBR para un suelo.
   * Convierte los tipos Three.js a tipos abstractos del dominio.
   */
  buildMaterialProps(
    floorType: FloorType,
    ancho: number,
    alto: number,
    opacidad = 1,
  ): PBRMaterialProps {
    const propsConcretos = crearPropsMaterialSueloPbr(floorType, ancho, alto, opacidad);

    return {
      map: threeTextureAAbstracta(propsConcretos.map as THREE.Texture),
      roughness: propsConcretos.roughness,
      metalness: propsConcretos.metalness,
      transparent: propsConcretos.transparent,
      opacity: propsConcretos.opacity,
      emissive: threeColorAColorLineal(propsConcretos.emissive as THREE.Color),
      emissiveIntensity: propsConcretos.emissiveIntensity,
      polygonOffset: propsConcretos.polygonOffset,
      polygonOffsetFactor: propsConcretos.polygonOffsetFactor,
      polygonOffsetUnits: propsConcretos.polygonOffsetUnits,
    };
  }

  /**
   * Libera todas las texturas de GPU cacheadas.
   * Llamar en el cleanup del workspace 3D.
   */
  dispose(): void {
    for (const texture of cacheTexturas.values()) {
      texture.dispose();
    }
    cacheTexturas.clear();
    cacheAbstractas.clear();
  }

  /**
   * Obtiene la THREE.Texture concreta desde una TexturaAbstracta.
   * Solo para uso interno de la capa de presentación (ThreeJS).
   * @internal — no forma parte del port ITextureFactory
   */
  static resolverThreeTexture(abstracta: TexturaAbstracta): THREE.Texture | null {
    return (abstracta as TexturaAbstracta & { _threeTexture?: THREE.Texture })._threeTexture ?? null;
  }
}
