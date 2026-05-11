import { useCallback, useEffect, useRef, useState } from 'react';
import type { EspacioObjeto, TransformacionObjetoInput } from './useEspacioObjetos';

type AccionHistorialEdicion =
  | { tipo: 'crear'; objeto: EspacioObjeto }
  | { tipo: 'eliminar'; objeto: EspacioObjeto }
  | { tipo: 'transformar'; objetoId: string; antes: EspacioObjeto; despues: EspacioObjeto };

interface UseHistorialEdicionParams {
  objetos: EspacioObjeto[];
  isEditMode: boolean;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  actualizarTransformacionObjeto: (objetoId: string, cambios: TransformacionObjetoInput) => Promise<boolean>;
  eliminarObjeto: (objetoId: string) => Promise<boolean>;
  restaurarObjeto: (objeto: EspacioObjeto) => Promise<EspacioObjeto | null>;
  onNotificar?: (mensaje: string) => void;
}

const MAX_ACCIONES = 50;

const clonarObjeto = (objeto: EspacioObjeto): EspacioObjeto => JSON.parse(JSON.stringify(objeto)) as EspacioObjeto;

const mismaTransformacion = (a: EspacioObjeto, b: EspacioObjeto) => {
  return (
    a.posicion_x === b.posicion_x &&
    a.posicion_y === b.posicion_y &&
    a.posicion_z === b.posicion_z &&
    a.rotacion_x === b.rotacion_x &&
    a.rotacion_y === b.rotacion_y &&
    a.rotacion_z === b.rotacion_z &&
    a.escala_x === b.escala_x &&
    a.escala_y === b.escala_y &&
    a.escala_z === b.escala_z
  );
};

const construirCambiosTransformacion = (objeto: EspacioObjeto): TransformacionObjetoInput => ({
  posicion_x: objeto.posicion_x,
  posicion_y: objeto.posicion_y,
  posicion_z: objeto.posicion_z,
  rotacion_x: objeto.rotacion_x,
  rotacion_y: objeto.rotacion_y,
  rotacion_z: objeto.rotacion_z,
  escala_x: objeto.escala_x,
  escala_y: objeto.escala_y,
  escala_z: objeto.escala_z,
});

const esDestinoEditable = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

