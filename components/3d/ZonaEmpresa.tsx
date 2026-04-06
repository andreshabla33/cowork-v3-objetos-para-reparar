import React, { useEffect, useMemo, useState } from 'react';
import { useGLTF, Text } from '@react-three/drei';
import * as THREE from 'three';
import { FloorType, normalizarTipoSuelo } from '../../src/core/domain/entities';
import { crearPropsMaterialSueloPbr, TEXTURE_REGISTRY } from '../../lib/rendering/textureRegistry';

interface ZonaEmpresaProps {
  posicion: [number, number, number];
  ancho: number;
  alto: number;
  color: string;
  nombre?: string | null;
  logoUrl?: string | null;
  modeloUrl?: string | null;
  mostrarEtiqueta?: boolean;
  opacidad?: number;
  esZonaComun?: boolean;
  variante?: 'propia' | 'ajena' | 'comun';
  tipoSuelo?: string | null;
  onClick?: (e: any) => void;
  onDoubleClick?: (e: any) => void;
  onPointerDown?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerMove?: (e: any) => void;
}

const ZonaModel: React.FC<{ url: string; ancho: number; alto: number }> = ({ url, ancho, alto }) => {
  const { scene } = useGLTF(url);
  
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    
    // Calcular bounding box para escalar automáticamente al tamaño de la zona
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    
    // Escalar para que quepa en la zona (dejando un pequeño margen)
    const scaleX = (ancho * 0.9) / size.x;
    const scaleZ = (alto * 0.9) / size.z;
    const scale = Math.min(scaleX, scaleZ, 1); // No escalar hacia arriba si es pequeño
    
    clone.scale.set(scale, scale, scale);
    
    // Centrar
    const center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center.multiplyScalar(scale));
    clone.position.y = 0; // Alinear al suelo
    
    return clone;
  }, [scene, ancho, alto]);

  return <primitive object={clonedScene} />;
};

