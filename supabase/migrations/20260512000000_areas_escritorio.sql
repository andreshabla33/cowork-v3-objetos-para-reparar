-- ============================================================================
-- Migration: areas_escritorio
-- ============================================================================
-- Adds the "DeskArea" entity (Gather-style claim-explicit desks) and replaces
-- the legacy auto-sit mechanic. The desk areas are rectangles in world coords
-- that an admin designates; members hover → "Claim" → the desk associates to
-- the user persistently until released or admin re-assigned.
--
-- Tables:
--   - areas_escritorio  (canonical entity)
--
-- RPCs (SECURITY DEFINER for auth.uid() server-side):
--   - reclamar_area_escritorio(area_id)
--   - liberar_area_escritorio(area_id)
--   - designar_area_escritorio(espacio_id, bbox, nombre, audio_aislado)   [admin]
--   - asignar_area_escritorio(area_id, usuario_id NULL=quitar)            [admin]
--   - reasignar_area_escritorio(area_id, nuevo_usuario_id NULL)           [admin]
--   - eliminar_area_escritorio(area_id)                                   [admin]
--
-- RLS:
--   - SELECT: cualquier miembro del espacio_id (público por ahora — la zona
--     filtra acceso superior; iterar si se necesita más fine-grained).
--   - INSERT/UPDATE/DELETE: solo via RPCs (revocadas directamente).
--
-- Realtime: postgres_changes habilitado (publication supabase_realtime).
-- ============================================================================

BEGIN;

