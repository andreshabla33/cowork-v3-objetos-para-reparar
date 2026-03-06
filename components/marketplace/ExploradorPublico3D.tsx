'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { TerrenoMarketplace, ZonaEmpresa } from '@/types';
import { cargarTerrenosPublicos, cargarZonasPublicas, cargarEmpresasPublicas, cargarObjetosPublicos } from '@/lib/terrenosMarketplace';
import type { EmpresaPublica, ObjetoEspacio } from '@/lib/terrenosMarketplace';
import { GhostAvatar } from '@/components/3d/GhostAvatar';
import { TerrenoDisponible3D } from './TerrenoDisponible3D';
import { PanelDetalleTerreno } from './PanelDetalleTerreno';
import { PanelDetalleEmpresa } from './PanelDetalleEmpresa';
import { HUDMarketplace } from './HUDMarketplace';

const ESPACIO_GLOBAL_ID = '91887e81-1f26-448c-9d6d-9839e7d83b5d';
const WORLD_SCALE = 0.02;
const WORLD_SIZE_PX = 800;
const WORLD_CENTER = (WORLD_SIZE_PX * WORLD_SCALE) / 2;

/**
 * Escritorio3D simplificado para el marketplace (read-only, sin interacción)
 * Replica la geometría real de Escritorio3D.tsx
 */
