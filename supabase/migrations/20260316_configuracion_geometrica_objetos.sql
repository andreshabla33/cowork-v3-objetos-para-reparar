begin;

alter table public.catalogo_objetos_3d
  add column if not exists configuracion_geometria jsonb;

alter table public.espacio_objetos
  add column if not exists configuracion_geometria jsonb;

comment on column public.catalogo_objetos_3d.configuracion_geometria is 'Configuración geométrica declarativa del objeto 3D: material, repetición de textura y aberturas arquitectónicas.';
comment on column public.espacio_objetos.configuracion_geometria is 'Override por instancia de la configuración geométrica del objeto 3D colocado en el espacio.';

update public.catalogo_objetos_3d
set configuracion_geometria = jsonb_build_object(
  'tipo_geometria', 'pared',
  'tipo_material', 'ladrillo',
  'repetir_textura', true,
  'escala_textura', 1,
  'color_base', coalesce(built_in_color, '#b45309'),
  'aberturas', '[]'::jsonb
)
where built_in_geometry = 'wall-brick'
  and configuracion_geometria is null;

update public.catalogo_objetos_3d
set configuracion_geometria = jsonb_build_object(
  'tipo_geometria', 'pared',
  'tipo_material', 'vidrio',
  'repetir_textura', true,
  'escala_textura', 1,
  'color_base', coalesce(built_in_color, '#bfdbfe'),
  'opacidad', 0.35,
  'rugosidad', 0.08,
  'metalicidad', 0.2,
  'aberturas', '[]'::jsonb
)
where built_in_geometry = 'wall-glass'
  and configuracion_geometria is null;

update public.catalogo_objetos_3d
set configuracion_geometria = jsonb_build_object(
  'tipo_geometria', 'pared',
  'tipo_material', 'yeso',
  'repetir_textura', true,
  'escala_textura', 1,
  'color_base', coalesce(built_in_color, '#94a3b8'),
  'aberturas', jsonb_build_array(
    jsonb_build_object(
      'id', 'puerta_1',
      'tipo', 'puerta',
      'forma', case when built_in_geometry = 'wall-arch' then 'arco' else 'rectangular' end,
      'posicion_x', 0,
      'posicion_y', round(((-alto::numeric / 2) + least(alto::numeric * 0.78, 2.2) / 2)::numeric, 4),
      'ancho', round(least(case when built_in_geometry = 'wall-door-double' then ancho::numeric * 0.48 else ancho::numeric * 0.28 end, case when built_in_geometry = 'wall-door-double' then 1.8 else 0.95 end)::numeric, 4),
      'alto', round(least(alto::numeric * 0.78, 2.2)::numeric, 4),
      'insertar_cerramiento', true,
      'grosor_marco', 0.05,
      'profundidad_marco', 0.04
    )
  )
)
where built_in_geometry in ('wall-door', 'wall-door-double', 'wall-arch')
  and configuracion_geometria is null;

update public.catalogo_objetos_3d
set configuracion_geometria = jsonb_build_object(
  'tipo_geometria', 'pared',
  'tipo_material', 'yeso',
  'repetir_textura', true,
  'escala_textura', 1,
  'color_base', coalesce(built_in_color, '#94a3b8'),
  'aberturas', case
    when built_in_geometry = 'wall-window-double' then jsonb_build_array(
      jsonb_build_object(
        'id', 'ventana_1',
        'tipo', 'ventana',
        'forma', 'rectangular',
        'posicion_x', round((-ancho::numeric * 0.22)::numeric, 4),
        'posicion_y', round((alto::numeric * 0.1)::numeric, 4),
        'ancho', round(least(ancho::numeric * 0.22, 1.35)::numeric, 4),
        'alto', round(least(alto::numeric * 0.34, 1.2)::numeric, 4),
        'insertar_cerramiento', true,
        'grosor_marco', 0.045,
        'profundidad_marco', 0.03
      ),
      jsonb_build_object(
        'id', 'ventana_2',
        'tipo', 'ventana',
        'forma', 'rectangular',
        'posicion_x', round((ancho::numeric * 0.22)::numeric, 4),
        'posicion_y', round((alto::numeric * 0.1)::numeric, 4),
        'ancho', round(least(ancho::numeric * 0.22, 1.35)::numeric, 4),
        'alto', round(least(alto::numeric * 0.34, 1.2)::numeric, 4),
        'insertar_cerramiento', true,
        'grosor_marco', 0.045,
        'profundidad_marco', 0.03
      )
    )
    else jsonb_build_array(
      jsonb_build_object(
        'id', 'ventana_1',
        'tipo', 'ventana',
        'forma', 'rectangular',
        'posicion_x', 0,
        'posicion_y', round((alto::numeric * 0.1)::numeric, 4),
        'ancho', round(least(ancho::numeric * 0.34, 1.35)::numeric, 4),
        'alto', round(least(alto::numeric * 0.34, 1.2)::numeric, 4),
        'insertar_cerramiento', true,
        'grosor_marco', 0.045,
        'profundidad_marco', 0.03
      )
    )
  end
)
where built_in_geometry in ('wall-window', 'wall-window-double')
  and configuracion_geometria is null;

update public.catalogo_objetos_3d
set configuracion_geometria = jsonb_build_object(
  'tipo_geometria', case
    when built_in_geometry in ('cylinder', 'cilindro', 'columna', 'wall-column') then 'cilindro'
    when built_in_geometry in ('plane', 'plano') then 'plano'
    else 'caja'
  end,
  'tipo_material', case
    when built_in_geometry in ('wall-panel') then 'madera'
    when built_in_geometry in ('wall-column', 'cylinder', 'cilindro', 'columna') then 'concreto'
    else 'yeso'
  end,
  'repetir_textura', true,
  'escala_textura', 1,
  'color_base', coalesce(built_in_color, '#94a3b8'),
  'aberturas', '[]'::jsonb
)
where built_in_geometry in ('box', 'wall-half', 'wall-panel', 'wall-stripe', 'wall-column', 'cylinder', 'cilindro', 'columna', 'plane', 'plano')
  and configuracion_geometria is null;

update public.espacio_objetos eo
set configuracion_geometria = co.configuracion_geometria
from public.catalogo_objetos_3d co
where eo.catalogo_id = co.id
  and eo.configuracion_geometria is null
  and co.configuracion_geometria is not null;

commit;
