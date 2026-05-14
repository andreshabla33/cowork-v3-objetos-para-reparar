-- Migration: 20260514000000_colocar_desk_preset_offset_y
--
-- Permite que el preset de desk especifique `offset_y` por mueble. Antes la
-- RPC hardcodeaba `posicion_y = 0` y los muebles spawneaban hundidos en el
-- piso (mesa media metida en el suelo, monitor también). Con offset_y los
-- presets pueden anclar la mesa a `alto/2` y el monitor sobre la superficie.

create or replace function public.colocar_desk_con_preset(
  p_espacio_id     uuid,
  p_centro_x       numeric,
  p_centro_z       numeric,
  p_ancho          numeric,
  p_alto           numeric,
  p_nombre         text,
  p_audio_aislado  boolean,
  p_asignado_a     uuid,
  p_muebles        jsonb
)
returns areas_escritorio
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller       uuid := auth.uid();
  v_area         public.areas_escritorio;
  v_mueble       jsonb;
  v_catalogo_id  uuid;
  v_catalogo_url text;
begin
  if v_caller is null then raise exception 'NO_AUTORIZADO'; end if;
  if not public._fn_es_admin_espacio(p_espacio_id, v_caller) then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_ancho <= 0 or p_alto <= 0 then raise exception 'BBOX_INVALIDO'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'NOMBRE_VACIO'; end if;

  insert into public.areas_escritorio (
    espacio_id, centro_x, centro_z, ancho, alto, nombre,
    audio_aislado, asignado_a_usuario_id
  ) values (
    p_espacio_id, p_centro_x, p_centro_z, p_ancho, p_alto, trim(p_nombre),
    p_audio_aislado, p_asignado_a
  )
  returning * into v_area;

  for v_mueble in select * from jsonb_array_elements(p_muebles)
  loop
    select id, modelo_url into v_catalogo_id, v_catalogo_url
    from public.catalogo_objetos_3d
    where slug = v_mueble->>'slug'
    limit 1;

    if v_catalogo_id is null then
      continue;
    end if;

    insert into public.espacio_objetos (
      espacio_id, catalogo_id, modelo_url, tipo, nombre,
      posicion_x, posicion_y, posicion_z,
      rotacion_x, rotacion_y, rotacion_z,
      escala_x, escala_y, escala_z,
      owner_id, interactuable
    ) values (
      p_espacio_id, v_catalogo_id, v_catalogo_url, 'mueble',
      coalesce(v_mueble->>'rol', 'mueble'),
      p_centro_x + (v_mueble->>'offset_x')::numeric,
      coalesce((v_mueble->>'offset_y')::numeric, 0),
      p_centro_z + (v_mueble->>'offset_z')::numeric,
      0, coalesce((v_mueble->>'rotacion_y')::numeric, 0), 0,
      1, 1, 1,
      v_caller, false
    );
  end loop;

  return v_area;
end;
$function$;