const EscritorioPreview3D: React.FC<{
  posicion: [number, number, number];
  rotacionY?: number;
  ocupado: boolean;
  color: string;
}> = ({ posicion, rotacionY = 0, ocupado, color }) => (
  <group position={posicion} rotation={[0, rotacionY, 0]}>
    {/* Mesa — misma geometría que Escritorio3D real */}
    <mesh position={[0, 0.4, 0]} castShadow>
      <boxGeometry args={[2.4, 0.12, 1.2]} />
      <meshStandardMaterial color={ocupado ? '#475569' : '#1e293b'} roughness={0.6} metalness={0.2} />
    </mesh>
    {/* Patas */}
    {[[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]].map(([px, pz], i) => (
      <mesh key={i} position={[px, 0.17, pz]} castShadow>
        <boxGeometry args={[0.08, 0.34, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>
    ))}
    {/* Silla */}
    <mesh position={[0, 0.3, -0.9]} castShadow>
      <boxGeometry args={[0.6, 0.6, 0.5]} />
      <meshStandardMaterial color={ocupado ? '#1e293b' : '#334155'} roughness={0.7} />
    </mesh>
    {/* Indicador de ocupación */}
    {ocupado && (
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
      </mesh>
    )}
  </group>
);

/**
 * Componente 3D para zona de empresa — renderiza objetos REALES del espacio + GhostAvatars
 */
const ZonaExistente3D: React.FC<{
  zona: ZonaEmpresa;
  empresa?: EmpresaPublica;
  objetos: ObjetoEspacio[];
  onClick?: (zona: ZonaEmpresa) => void;
  seleccionada?: boolean;
}> = ({ zona, empresa, objetos, onClick, seleccionada = false }) => {
  const escala = WORLD_SCALE;
  const anchoW = zona.ancho * escala;
  const altoW = zona.alto * escala;
  const posX = zona.posicion_x * escala;
  const posZ = zona.posicion_y * escala;
  const color = zona.color || '#6366f1';
  const esComun = zona.es_comun;
  const miembros = empresa?.miembros_count || 0;
  const nombre = esComun ? 'Zona Común' : (empresa?.nombre || zona.nombre_zona || 'Empresa');

  // Mapear objetos reales dentro de la zona (normalizar posiciones)
  const objetosMapeados = useMemo(() => {
    if (objetos.length === 0) return [];
    // Calcular bounding box de los objetos originales
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    objetos.forEach((o) => {
      minX = Math.min(minX, o.posicion_x);
      maxX = Math.max(maxX, o.posicion_x);
      minZ = Math.min(minZ, o.posicion_z);
      maxZ = Math.max(maxZ, o.posicion_z);
    });
    const rangoX = maxX - minX || 1;
    const rangoZ = maxZ - minZ || 1;
    // Factor de escala: objetos reales son ~2.4 unidades de ancho, zona puede ser ~3.6 unidades
    const escalaObj = Math.min(anchoW, altoW) / Math.max(rangoX + 4, rangoZ + 4);
    // Mapear cada objeto a posición relativa dentro de la zona
    return objetos.map((o) => ({
      ...o,
      localX: ((o.posicion_x - (minX + maxX) / 2) * escalaObj),
      localZ: ((o.posicion_z - (minZ + maxZ) / 2) * escalaObj),
      escalaLocal: escalaObj * 0.45,
    }));
  }, [objetos, anchoW, altoW]);

  // Generar posiciones de GhostAvatars (miembros como siluetas anónimas)
  const ghostPositions = useMemo(() => {
    const ghosts: Array<[number, number, number]> = [];
    const count = Math.min(miembros, 10);
    // Posicionar ghosts cerca de los escritorios mapeados
    for (let i = 0; i < count; i++) {
      if (i < objetosMapeados.length) {
        // Ghost sentado en su escritorio
        const obj = objetosMapeados[i];
        ghosts.push([obj.localX, 0, obj.localZ - 0.4 * (objetosMapeados[0]?.escalaLocal || 0.5)]);
      } else {
        // Ghosts extra caminando por la zona
        const angle = (i / count) * Math.PI * 2 + 0.5;
        const r = Math.min(anchoW, altoW) * 0.3;
        ghosts.push([Math.cos(angle) * r, 0, Math.sin(angle) * r]);
      }
    }
    return ghosts;
  }, [miembros, objetosMapeados, anchoW, altoW]);

  return (
    <group position={[posX, 0, posZ]}>
      {/* Suelo clickeable */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onClick={(e) => { e.stopPropagation(); onClick?.(zona); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[anchoW, altoW]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={seleccionada ? 0.5 : esComun ? 0.15 : 0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Borde */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(anchoW, altoW)]} />
        <lineBasicMaterial color={seleccionada ? '#ffffff' : color} transparent opacity={seleccionada ? 0.9 : 0.5} />
      </lineSegments>

      {/* Objetos REALES del espacio (escritorios) mapeados dentro de la zona */}
      {!esComun && objetosMapeados.map((obj) => (
        <group key={obj.id} scale={obj.escalaLocal}>
          <EscritorioPreview3D
            posicion={[obj.localX / obj.escalaLocal, 0, obj.localZ / obj.escalaLocal]}
            rotacionY={obj.rotacion_y}
            ocupado={obj.owner_id !== null}
            color={color}
          />
        </group>
      ))}

      {/* GhostAvatars — siluetas anónimas SIN nombre (privacidad inter-empresa) */}
      {!esComun && ghostPositions.map((pos, i) => (
        <GhostAvatar
          key={`ghost-${i}`}
          position={pos}
          escala={Math.min(anchoW, altoW) * 0.12}
          opacidad={0.3}
          mostrarEtiqueta={false}
        />
      ))}

      {/* Zona común: GhostAvatars socializando */}
      {esComun && [0, 1, 2].map((i) => {
        const ang = (i / 3) * Math.PI * 2 + 0.3;
        const r = Math.min(anchoW, altoW) * 0.25;
        return (
          <GhostAvatar
            key={`common-ghost-${i}`}
            position={[Math.cos(ang) * r, 0, Math.sin(ang) * r]}
            escala={Math.min(anchoW, altoW) * 0.12}
            opacidad={0.2}
            mostrarEtiqueta={false}
          />
        );
      })}

      {/* Nombre */}
      <Text
        position={[0, esComun ? 0.3 : 0.5, 0]}
        fontSize={0.22}
        color="white"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor="#000000"
      >
        {nombre}
      </Text>

      {/* Industria + miembros */}
      {!esComun && empresa?.industria && (
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.12}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000000"
        >
          {empresa.industria} · {miembros} miembros
        </Text>
      )}

      {/* Badge clickeable */}
      {!esComun && (
        <Text
          position={[0, 0.7, 0]}
          fontSize={0.1}
          color="#22c55e"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000000"
        >
          ▶ Click para ver detalles
        </Text>
      )}

      {/* Esquineros */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * anchoW / 2, 0.1, sz * altoW / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={seleccionada ? 0.8 : 0.3} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Escena 3D del marketplace
 */
const EscenaMarketplace: React.FC<{
  terrenos: TerrenoMarketplace[];
  zonas: ZonaEmpresa[];
  empresas: EmpresaPublica[];
  objetos: ObjetoEspacio[];
  terrenoSeleccionado: string | null;
  zonaSeleccionada: string | null;
  onClickTerreno: (t: TerrenoMarketplace) => void;
  onClickZona: (z: ZonaEmpresa) => void;
}> = ({ terrenos, zonas, empresas, objetos, terrenoSeleccionado, zonaSeleccionada, onClickTerreno, onClickZona }) => {

  const empresaMap = useMemo(() => {
    const map: Record<string, EmpresaPublica> = {};
    empresas.forEach((e) => { map[e.id] = e; });
    return map;
  }, [empresas]);

  return (
    <>
      {/* Iluminación */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Cielo/ambiente */}
      <fog attach="fog" args={['#0a0a1a', 15, 40]} />
      <color attach="background" args={['#0a0a1a']} />

      {/* Grid del suelo */}
      <Grid
        args={[30, 30]}
        position={[WORLD_CENTER, -0.01, WORLD_CENTER]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e293b"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#334155"
        fadeDistance={25}
        infiniteGrid
      />

      {/* Suelo receptor de sombras */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD_CENTER, -0.02, WORLD_CENTER]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.8} />
      </mesh>

      {/* Zonas de empresas existentes — con objetos reales + GhostAvatars */}
      {zonas.map((zona) => (
        <ZonaExistente3D
          key={zona.id}
          zona={zona}
          empresa={zona.empresa_id ? empresaMap[zona.empresa_id] : undefined}
          objetos={objetos}
          onClick={onClickZona}
          seleccionada={zonaSeleccionada === zona.id}
        />
      ))}

      {/* Terrenos disponibles */}
      {terrenos.map((terreno) => (
        <TerrenoDisponible3D
          key={terreno.id}
          terreno={terreno}
          onClick={onClickTerreno}
          seleccionado={terrenoSeleccionado === terreno.id}
        />
      ))}

      {/* Cámara orbital */}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.2}
        target={[WORLD_CENTER, 0, WORLD_CENTER]}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </>
  );
};

/**
 * Página principal del explorador público de terrenos
 */
export const ExploradorPublico3D: React.FC = () => {
  const [terrenos, setTerrenos] = useState<TerrenoMarketplace[]>([]);
  const [zonas, setZonas] = useState<ZonaEmpresa[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaPublica[]>([]);
  const [objetos, setObjetos] = useState<ObjetoEspacio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [terrenoSeleccionado, setTerrenoSeleccionado] = useState<TerrenoMarketplace | null>(null);
  const [zonaSeleccionada, setZonaSeleccionada] = useState<ZonaEmpresa | null>(null);
  const [filtroTier, setFiltroTier] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      const [t, z, e, o] = await Promise.all([
        cargarTerrenosPublicos(ESPACIO_GLOBAL_ID),
        cargarZonasPublicas(ESPACIO_GLOBAL_ID),
        cargarEmpresasPublicas(ESPACIO_GLOBAL_ID),
        cargarObjetosPublicos(ESPACIO_GLOBAL_ID),
      ]);
      setTerrenos(t);
      setZonas(z);
      setEmpresas(e);
      setObjetos(o);
      setCargando(false);
    };
    cargar();
  }, []);

  const terrenosFiltrados = useMemo(() => {
    if (!filtroTier) return terrenos;
    return terrenos.filter((t) => t.tier === filtroTier);
  }, [terrenos, filtroTier]);

  const empresaSeleccionada = useMemo(() => {
    if (!zonaSeleccionada?.empresa_id) return null;
    return empresas.find((e) => e.id === zonaSeleccionada.empresa_id) || null;
  }, [zonaSeleccionada, empresas]);

  const handleClickTerreno = useCallback((t: TerrenoMarketplace) => {
    setZonaSeleccionada(null);
    setTerrenoSeleccionado((prev) => (prev?.id === t.id ? null : t));
  }, []);

  const handleClickZona = useCallback((z: ZonaEmpresa) => {
    setTerrenoSeleccionado(null);
    setZonaSeleccionada((prev) => (prev?.id === z.id ? null : z));
  }, []);

  const handleReservar = useCallback((t: TerrenoMarketplace) => {
    alert(`Para reservar "${t.nombre}" necesitas crear una cuenta.\n\nRedirigiendo al registro...`);
    window.location.href = '/';
  }, []);

  const handleVolverHome = useCallback(() => {
    window.location.href = '/';
  }, []);

  if (cargando) {
    return (
      <div className="fixed inset-0 bg-[#0a0a1a] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-white">Cargando espacio virtual...</p>
          <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">Preparando terrenos y empresas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a1a]">
      {/* Canvas 3D */}
      <Canvas
        camera={{
          position: [WORLD_CENTER + 8, 10, WORLD_CENTER + 8],
          fov: 50,
          near: 0.1,
          far: 100,
        }}
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <Suspense fallback={null}>
          <EscenaMarketplace
            terrenos={terrenosFiltrados}
            zonas={zonas}
            empresas={empresas}
            objetos={objetos}
            terrenoSeleccionado={terrenoSeleccionado?.id || null}
            zonaSeleccionada={zonaSeleccionada?.id || null}
            onClickTerreno={handleClickTerreno}
            onClickZona={handleClickZona}
          />
        </Suspense>
      </Canvas>

      {/* HUD */}
      <HUDMarketplace
        terrenos={terrenos}
        zonas={zonas}
        filtroTier={filtroTier}
        setFiltroTier={setFiltroTier}
        onVolverHome={handleVolverHome}
      />

      {/* Panel de detalle terreno */}
      <PanelDetalleTerreno
        terreno={terrenoSeleccionado}
        onCerrar={() => setTerrenoSeleccionado(null)}
        onReservar={handleReservar}
      />

      {/* Panel de detalle empresa */}
      <PanelDetalleEmpresa
        zona={zonaSeleccionada}
        empresa={empresaSeleccionada}
        onCerrar={() => setZonaSeleccionada(null)}
        onVerTerrenos={() => {
          setZonaSeleccionada(null);
          setFiltroTier(null);
        }}
      />
    </div>
  );
};
