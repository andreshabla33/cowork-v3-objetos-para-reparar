-- ============================================================================
-- Migration: Estandarizar dimensiones de objetos 3D
-- Fecha: 2026-03-14
-- Descripción: 
--   1. Actualiza dimensiones del catálogo a medidas reales (metros)
--      relativas al avatar estándar de 1.75m
--   2. Resetea escala_normalizacion = 1 en catálogo y espacio_objetos
--      porque calcularTransformacionUniformeGLTF ya maneja el contain-fit
--   3. Las dimensiones del catálogo se convierten en la única fuente de verdad
-- ============================================================================

BEGIN;

-- ========== CATÁLOGO: Dimensiones estándar por objeto ==========

-- Escritorios (standard office desk: ~1.4m wide, 0.74m tall, 0.7m deep)
UPDATE catalogo_objetos_3d 
SET ancho = '1.4', alto = '0.74', profundidad = '0.7', escala_normalizacion = 1
WHERE tipo = 'escritorio';

-- Sillas de oficina (0.55m wide, 1.05m tall, 0.55m deep)
UPDATE catalogo_objetos_3d 
SET ancho = '0.55', alto = '1.05', profundidad = '0.55', escala_normalizacion = 1
WHERE tipo = 'silla_oficina';

UPDATE catalogo_objetos_3d 
SET ancho = '0.55', alto = '1.05', profundidad = '0.55', escala_normalizacion = 1
WHERE nombre = 'Desk Chair';

-- Sofas diferenciados por tamaño
UPDATE catalogo_objetos_3d 
SET ancho = '1.8', alto = '0.80', profundidad = '0.85', escala_normalizacion = 1
WHERE nombre = 'Couch';

UPDATE catalogo_objetos_3d 
SET ancho = '2.4', alto = '0.80', profundidad = '0.85', escala_normalizacion = 1
WHERE nombre = 'Couch Large';

UPDATE catalogo_objetos_3d 
SET ancho = '1.8', alto = '0.80', profundidad = '0.85', escala_normalizacion = 1
WHERE nombre = 'Couch Medium';

UPDATE catalogo_objetos_3d 
SET ancho = '1.4', alto = '0.80', profundidad = '0.85', escala_normalizacion = 1
WHERE nombre = 'Couch Small';

UPDATE catalogo_objetos_3d 
SET ancho = '1.2', alto = '0.80', profundidad = '0.85', escala_normalizacion = 1
WHERE nombre = 'Couch Small 1';

UPDATE catalogo_objetos_3d 
SET ancho = '2.4', alto = '0.80', profundidad = '1.8', escala_normalizacion = 1
WHERE nombre = 'L Couch';

-- Mesas de reunión
UPDATE catalogo_objetos_3d 
SET ancho = '0.9', alto = '0.74', profundidad = '0.9', escala_normalizacion = 1
WHERE nombre = 'Small Table';

UPDATE catalogo_objetos_3d 
SET ancho = '1.2', alto = '0.74', profundidad = '1.2', escala_normalizacion = 1
WHERE nombre = 'Table Large Circular';

-- Computadoras (setup con monitor)
UPDATE catalogo_objetos_3d 
SET ancho = '0.50', alto = '0.50', profundidad = '0.45', escala_normalizacion = 1
WHERE nombre = 'Computer';

UPDATE catalogo_objetos_3d 
SET ancho = '0.55', alto = '0.55', profundidad = '0.50', escala_normalizacion = 1
WHERE nombre = 'Gaming Computer';

UPDATE catalogo_objetos_3d 
SET ancho = '0.45', alto = '0.45', profundidad = '0.40', escala_normalizacion = 1
WHERE nombre = 'Simple Computer';

-- Monitores y TV
UPDATE catalogo_objetos_3d 
SET ancho = '0.55', alto = '0.40', profundidad = '0.15', escala_normalizacion = 1
WHERE nombre = 'Computer Screen';

UPDATE catalogo_objetos_3d 
SET ancho = '0.80', alto = '0.50', profundidad = '0.08', escala_normalizacion = 1
WHERE nombre = 'Tv';

-- Periféricos
UPDATE catalogo_objetos_3d 
SET ancho = '0.44', alto = '0.03', profundidad = '0.14', escala_normalizacion = 1
WHERE nombre = 'Keyboard';

