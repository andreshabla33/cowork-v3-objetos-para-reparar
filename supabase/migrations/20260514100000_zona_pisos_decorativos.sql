-- Migration: 20260514100000_zona_pisos_decorativos
--
-- Pisos decorativos (alfombras/parches) que admin pinta DENTRO de zonas o
-- sobre el suelo principal. Modelo Gather-style: rectángulo plano a Y≈0.01
-- con un FloorType, render sobre el piso base. NO afecta navegación ni
-- audio — solo visual.
--
-- Decisiones:
-- - `zona_id` NULLABLE → permite decorar el suelo "Principal" (zona común).
-- - `tipo_suelo` text sin CHECK estricto → la enum FloorType vive en código
--   y se valida en application layer; DB sólo persiste el slug.
-- - `orden` int → z-order al apilar varias decoraciones en la misma área.
-- - RLS: SELECT público a authenticated. Mutaciones solo via RPCs admin.

begin;

create table if not exists public.zona_pisos_decorativos (
  id              uuid primary key default gen_random_uuid(),
  espacio_id      uuid not null references public.espacios_trabajo(id) on delete cascade,
  zona_id         uuid references public.zonas_empresa(id) on delete cascade,
  tipo_suelo      text not null,
  centro_x        numeric not null,
  centro_z        numeric not null,
  ancho           numeric not null check (ancho > 0),
  profundidad     numeric not null check (profundidad > 0),
  rotacion_y      numeric not null default 0,
  orden           integer not null default 0,
  owner_id        uuid references public.usuarios(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.zona_pisos_decorativos is
  'Decoraciones de piso (alfombras/parches) pintadas por admin sobre el suelo del espacio o dentro de zonas.';

create index if not exists idx_zona_pisos_decorativos_espacio
  on public.zona_pisos_decorativos (espacio_id);

create index if not exists idx_zona_pisos_decorativos_zona
  on public.zona_pisos_decorativos (zona_id)
  where zona_id is not null;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.zona_pisos_decorativos enable row level security;

drop policy if exists zona_pisos_decorativos_select on public.zona_pisos_decorativos;
create policy zona_pisos_decorativos_select on public.zona_pisos_decorativos
  for select to authenticated using (true);

drop policy if exists zona_pisos_decorativos_no_direct_insert on public.zona_pisos_decorativos;
create policy zona_pisos_decorativos_no_direct_insert on public.zona_pisos_decorativos
  for insert to authenticated with check (false);

drop policy if exists zona_pisos_decorativos_no_direct_update on public.zona_pisos_decorativos;
create policy zona_pisos_decorativos_no_direct_update on public.zona_pisos_decorativos
  for update to authenticated using (false);

drop policy if exists zona_pisos_decorativos_no_direct_delete on public.zona_pisos_decorativos;
create policy zona_pisos_decorativos_no_direct_delete on public.zona_pisos_decorativos
  for delete to authenticated using (false);

-- ─── RPC: crear_piso_decorativo (admin) ────────────────────────────────────
create or replace function public.crear_piso_decorativo(
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
returns public.zona_pisos_decorativos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.zona_pisos_decorativos;
begin
  if v_caller is null then raise exception 'NO_AUTORIZADO'; end if;
  if not public._fn_es_admin_espacio(p_espacio_id, v_caller) then
    raise exception 'NO_AUTORIZADO';
  end if;
  if p_ancho <= 0 or p_profundidad <= 0 then raise exception 'BBOX_INVALIDO'; end if;
  if length(trim(coalesce(p_tipo_suelo, ''))) = 0 then raise exception 'TIPO_SUELO_VACIO'; end if;

  insert into public.zona_pisos_decorativos (
    espacio_id, zona_id, tipo_suelo,
    centro_x, centro_z, ancho, profundidad,
    rotacion_y, orden, owner_id
  ) values (
    p_espacio_id, p_zona_id, trim(p_tipo_suelo),
    p_centro_x, p_centro_z, p_ancho, p_profundidad,
    p_rotacion_y, p_orden, v_caller
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.crear_piso_decorativo(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, integer) from public;
grant execute on function public.crear_piso_decorativo(uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, integer) to authenticated;

-- ─── RPC: eliminar_piso_decorativo (admin) ─────────────────────────────────
create or replace function public.eliminar_piso_decorativo(p_piso_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_espacio   uuid;
begin
  if v_caller is null then raise exception 'NO_AUTORIZADO'; end if;

  select espacio_id into v_espacio
  from public.zona_pisos_decorativos
  where id = p_piso_id;

  if v_espacio is null then
    return false;
  end if;

  if not public._fn_es_admin_espacio(v_espacio, v_caller) then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from public.zona_pisos_decorativos where id = p_piso_id;
  return true;
end;
$$;

revoke all on function public.eliminar_piso_decorativo(uuid) from public;
grant execute on function public.eliminar_piso_decorativo(uuid) to authenticated;

-- ─── Realtime publication ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'zona_pisos_decorativos'
  ) then
    execute 'alter publication supabase_realtime add table public.zona_pisos_decorativos';
  end if;
end$$;

commit;