export const ZonaEmpresa: React.FC<ZonaEmpresaProps> = ({
  posicion,
  ancho,
  alto,
  color,
  nombre,
  logoUrl,
  modeloUrl,
  mostrarEtiqueta = true,
  opacidad = 0.35,
  esZonaComun = false,
  variante = 'propia',
  tipoSuelo,
  onClick,
  onDoubleClick,
  onPointerDown,
  onPointerUp,
  onPointerMove,
}) => {
  const [logoTexture, setLogoTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered && onClick) {
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = 'auto';
    }
    return () => { document.body.style.cursor = 'auto'; };
  }, [hovered, onClick]);

  useEffect(() => {
    setLogoTexture((prev) => {
      if (prev) prev.dispose();
      return null;
    });

    if (!logoUrl || modeloUrl) return;

    let cancelled = false;
    let textureCargada: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(
      logoUrl,
      (texture) => {
        const image = texture.image as {
          naturalWidth?: number;
          naturalHeight?: number;
          videoWidth?: number;
          videoHeight?: number;
          width?: number;
          height?: number;
        } | undefined;
        const width = Number(image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0);
        const height = Number(image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0);

        if (cancelled || width <= 0 || height <= 0) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        textureCargada = texture;
        setLogoTexture(texture);
      },
      undefined,
      () => {
        if (cancelled) return;
        setLogoTexture(null);
      }
    );

    return () => {
      cancelled = true;
      if (textureCargada) textureCargada.dispose();
    };
  }, [logoUrl, modeloUrl]);

  const mostrarLogo = useMemo(() => {
    return !modeloUrl && !!logoUrl && !!logoTexture?.image;
  }, [logoTexture, logoUrl, modeloUrl]);

  const estiloEtiqueta = useMemo(() => {
    if (variante === 'ajena') return '#fca5a5';
    if (variante === 'comun') return '#bae6fd';
    return '#f8fafc';
  }, [variante]);

  const bordeZona = useMemo(() => {
    if (variante === 'ajena') return { color: '#f97316', opacity: 0.45 };
    if (variante === 'comun') return { color: '#7dd3fc', opacity: 0.3 };
    return { color: '#a78bfa', opacity: 0.25 };
  }, [variante]);

  const tipoSueloNormalizado = useMemo(() => normalizarTipoSuelo(tipoSuelo), [tipoSuelo]);

  const pbrMaterialProps = useMemo(() => {
    if (!TEXTURE_REGISTRY[tipoSueloNormalizado]) return null;
    return crearPropsMaterialSueloPbr(tipoSueloNormalizado, ancho, alto, 1);
  }, [tipoSueloNormalizado, ancho, alto]);

  useEffect(() => {
    return () => {
      pbrMaterialProps?.map?.dispose();
    };
  }, [pbrMaterialProps]);

  return (
    <group>
      {modeloUrl ? (
        <group position={[posicion[0], 0, posicion[2]]}>
          <ZonaModel url={modeloUrl} ancho={ancho} alto={alto} />
        </group>
      ) : (
        <>
          <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={posicion} 
            receiveShadow
            onClick={(e) => {
              if (onClick) {
                e.stopPropagation();
                onClick(e);
              }
            }}
            onDoubleClick={(e) => {
              if (onDoubleClick) {
                e.stopPropagation();
                onDoubleClick(e);
              }
            }}
            onPointerDown={(e) => {
              if (onPointerDown) {
                e.stopPropagation();
                onPointerDown(e);
              }
            }}
            onPointerUp={(e) => {
              if (onPointerUp) {
                e.stopPropagation();
                onPointerUp(e);
              }
            }}
            onPointerMove={(e) => {
              if (onPointerMove) {
                if (e.stopPropagation) e.stopPropagation();
                onPointerMove(e);
              }
            }}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
          >
            <planeGeometry args={[ancho, alto]} />
            {pbrMaterialProps ? (
              <meshStandardMaterial 
                {...pbrMaterialProps} 
                color="#ffffff" 
                side={THREE.DoubleSide} 
                transparent={pbrMaterialProps.transparent || hovered}
                opacity={hovered ? Math.min(1, pbrMaterialProps.opacity + 0.12) : pbrMaterialProps.opacity}
              />
            ) : (
              <meshStandardMaterial color={color} transparent opacity={hovered ? Math.min(1, opacidad + 0.12) : opacidad} />
            )}
            
            {/* Outline on hover for admin selection clarity */}
            {hovered && (
              <lineSegments rotation={[0, 0, 0]} position={[0, 0, 0.01]} >
                <edgesGeometry args={[new THREE.PlaneGeometry(ancho, alto)]} />
                <lineBasicMaterial color="white" linewidth={2} />
              </lineSegments>
            )}
          </mesh>

          {/* Logo si existe */}
          {logoTexture && !modeloUrl && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[posicion[0], 0.02, posicion[2]]}>
              <planeGeometry args={[Math.min(ancho, alto) * 0.4, Math.min(ancho, alto) * 0.4]} />
              <meshBasicMaterial map={logoTexture} transparent side={THREE.DoubleSide} />
            </mesh>
          )}
        </>
      )}

      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[posicion[0], posicion[1] + 0.02, posicion[2]]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(ancho, alto)]} />
        <lineBasicMaterial color={bordeZona.color} transparent opacity={bordeZona.opacity} />
      </lineSegments>

      {mostrarLogo && !modeloUrl && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[posicion[0] - ancho * 0.32, posicion[1] + 0.02, posicion[2] - alto * 0.32]}>
          <planeGeometry args={[Math.min(ancho, alto) * 0.28, Math.min(ancho, alto) * 0.28]} />
          <meshBasicMaterial map={logoTexture} transparent opacity={0.9} />
        </mesh>
      )}

      {mostrarEtiqueta && (
        <Text position={[posicion[0], posicion[1] + 0.12, posicion[2] + alto * 0.42]} fontSize={0.28} color={esZonaComun ? '#cbd5f5' : estiloEtiqueta} anchorX="center" anchorY="middle">
          {nombre || (esZonaComun ? 'Zona Común' : 'Zona de Empresa')}
        </Text>
      )}
    </group>
  );
};

export default ZonaEmpresa;