-- ─── Tabla principal ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas_escritorio (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio_id                uuid NOT NULL REFERENCES public.espacios_trabajo(id) ON DELETE CASCADE,
  -- bbox en world coords (metros). Centro + dimensiones para evitar inconsistencias min/max.
  centro_x                  numeric NOT NULL,
  centro_z                  numeric NOT NULL,
  ancho                     numeric NOT NULL CHECK (ancho > 0),
  alto                      numeric NOT NULL CHECK (alto > 0),
  nombre                    text    NOT NULL CHECK (length(trim(nombre)) > 0),
  -- Pre-asignación admin (slot reservado para X miembro). NULL = libre.
  asignado_a_usuario_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Reclamación activa (dueño actual). NULL = disponible.
  reclamado_por_usuario_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Si TRUE, el área actúa como Private Area: audio de proximidad gateado.
  audio_aislado             boolean NOT NULL DEFAULT false,
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS areas_escritorio_espacio_id_idx
  ON public.areas_escritorio (espacio_id);
CREATE INDEX IF NOT EXISTS areas_escritorio_reclamado_idx
  ON public.areas_escritorio (reclamado_por_usuario_id)
  WHERE reclamado_por_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS areas_escritorio_asignado_idx
  ON public.areas_escritorio (asignado_a_usuario_id)
  WHERE asignado_a_usuario_id IS NOT NULL;

-- Trigger para mantener actualizado_en sincronizado.
CREATE OR REPLACE FUNCTION public._fn_areas_escritorio_actualizar_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS areas_escritorio_actualizar_ts ON public.areas_escritorio;
CREATE TRIGGER areas_escritorio_actualizar_ts
  BEFORE UPDATE ON public.areas_escritorio
  FOR EACH ROW EXECUTE FUNCTION public._fn_areas_escritorio_actualizar_timestamp();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.areas_escritorio ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado puede leer las áreas (necesario para
-- renderizar el overlay 3D). El espacio_id ya gate access en la app.
DROP POLICY IF EXISTS areas_escritorio_select ON public.areas_escritorio;
CREATE POLICY areas_escritorio_select ON public.areas_escritorio
  FOR SELECT
  TO authenticated
  USING (true);

-- Bloquear escritura directa: todo va por RPCs (SECURITY DEFINER).
DROP POLICY IF EXISTS areas_escritorio_no_direct_insert ON public.areas_escritorio;
CREATE POLICY areas_escritorio_no_direct_insert ON public.areas_escritorio
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS areas_escritorio_no_direct_update ON public.areas_escritorio;
CREATE POLICY areas_escritorio_no_direct_update ON public.areas_escritorio
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS areas_escritorio_no_direct_delete ON public.areas_escritorio;
CREATE POLICY areas_escritorio_no_direct_delete ON public.areas_escritorio
  FOR DELETE TO authenticated USING (false);

-- ─── Helper: chequea si el caller es admin del espacio ─────────────────────
CREATE OR REPLACE FUNCTION public._fn_es_admin_espacio(p_espacio_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.miembros_espacio me
    WHERE me.espacio_id = p_espacio_id
      AND me.usuario_id = p_user_id
      AND me.rol IN ('admin', 'super_admin')
  );
$$;

-- ─── RPC: reclamar_area_escritorio ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reclamar_area_escritorio(
  p_area_id uuid
)
RETURNS public.areas_escritorio
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_area    public.areas_escritorio;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_area FROM public.areas_escritorio WHERE id = p_area_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ENCONTRADA';
  END IF;

  -- Idempotencia: si ya soy el dueño, devuelvo igual sin tocar.
  IF v_area.reclamado_por_usuario_id = v_user_id THEN
    RETURN v_area;
  END IF;

  -- Validación: no reclamada por otro.
  IF v_area.reclamado_por_usuario_id IS NOT NULL THEN
    RAISE EXCEPTION 'YA_RECLAMADA';
  END IF;

  -- Validación: si tiene pre-asignación, debe ser para mí.
  IF v_area.asignado_a_usuario_id IS NOT NULL
     AND v_area.asignado_a_usuario_id <> v_user_id THEN
    RAISE EXCEPTION 'PRE_ASIGNADA_A_OTRO';
  END IF;

  UPDATE public.areas_escritorio
     SET reclamado_por_usuario_id = v_user_id
   WHERE id = p_area_id
   RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamar_area_escritorio(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reclamar_area_escritorio(uuid) TO authenticated;

-- ─── RPC: liberar_area_escritorio ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.liberar_area_escritorio(
  p_area_id uuid
)
RETURNS public.areas_escritorio
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_area    public.areas_escritorio;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_area FROM public.areas_escritorio WHERE id = p_area_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ENCONTRADA';
  END IF;

  IF v_area.reclamado_por_usuario_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'NO_ES_MI_AREA';
  END IF;

  UPDATE public.areas_escritorio
     SET reclamado_por_usuario_id = NULL
   WHERE id = p_area_id
   RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_area_escritorio(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.liberar_area_escritorio(uuid) TO authenticated;

-- ─── RPC: designar_area_escritorio (admin) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.designar_area_escritorio(
  p_espacio_id    uuid,
  p_centro_x      numeric,
  p_centro_z      numeric,
  p_ancho         numeric,
  p_alto          numeric,
  p_nombre        text,
  p_audio_aislado boolean
)
RETURNS public.areas_escritorio
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_area    public.areas_escritorio;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF NOT public._fn_es_admin_espacio(p_espacio_id, v_user_id) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;
  IF p_ancho <= 0 OR p_alto <= 0 THEN
    RAISE EXCEPTION 'BBOX_INVALIDO';
  END IF;
  IF length(trim(coalesce(p_nombre, ''))) = 0 THEN
    RAISE EXCEPTION 'NOMBRE_VACIO';
  END IF;

  INSERT INTO public.areas_escritorio (
    espacio_id, centro_x, centro_z, ancho, alto, nombre, audio_aislado
  ) VALUES (
    p_espacio_id, p_centro_x, p_centro_z, p_ancho, p_alto, trim(p_nombre), p_audio_aislado
  )
  RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.designar_area_escritorio(uuid, numeric, numeric, numeric, numeric, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.designar_area_escritorio(uuid, numeric, numeric, numeric, numeric, text, boolean) TO authenticated;

-- ─── RPC: asignar_area_escritorio (admin) ──────────────────────────────────
-- Pre-asigna (o quita pre-asignación con p_usuario_id NULL). NO libera al
-- reclamado actual — solo setea el asignado_a.
CREATE OR REPLACE FUNCTION public.asignar_area_escritorio(
  p_area_id    uuid,
  p_usuario_id uuid
)
RETURNS public.areas_escritorio
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_area   public.areas_escritorio;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_area FROM public.areas_escritorio WHERE id = p_area_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ENCONTRADA';
  END IF;
  IF NOT public._fn_es_admin_espacio(v_area.espacio_id, v_caller) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE public.areas_escritorio
     SET asignado_a_usuario_id = p_usuario_id
   WHERE id = p_area_id
   RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_area_escritorio(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.asignar_area_escritorio(uuid, uuid) TO authenticated;

-- ─── RPC: reasignar_area_escritorio (admin) ────────────────────────────────
-- Diferencia con asignar: SI hay un reclamado actual, lo libera + setea
-- nuevo asignado_a. Atómico.
CREATE OR REPLACE FUNCTION public.reasignar_area_escritorio(
  p_area_id         uuid,
  p_nuevo_usuario_id uuid
)
RETURNS public.areas_escritorio
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_area   public.areas_escritorio;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT * INTO v_area FROM public.areas_escritorio WHERE id = p_area_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ENCONTRADA';
  END IF;
  IF NOT public._fn_es_admin_espacio(v_area.espacio_id, v_caller) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE public.areas_escritorio
     SET asignado_a_usuario_id    = p_nuevo_usuario_id,
         reclamado_por_usuario_id = NULL
   WHERE id = p_area_id
   RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;

REVOKE ALL ON FUNCTION public.reasignar_area_escritorio(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reasignar_area_escritorio(uuid, uuid) TO authenticated;

-- ─── RPC: eliminar_area_escritorio (admin) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.eliminar_area_escritorio(
  p_area_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_espacio uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  SELECT espacio_id INTO v_espacio FROM public.areas_escritorio WHERE id = p_area_id;
  IF v_espacio IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public._fn_es_admin_espacio(v_espacio, v_caller) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  DELETE FROM public.areas_escritorio WHERE id = p_area_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_area_escritorio(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.eliminar_area_escritorio(uuid) TO authenticated;

-- ─── Realtime publication ──────────────────────────────────────────────────
-- Agrega la tabla al publication para que postgres_changes funcione.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.areas_escritorio';
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- ya agregada
    END;
  END IF;
END $$;

COMMIT;