UPDATE catalogo_objetos_3d 
SET ancho = '0.12', alto = '0.04', profundidad = '0.07', escala_normalizacion = 1
WHERE nombre LIKE 'Computer Mouse%';

UPDATE catalogo_objetos_3d 
SET ancho = '0.35', alto = '0.25', profundidad = '0.25', escala_normalizacion = 1
WHERE nombre = 'Laptop';

-- Decoración y naturaleza
UPDATE catalogo_objetos_3d 
SET ancho = '0.25', alto = '0.15', profundidad = '0.10', escala_normalizacion = 1
WHERE nombre = 'Radio';

UPDATE catalogo_objetos_3d 
SET ancho = '0.30', alto = '0.50', profundidad = '0.30', escala_normalizacion = 1
WHERE nombre LIKE 'Flower Pot%';

UPDATE catalogo_objetos_3d 
SET ancho = '0.35', alto = '0.60', profundidad = '0.35', escala_normalizacion = 1
WHERE nombre = 'Houseplant';

UPDATE catalogo_objetos_3d 
SET ancho = '0.30', alto = '0.40', profundidad = '0.30', escala_normalizacion = 1
WHERE nombre = 'Flowers';

UPDATE catalogo_objetos_3d 
SET ancho = '4.0', alto = '6.0', profundidad = '4.0', escala_normalizacion = 1
WHERE nombre = 'Trees';

UPDATE catalogo_objetos_3d 
SET ancho = '1.0', alto = '0.15', profundidad = '1.0', escala_normalizacion = 1
WHERE nombre = 'Grass';

UPDATE catalogo_objetos_3d 
SET ancho = '1.0', alto = '0.60', profundidad = '1.0', escala_normalizacion = 1
WHERE nombre = 'Rocks';

-- Otros objetos
UPDATE catalogo_objetos_3d 
SET ancho = '1.2', alto = '0.74', profundidad = '0.8', escala_normalizacion = 1
WHERE nombre = 'Dining Set';

UPDATE catalogo_objetos_3d 
SET ancho = '1.0', alto = '0.10', profundidad = '1.6', escala_normalizacion = 1
WHERE nombre = 'Solar Panel';

UPDATE catalogo_objetos_3d 
SET ancho = '0.30', alto = '1.50', profundidad = '0.30', escala_normalizacion = 1
WHERE nombre = 'Roof Antenna';

UPDATE catalogo_objetos_3d 
SET ancho = '0.60', alto = '1.20', profundidad = '0.30', escala_normalizacion = 1
WHERE nombre LIKE 'Shelf Small%';

UPDATE catalogo_objetos_3d 
SET ancho = '0.5', alto = '2.5', profundidad = '0.5', escala_normalizacion = 1
WHERE nombre = 'Skyscraper';

-- ========== ESPACIO_OBJETOS: Reset escala_normalizacion ==========
-- Todas las instancias colocadas heredan escala_normalizacion del catálogo.
-- Al resetear a 1, el render usa solo las dimensiones del catálogo como target.
UPDATE espacio_objetos 
SET escala_normalizacion = 1
WHERE escala_normalizacion IS NULL OR escala_normalizacion != 1;

-- ========== Verificación ==========
-- Confirmar que no quedan escala_normalizacion != 1 en el catálogo
DO $$
DECLARE
  cnt_cat INTEGER;
  cnt_esp INTEGER;
BEGIN
  SELECT count(*) INTO cnt_cat FROM catalogo_objetos_3d WHERE escala_normalizacion != 1;
  SELECT count(*) INTO cnt_esp FROM espacio_objetos WHERE escala_normalizacion != 1;
  IF cnt_cat > 0 THEN
    RAISE WARNING 'Quedan % entradas en catálogo con escala_normalizacion != 1', cnt_cat;
  END IF;
  IF cnt_esp > 0 THEN
    RAISE WARNING 'Quedan % instancias en espacio_objetos con escala_normalizacion != 1', cnt_esp;
  END IF;
  RAISE NOTICE 'Migración completada: catálogo=% con escala!=1, instancias=% con escala!=1', cnt_cat, cnt_esp;
END $$;

COMMIT;
