-- Migration: 20260514180000_realtime_replica_identity_full_audit
--
-- Fix sistémico: 13 tablas en `supabase_realtime` publication tenían
-- REPLICA IDENTITY = DEFAULT. Con filters server-side por columnas non-PK
-- (espacio_id, grupo_id, usuario_id, empresa_id, etc.) los eventos DELETE
-- son descartados silenciosamente por Supabase Realtime porque `old` solo
-- contiene la PK con DEFAULT.
--
-- Auditoría 2026-05-14: descubrimos el bug en `zona_pisos_decorativos`
-- (UI no reflejaba el borrado hasta refresh). Audit de la publication
-- entera reveló otras 12 tablas con el mismo riesgo latente.
--
-- Fix uniforme: REPLICA IDENTITY FULL para todas. Costo WAL despreciable
-- a la escala actual (todas < 256 kB total, < 110 filas estimadas).
--
-- Trade-off: en UPDATE/DELETE, Postgres incluye la fila entera en `old`
-- en lugar de solo la PK. Para tablas de logs/grandes (registro_conexiones,
-- actividades_log) NO aplicar este patrón — usar PRIMARY KEY filters o
-- full reload pattern.
--
-- Ref: https://supabase.com/docs/guides/realtime/postgres-changes#delete-events
-- Ref: https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-REPLICA-IDENTITY

ALTER TABLE public.areas_escritorio REPLICA IDENTITY FULL;
ALTER TABLE public.espacio_configuracion_perimetro REPLICA IDENTITY FULL;
ALTER TABLE public.espacio_objetos REPLICA IDENTITY FULL;
ALTER TABLE public.espacio_terreno REPLICA IDENTITY FULL;
ALTER TABLE public.invitaciones_juegos REPLICA IDENTITY FULL;
ALTER TABLE public.invitaciones_pendientes REPLICA IDENTITY FULL;
ALTER TABLE public.mensajes_chat REPLICA IDENTITY FULL;
ALTER TABLE public.miembros_espacio REPLICA IDENTITY FULL;
ALTER TABLE public.miembros_grupo REPLICA IDENTITY FULL;
ALTER TABLE public.notificaciones REPLICA IDENTITY FULL;
ALTER TABLE public.ocupacion_asientos REPLICA IDENTITY FULL;
ALTER TABLE public.partidas_ajedrez REPLICA IDENTITY FULL;
ALTER TABLE public.zonas_empresa REPLICA IDENTITY FULL;
