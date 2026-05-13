-- Migration: añadir tipo de suelo principal del espacio
--
-- Hoy cada zona pinta su propio piso, pero NO hay un suelo "background"
-- para el área del espacio fuera de zonas. Este campo en `espacio_terreno`
-- permite al admin elegir el FloorType global (por defecto 'concrete_smooth').
--
-- El frontend renderiza un PlaneGeometry grande (~200×200m) en Y=-0.005
-- con `useFloorMaterial(terreno.tipo_suelo_principal)`. Las zonas activas
-- quedan ENCIMA (Y=0..0.02). El suelo principal se ve donde no hay zonas.
--
-- RLS: aprovecha las políticas existentes en `espacio_terreno` (SELECT abierto
-- a miembros aceptados; UPDATE solo owner/admin/super_admin). No hace falta
-- nuevo grant.

begin;

alter table public.espacio_terreno
  add column if not exists tipo_suelo_principal text default 'concrete_smooth';

comment on column public.espacio_terreno.tipo_suelo_principal is
  'FloorType del frontend aplicado al PlaneGeometry global del espacio (fuera de zonas). Default concrete_smooth.';

update public.espacio_terreno
set tipo_suelo_principal = 'concrete_smooth'
where tipo_suelo_principal is null;

commit;
