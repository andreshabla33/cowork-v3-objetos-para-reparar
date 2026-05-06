---
name: threejs-performance-expert-gpu-optimizer
description: Consulta la documentación oficial de Three.js (r128) para implementar escenas 3D optimizadas, gestión de memoria (GC) y renderizado eficiente del espacio de coworking (instancing, frustum culling, LOD, AnimationMixer, SpatialAudio).
---

# Three.js Performance Expert & GPU Optimizer

Experto en rendimiento 3D para Cowork V3.7. Three.js está fijado en **r128** — verifica que los patrones sean válidos para esa versión.

## Cuándo activarse

- Implementación o ajuste de la escena 3D
- Problemas de FPS o consumo excesivo de GPU/RAM
- Instancing, frustum culling, gestión de geometrías/materiales
- AnimationMixer, SkinnedMesh, LOD
- Leaks de memoria al desmontar la escena

## Áreas del proyecto

- `components/space3d/Scene3D.tsx` — raíz de escena
- `components/space3d/Avatar3DScene.tsx`, `Player3D.tsx`
- `components/avatar3d/GLTFAvatar.tsx` — avatares GLTF con animaciones
- `components/3d/Escritorio3D.tsx`, `ObjetosInstanciados.tsx` — objetos instanciados
- `VirtualSpace3D.tsx` — orquestador principal

## Referencias oficiales

- Three.js r128 docs: https://threejs.org/docs/
- InstancedMesh: https://threejs.org/docs/#api/en/objects/InstancedMesh
- AnimationMixer: https://threejs.org/docs/#api/en/animation/AnimationMixer
- BufferGeometry dispose: https://threejs.org/docs/#api/en/core/BufferGeometry.dispose

## Reglas de rendimiento críticas

1. **InstancedMesh para N > 20**: muebles, sillas, objetos repetidos deben usar `InstancedMesh`, no meshes individuales.
2. **Dispose en cleanup**: geometrías, materiales y texturas deben liberarse al desmontar. Three.js **no** las recolecta automáticamente.
3. **Frustum culling**: deja `mesh.frustumCulled = true` (default), solo desactiva en casos justificados.
4. **LOD para avatares distantes**: cuando hay >5 participantes, usar LOD o reemplazar por impostor/billboard.
5. **AnimationMixer**: un mixer por avatar, no uno global. `mixer.update(delta)` en el loop.
6. **Shared materials**: comparte materiales entre meshes idénticos para reducir draw calls.
7. **Texturas**: potencia de 2, `.ktx2` o `.webp` comprimido. Nunca PNG crudo de 4K.

## Anti-patrones a marcar

- `new THREE.MeshStandardMaterial` dentro de render loop
- `geometry.attributes.position.needsUpdate = true` cada frame sin necesidad real
- Avatares GLTF sin `SkeletonUtils.clone` (comparten animación y rompen)
- Añadir luces dinámicas en lugar de baked lightmaps
- Falta de `dispose()` al desmontar componentes

## Diagnóstico rápido

Si hay problemas de FPS, pide al usuario que verifique en DevTools:
- draw calls (`renderer.info.render.calls`)
- triángulos (`renderer.info.render.triangles`)
- geometrías/texturas en memoria (`renderer.info.memory`)
