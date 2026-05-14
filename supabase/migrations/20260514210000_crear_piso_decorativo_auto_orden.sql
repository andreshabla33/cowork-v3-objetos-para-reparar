-- Migration: 20260514210000_crear_piso_decorativo_auto_orden
--
-- Fix estructural z-fighting de pisos decorativos apilados.
--
-- Síntoma: cuando admin coloca múltiples pisos en la misma área, todos
-- tienen `orden = 0` (default del param p_orden). El renderer no puede
-- distinguir cuál va encima → mismo Y → z-fight visible como ruido /
-- parpadeo / gradiente borroso.
--
-- Fix: el RPC auto-asigna `orden = MAX(orden) + 1` por espacio cuando
-- el caller envía 0 (semántica "auto"). Si envía explícito > 0, respeta
-- el valor (admin podría querer reordenar manualmente en el futuro).
--
-- Backfill: pisos existentes con orden=0 → secuencial por creado_en
-- para que rendereen sin colisión.
--
-- Complementa el fix client-side en PisoDecorativo3D.tsx:
--  - depthWrite=false (no compiten en z-buffer)
--  - renderOrder = orden (orden visual determinístico)
--  - Y-step = 0.02m por orden (defensa adicional)

-- 1. Backfill
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY espacio_id ORDER BY creado_en) AS new_orden
  FROM public.zona_pisos_decorativos
  WHERE orden = 0
)
UPDATE public.zona_pisos_decorativos zpd
SET orden = ordered.new_orden
FROM ordered
WHERE zpd.id = ordered.id;

-- 2. RPC con auto-orden
CREATE OR REPLACE FUNCTION public.crear_piso_decorativo(
  p_espacio_id  uuid,
  p_zona_id     uuid,
  p_tipo_suelo  text,
  p_centro_x    numeric,
  p_centro_z    numeric,
  p_ancho       numeric,
  p_profundidad numeric,
  p_rotacion_y  numeric default 0,
  p_orden       integer default 0
)
RETURNS public.zona_pisos_decorativos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_caller uuid := auth.uid();
  v_orden  integer;
  v_row    public.zona_pisos_decorativos;
begin
  if v_caller is null then raise exception 'NO_AUTORIZADO'; end if;
  if not public._fn_es_admin_espacio(p_espacio_id, v_caller) then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_ancho <= 0 or p_profundidad <= 0 then raise exception 'BBOX_INVALIDO'; end if;
  if length(trim(coalesce(p_tipo_suelo, ''))) = 0 then raise exception 'TIPO_SUELO_VACIO'; end if;

  -- Semántica "0 = auto": el caller no especifica orden → asignamos
  -- MAX(orden)+1 del espacio para que el nuevo piso quede on top.
  if p_orden <= 0 then
    select coalesce(max(orden), 0) + 1 into v_orden
    from public.zona_pisos_decorativos
    where espacio_id = p_espacio_id;
  else
    v_orden := p_orden;
  end if;

  insert into public.zona_pisos_decorativos (
    espacio_id, zona_id, tipo_suelo,
    centro_x, centro_z, ancho, profundidad,
    rotacion_y, orden, owner_id
  ) values (
    p_espacio_id, p_zona_id, trim(p_tipo_suelo),
    p_centro_x, p_centro_z, p_ancho, p_profundidad,
    p_rotacion_y, v_orden, v_caller
  )
  returning * into v_row;

  return v_row;
end;
$$;

REVOKE ALL ON FUNCTION public.crear_piso_decorativo(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_piso_decorativo(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, integer) TO authenticated;
