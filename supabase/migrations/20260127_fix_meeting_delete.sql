-- Corregir constraint de grabaciones para evitar bloqueos por CASCADE
ALTER TABLE grabaciones
DROP CONSTRAINT IF EXISTS grabaciones_reunion_id_fkey;

ALTER TABLE grabaciones
ADD CONSTRAINT grabaciones_reunion_id_fkey
FOREIGN KEY (reunion_id)
REFERENCES reuniones_programadas(id)
ON DELETE SET NULL;

-- Actualizar política de eliminación de reuniones
DROP POLICY IF EXISTS "delete_own_meetings" ON reuniones_programadas;
DROP POLICY IF EXISTS "reuniones_delete" ON reuniones_programadas;

CREATE POLICY "delete_meetings_policy"
ON reuniones_programadas
FOR DELETE
USING (
  creado_por = auth.uid()
  OR EXISTS (
    SELECT 1 FROM miembros_espacio me
    WHERE me.espacio_id = reuniones_programadas.espacio_id
    AND me.usuario_id = auth.uid()
    AND me.aceptado = true
    AND me.rol IN ('owner', 'admin', 'super_admin')
  )
);