export function useHistorialEdicion({
  objetos,
  isEditMode,
  selectedObjectId,
  setSelectedObjectId,
  actualizarTransformacionObjeto,
  eliminarObjeto,
  restaurarObjeto,
  onNotificar,
}: UseHistorialEdicionParams) {
  const objetosRef = useRef(objetos);
  const historialUndoRef = useRef<AccionHistorialEdicion[]>([]);
  const historialRedoRef = useRef<AccionHistorialEdicion[]>([]);
  const dragRef = useRef<{ objetoId: string; snapshot: EspacioObjeto } | null>(null);
  const [estadoHistorial, setEstadoHistorial] = useState({ canUndo: false, canRedo: false });

  const sincronizarEstadoHistorial = useCallback(() => {
    setEstadoHistorial({
      canUndo: historialUndoRef.current.length > 0,
      canRedo: historialRedoRef.current.length > 0,
    });
  }, []);

  useEffect(() => {
    objetosRef.current = objetos;
  }, [objetos]);

  const buscarObjeto = useCallback((objetoId: string) => {
    const objeto = objetosRef.current.find((item) => item.id === objetoId);
    return objeto ? clonarObjeto(objeto) : null;
  }, []);

  const registrarAccion = useCallback((accion: AccionHistorialEdicion) => {
    historialUndoRef.current.push(accion);
    if (historialUndoRef.current.length > MAX_ACCIONES) {
      historialUndoRef.current.shift();
    }
    historialRedoRef.current = [];
    sincronizarEstadoHistorial();
  }, [sincronizarEstadoHistorial]);

  const registrarCreacion = useCallback((objeto: EspacioObjeto) => {
    registrarAccion({ tipo: 'crear', objeto: clonarObjeto(objeto) });
  }, [registrarAccion]);

  const registrarEliminacion = useCallback((objeto: EspacioObjeto) => {
    registrarAccion({ tipo: 'eliminar', objeto: clonarObjeto(objeto) });
  }, [registrarAccion]);

  const registrarTransformacion = useCallback((antes: EspacioObjeto, despues: EspacioObjeto) => {
    if (mismaTransformacion(antes, despues)) return;
    registrarAccion({
      tipo: 'transformar',
      objetoId: antes.id,
      antes: clonarObjeto(antes),
      despues: clonarObjeto(despues),
    });
  }, [registrarAccion]);

  const registrarInicioArrastre = useCallback((objetoId: string) => {
    const snapshot = buscarObjeto(objetoId);
    if (!snapshot) return;
    dragRef.current = { objetoId, snapshot };
  }, [buscarObjeto]);

  const registrarFinArrastre = useCallback((objetoId: string) => {
    const dragActual = dragRef.current;
    dragRef.current = null;
    if (!dragActual || dragActual.objetoId !== objetoId) return;
    const despues = buscarObjeto(objetoId);
    if (!despues) return;
    registrarTransformacion(dragActual.snapshot, despues);
  }, [buscarObjeto, registrarTransformacion]);

  const aplicarTransformacion = useCallback(async (snapshot: EspacioObjeto) => {
    return actualizarTransformacionObjeto(snapshot.id, construirCambiosTransformacion(snapshot));
  }, [actualizarTransformacionObjeto]);

  const aplicarAccion = useCallback(async (accion: AccionHistorialEdicion, direccion: 'undo' | 'redo') => {
    if (accion.tipo === 'crear') {
      if (direccion === 'undo') {
        const ok = await eliminarObjeto(accion.objeto.id);
        if (ok) {
          setSelectedObjectId(null);
          onNotificar?.('Deshecho: objeto retirado');
        }
        return ok;
      }
      const restaurado = await restaurarObjeto(accion.objeto);
      if (restaurado) {
        setSelectedObjectId(restaurado.id);
        onNotificar?.('Rehecho: objeto restaurado');
        return true;
      }
      return false;
    }

    if (accion.tipo === 'eliminar') {
      if (direccion === 'undo') {
        const restaurado = await restaurarObjeto(accion.objeto);
        if (restaurado) {
          setSelectedObjectId(restaurado.id);
          onNotificar?.('Deshecho: objeto restaurado');
          return true;
        }
        return false;
      }
      const ok = await eliminarObjeto(accion.objeto.id);
      if (ok) {
        setSelectedObjectId(null);
        onNotificar?.('Rehecho: objeto eliminado');
      }
      return ok;
    }

    const snapshot = direccion === 'undo' ? accion.antes : accion.despues;
    const ok = await aplicarTransformacion(snapshot);
    if (ok) {
      setSelectedObjectId(snapshot.id);
      onNotificar?.(direccion === 'undo' ? 'Deshecho: transformación revertida' : 'Rehecho: transformación aplicada');
    }
    return ok;
  }, [aplicarTransformacion, eliminarObjeto, onNotificar, restaurarObjeto, setSelectedObjectId]);

  const deshacer = useCallback(async () => {
    const accion = historialUndoRef.current.pop();
    if (!accion) return false;
    const ok = await aplicarAccion(accion, 'undo');
    if (!ok) {
      historialUndoRef.current.push(accion);
      sincronizarEstadoHistorial();
      return false;
    }
    historialRedoRef.current.push(accion);
    sincronizarEstadoHistorial();
    return true;
  }, [aplicarAccion, sincronizarEstadoHistorial]);

  const rehacer = useCallback(async () => {
    const accion = historialRedoRef.current.pop();
    if (!accion) return false;
    const ok = await aplicarAccion(accion, 'redo');
    if (!ok) {
      historialRedoRef.current.push(accion);
      sincronizarEstadoHistorial();
      return false;
    }
    historialUndoRef.current.push(accion);
    sincronizarEstadoHistorial();
    return true;
  }, [aplicarAccion, sincronizarEstadoHistorial]);

  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (esDestinoEditable(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        void rehacer();
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        void deshacer();
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        void rehacer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deshacer, isEditMode, rehacer]);

  useEffect(() => {
    if (!selectedObjectId) {
      dragRef.current = null;
    }
  }, [selectedObjectId]);

  return {
    registrarCreacion,
    registrarEliminacion,
    registrarTransformacion,
    registrarInicioArrastre,
    registrarFinArrastre,
    canUndo: estadoHistorial.canUndo,
    canRedo: estadoHistorial.canRedo,
    deshacer,
    rehacer,
  };
}
