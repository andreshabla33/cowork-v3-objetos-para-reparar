-- Migration: agregar `espacio_terreno` a la publication supabase_realtime.
--
-- Sin esto, el hook `useTerreno` no recibe UPDATE events de Realtime y la
-- UI no refleja cambios al `tipo_suelo_principal` hasta hacer reload manual.
-- Otras tablas que ya están en la publication (zonas_empresa, areas_escritorio)
-- usan el mismo patrón.
--
-- Ref: https://supabase.com/docs/guides/realtime/postgres-changes
begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'espacio_terreno'
  ) then
    execute 'alter publication supabase_realtime add table public.espacio_terreno';
  end if;
end $$;

commit;
