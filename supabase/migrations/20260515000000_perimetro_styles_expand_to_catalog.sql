-- Migration: perimetro_styles_expand_to_catalog
--
-- Amplía el CHECK constraint del campo `style` en
-- `espacio_configuracion_perimetro` para soportar los 12 estilos de pared
-- del catálogo de objetos arquitectónicos (en lugar de los 5 originales).
--
-- Objetivo MVP: permitir al admin elegir cualquiera de las paredes que
-- ya están disponibles en el modal "Paredes" del BuildModePanel como
-- estilo perimetral. Cero duplicación de assets entre catálogo y perímetro.
--
-- Cambio: DROP el constraint antiguo (5 valores) y CREATE uno nuevo con
-- los 12. Rows existentes en cualquiera de los 5 valores originales
-- siguen siendo válidos (los 5 viejos están incluidos en el set nuevo).

ALTER TABLE public.espacio_configuracion_perimetro
  DROP CONSTRAINT IF EXISTS espacio_configuracion_perimetro_style_check;

ALTER TABLE public.espacio_configuracion_perimetro
  ADD CONSTRAINT espacio_configuracion_perimetro_style_check
  CHECK (style = ANY (ARRAY[
    'glass'::text,
    'brick'::text,
    'panel'::text,
    'half-wall'::text,
    'basic'::text,
    'window'::text,
    'window-double'::text,
    'door'::text,
    'door-double'::text,
    'arch'::text,
    'stripe'::text,
    'column'::text
  ]));
