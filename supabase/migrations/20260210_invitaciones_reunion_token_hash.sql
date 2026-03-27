ALTER TABLE public.invitaciones_reunion
  ADD COLUMN IF NOT EXISTS token_hash text;

COMMENT ON COLUMN public.invitaciones_reunion.token_hash IS 'Hash SHA-256 del token_unico para validacion segura de invitados externos';

UPDATE public.invitaciones_reunion
SET token_hash = hash_token(token_unico)
WHERE token_hash IS NULL
  AND token_unico IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_reunion_token_hash_idx
  ON public.invitaciones_reunion (token_hash);

CREATE OR REPLACE FUNCTION public.trigger_generar_token_invitacion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token_unico IS NULL OR NEW.token_unico = '' THEN
    NEW.token_unico := generar_token_invitacion();
  END IF;
  IF NEW.token_hash IS NULL OR NEW.token_hash = '' THEN
    NEW.token_hash := hash_token(NEW.token_unico);
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Acceso público por token de invitación" ON public.invitaciones_reunion;
DROP POLICY IF EXISTS "Crear invitaciones" ON public.invitaciones_reunion;
DROP POLICY IF EXISTS "Ver invitaciones de salas propias" ON public.invitaciones_reunion;

CREATE POLICY "Crear invitaciones" ON public.invitaciones_reunion
FOR INSERT TO authenticated
WITH CHECK (
  sala_id IN (
    SELECT salas_reunion.id FROM salas_reunion WHERE salas_reunion.creador_id = auth.uid()
  )
);

CREATE POLICY "Ver invitaciones de salas propias" ON public.invitaciones_reunion
FOR SELECT TO authenticated
USING (
  sala_id IN (
    SELECT salas_reunion.id FROM salas_reunion WHERE salas_reunion.creador_id = auth.uid()
  )
  OR creado_por = auth.uid()
);
