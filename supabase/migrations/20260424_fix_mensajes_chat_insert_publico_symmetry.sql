-- Fix 2026-04-24: policy INSERT de mensajes_chat no permitía enviar mensajes
-- en grupos públicos del espacio aunque la policy SELECT sí los dejaba leer.
-- Síntoma reportado: "pueden leer pero no responder" (test 12 usuarios).
-- Logs confirmaron error 42501 "new row violates row-level security policy".
--
-- Causa raíz: asimetría entre policies. La SELECT tenía 4 ramas, INSERT solo 3.
-- Faltaba en INSERT la rama de "grupo publico + miembro aceptado del espacio"
-- que es el caso del canal "General" donde todos los espaciantes deberían
-- poder participar sin estar en miembros_grupo explícitamente.
--
-- Docs oficiales consultadas:
--   https://www.postgresql.org/docs/current/sql-alterpolicy.html
--     (ALTER POLICY preserva command type + role set, solo modifica WITH CHECK)
--   https://supabase.com/docs/guides/database/postgres/row-level-security
--     (patrón canónico: WITH CHECK + EXISTS subquery contra tabla de membership)
--
-- La rama nueva es IDÉNTICA a la que ya existe en la policy SELECT para
-- garantizar simetría semántica (si puedes leerlo en un grupo publico del
-- espacio, puedes escribirlo).

ALTER POLICY "Enviar mensajes chat" ON mensajes_chat
WITH CHECK (
  usuario_id = auth.uid()
  AND (
    -- Rama 1: miembro explícito del grupo
    EXISTS (
      SELECT 1 FROM miembros_grupo
      WHERE miembros_grupo.grupo_id = mensajes_chat.grupo_id
        AND miembros_grupo.usuario_id = auth.uid()
    )
    -- Rama 2: creador del grupo
    OR EXISTS (
      SELECT 1 FROM grupos_chat
      WHERE grupos_chat.id = mensajes_chat.grupo_id
        AND grupos_chat.creado_por = auth.uid()
    )
    -- Rama 3: DM (grupo 'directo' con uid en el nombre)
    OR EXISTS (
      SELECT 1 FROM grupos_chat
      WHERE grupos_chat.id = mensajes_chat.grupo_id
        AND grupos_chat.tipo = 'directo'
        AND grupos_chat.nombre LIKE ('%' || auth.uid() || '%')
    )
    -- Rama 4 (NUEVA 2026-04-24): grupo publico + miembro aceptado del espacio
    -- Simétrica con policy SELECT "Ver mensajes".
    OR EXISTS (
      SELECT 1 FROM grupos_chat g
      JOIN miembros_espacio me ON me.espacio_id = g.espacio_id
      WHERE g.id = mensajes_chat.grupo_id
        AND g.tipo = 'publico'
        AND me.usuario_id = auth.uid()
        AND me.aceptado = true
    )
  )
);
