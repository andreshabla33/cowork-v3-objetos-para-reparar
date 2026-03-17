export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _backup_pre_pentest: {
        Row: {
          creado_en: string | null
          datos: Json
          id: number
          tabla: string
        }
        Insert: {
          creado_en?: string | null
          datos: Json
          id?: number
          tabla: string
        }
        Update: {
          creado_en?: string | null
          datos?: Json
          id?: number
          tabla?: string
        }
        Relationships: []
      }
      actividades_log: {
        Row: {
          accion: string
          creado_en: string
          datos_extra: Json
          descripcion: string | null
          empresa_id: string | null
          entidad: string | null
          entidad_id: string | null
          espacio_id: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          datos_extra?: Json
          descripcion?: string | null
          empresa_id?: string | null
          entidad?: string | null
          entidad_id?: string | null
          espacio_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          datos_extra?: Json
          descripcion?: string | null
          empresa_id?: string | null
          entidad?: string | null
          entidad_id?: string | null
          espacio_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      analisis_comportamiento: {
        Row: {
          action_units: Json | null
          creado_en: string | null
          emocion_confianza: number | null
          emocion_dominante: string | null
          emociones_detalle: Json | null
          engagement_score: number | null
          grabacion_id: string
          id: string
          mirando_camara: boolean | null
          participante_id: string | null
          participante_nombre: string | null
          timestamp_segundos: number
        }
        Insert: {
          action_units?: Json | null
          creado_en?: string | null
          emocion_confianza?: number | null
          emocion_dominante?: string | null
          emociones_detalle?: Json | null
          engagement_score?: number | null
          grabacion_id: string
          id?: string
          mirando_camara?: boolean | null
          participante_id?: string | null
          participante_nombre?: string | null
          timestamp_segundos: number
        }
        Update: {
          action_units?: Json | null
          creado_en?: string | null
          emocion_confianza?: number | null
          emocion_dominante?: string | null
          emociones_detalle?: Json | null
          engagement_score?: number | null
          grabacion_id?: string
          id?: string
          mirando_camara?: boolean | null
          participante_id?: string | null
          participante_nombre?: string | null
          timestamp_segundos?: number
        }
        Relationships: [
          {
            foreignKeyName: "analisis_comportamiento_grabacion_id_fkey"
            columns: ["grabacion_id"]
            isOneToOne: false
            referencedRelation: "grabaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizaciones_empresa: {
        Row: {
          actualizada_en: string
          aprobada_por: string | null
          canal_compartido_id: string | null
          creada_en: string
          empresa_destino_id: string
          empresa_origen_id: string
          espacio_id: string
          estado: string
          expira_en: string | null
          id: string
          solicitada_por: string | null
        }
        Insert: {
          actualizada_en?: string
          aprobada_por?: string | null
          canal_compartido_id?: string | null
          creada_en?: string
          empresa_destino_id: string
          empresa_origen_id: string
          espacio_id: string
          estado?: string
          expira_en?: string | null
          id?: string
          solicitada_por?: string | null
        }
        Update: {
          actualizada_en?: string
          aprobada_por?: string | null
          canal_compartido_id?: string | null
          creada_en?: string
          empresa_destino_id?: string
          empresa_origen_id?: string
          espacio_id?: string
          estado?: string
          expira_en?: string | null
          id?: string
          solicitada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizaciones_empresa_destino_fkey"
            columns: ["empresa_destino_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_empresa_espacio_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_empresa_origen_fkey"
            columns: ["empresa_origen_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_animaciones: {
        Row: {
          activo: boolean | null
          avatar_id: string
          creado_en: string | null
          descripcion: string | null
          duracion_ms: number | null
          id: string
          loop: boolean | null
          nombre: string
          orden: number | null
          strip_root_motion: boolean | null
          url: string
        }
        Insert: {
          activo?: boolean | null
          avatar_id: string
          creado_en?: string | null
          descripcion?: string | null
          duracion_ms?: number | null
          id?: string
          loop?: boolean | null
          nombre: string
          orden?: number | null
          strip_root_motion?: boolean | null
          url: string
        }
        Update: {
          activo?: boolean | null
          avatar_id?: string
          creado_en?: string | null
          descripcion?: string | null
          duracion_ms?: number | null
          id?: string
          loop?: boolean | null
          nombre?: string
          orden?: number | null
          strip_root_motion?: boolean | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_animaciones_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatares_3d"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_categorias: {
        Row: {
          descripcion: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      avatar_configuracion: {
        Row: {
          actualizado_en: string | null
          configuracion: Json
          id: string
          sprite_generado_url: string | null
          usuario_id: string | null
        }
        Insert: {
          actualizado_en?: string | null
          configuracion?: Json
          id?: string
          sprite_generado_url?: string | null
          usuario_id?: string | null
        }
        Update: {
          actualizado_en?: string | null
          configuracion?: Json
          id?: string
          sprite_generado_url?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_configuracion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          folder_name: string
          front_url: string | null
          id: string
          idle_url: string | null
          meshy_remesh_task_id: string | null
          meshy_rig_task_id: string | null
          meshy_task_id: string | null
          meshy_texture_task_id: string | null
          model_url: string | null
          running_url: string | null
          status: string
          updated_at: string
          user_name: string
          walking_url: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          folder_name: string
          front_url?: string | null
          id?: string
          idle_url?: string | null
          meshy_remesh_task_id?: string | null
          meshy_rig_task_id?: string | null
          meshy_task_id?: string | null
          meshy_texture_task_id?: string | null
          model_url?: string | null
          running_url?: string | null
          status?: string
          updated_at?: string
          user_name: string
          walking_url?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          folder_name?: string
          front_url?: string | null
          id?: string
          idle_url?: string | null
          meshy_remesh_task_id?: string | null
          meshy_rig_task_id?: string | null
          meshy_task_id?: string | null
          meshy_texture_task_id?: string | null
          model_url?: string | null
          running_url?: string | null
          status?: string
          updated_at?: string
          user_name?: string
          walking_url?: string | null
        }
        Relationships: []
      }
      avatar_piezas: {
        Row: {
          activo: boolean | null
          categoria_id: string | null
          color_base: string | null
          es_coloreable: boolean | null
          es_premium: boolean | null
          id: string
          nombre: string
          orden: number | null
          sprite_url: string
        }
        Insert: {
          activo?: boolean | null
          categoria_id?: string | null
          color_base?: string | null
          es_coloreable?: boolean | null
          es_premium?: boolean | null
          id?: string
          nombre: string
          orden?: number | null
          sprite_url: string
        }
        Update: {
          activo?: boolean | null
          categoria_id?: string | null
          color_base?: string | null
          es_coloreable?: boolean | null
          es_premium?: boolean | null
          id?: string
          nombre?: string
          orden?: number | null
          sprite_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_piezas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "avatar_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      avatares_3d: {
        Row: {
          activo: boolean | null
          animacion_idle_url: string | null
          animacion_salute_url: string | null
          animacion_walk_url: string | null
          creado_en: string | null
          descripcion: string | null
          escala: number | null
          id: string
          modelo_url: string
          nombre: string
          orden: number | null
          textura_url: string | null
          thumbnail_url: string | null
        }
        Insert: {
          activo?: boolean | null
          animacion_idle_url?: string | null
          animacion_salute_url?: string | null
          animacion_walk_url?: string | null
          creado_en?: string | null
          descripcion?: string | null
          escala?: number | null
          id?: string
          modelo_url: string
          nombre: string
          orden?: number | null
          textura_url?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          activo?: boolean | null
          animacion_idle_url?: string | null
          animacion_salute_url?: string | null
          animacion_walk_url?: string | null
          creado_en?: string | null
          descripcion?: string | null
          escala?: number | null
          id?: string
          modelo_url?: string
          nombre?: string
          orden?: number | null
          textura_url?: string | null
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      cargos: {
        Row: {
          activo: boolean | null
          analisis_disponibles: string[] | null
          categoria: string
          clave: string | null
          created_at: string | null
          descripcion: string | null
          espacio_id: string
          icono: string | null
          id: string
          nombre: string
          orden: number | null
          solo_admin: boolean | null
          tiene_analisis_avanzado: boolean | null
        }
        Insert: {
          activo?: boolean | null
          analisis_disponibles?: string[] | null
          categoria?: string
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          espacio_id: string
          icono?: string | null
          id?: string
          nombre: string
          orden?: number | null
          solo_admin?: boolean | null
          tiene_analisis_avanzado?: boolean | null
        }
        Update: {
          activo?: boolean | null
          analisis_disponibles?: string[] | null
          categoria?: string
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          espacio_id?: string
          icono?: string | null
          id?: string
          nombre?: string
          orden?: number | null
          solo_admin?: boolean | null
          tiene_analisis_avanzado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_metricas_espacio: {
        Row: {
          actualizado_por: string | null
          created_at: string | null
          espacio_id: string
          id: string
          metricas_activas: string[]
          tipo_analisis: string
          updated_at: string | null
        }
        Insert: {
          actualizado_por?: string | null
          created_at?: string | null
          espacio_id: string
          id?: string
          metricas_activas?: string[]
          tipo_analisis: string
          updated_at?: string | null
        }
        Update: {
          actualizado_por?: string | null
          created_at?: string | null
          espacio_id?: string
          id?: string
          metricas_activas?: string[]
          tipo_analisis?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_metricas_espacio_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          color: string | null
          creado_en: string
          descripcion: string | null
          espacio_id: string
          icono: string | null
          id: string
          nombre: string
        }
        Insert: {
          color?: string | null
          creado_en?: string
          descripcion?: string | null
          espacio_id: string
          icono?: string | null
          id?: string
          nombre: string
        }
        Update: {
          color?: string | null
          creado_en?: string
          descripcion?: string | null
          espacio_id?: string
          icono?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      documentacion: {
        Row: {
          autor: string | null
          categoria: string | null
          clave: string
          contenido: string
          created_at: string | null
          descripcion: string | null
          estado: string | null
          id: string
          metadata: Json | null
          tags: string[] | null
          titulo: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          autor?: string | null
          categoria?: string | null
          clave: string
          contenido: string
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          id?: string
          metadata?: Json | null
          tags?: string[] | null
          titulo: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          autor?: string | null
          categoria?: string | null
          clave?: string
          contenido?: string
          created_at?: string | null
          descripcion?: string | null
          estado?: string | null
          id?: string
          metadata?: Json | null
          tags?: string[] | null
          titulo?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      empresas: {
        Row: {
          actualizado_en: string | null
          ciudad: string | null
          creado_en: string | null
          creado_por: string | null
          descripcion: string | null
          direccion: string | null
          email_contacto: string | null
          espacio_id: string
          id: string
          industria: string | null
          logo_url: string | null
          nit_rut: string | null
          nombre: string
          pais: string | null
          plantilla_oficina: string | null
          sitio_web: string | null
          tamano: string | null
          telefono: string | null
        }
        Insert: {
          actualizado_en?: string | null
          ciudad?: string | null
          creado_en?: string | null
          creado_por?: string | null
          descripcion?: string | null
          direccion?: string | null
          email_contacto?: string | null
          espacio_id: string
          id?: string
          industria?: string | null
          logo_url?: string | null
          nit_rut?: string | null
          nombre: string
          pais?: string | null
          plantilla_oficina?: string | null
          sitio_web?: string | null
          tamano?: string | null
          telefono?: string | null
        }
        Update: {
          actualizado_en?: string | null
          ciudad?: string | null
          creado_en?: string | null
          creado_por?: string | null
          descripcion?: string | null
          direccion?: string | null
          email_contacto?: string | null
          espacio_id?: string
          id?: string
          industria?: string | null
          logo_url?: string | null
          nit_rut?: string | null
          nombre?: string
          pais?: string | null
          plantilla_oficina?: string | null
          sitio_web?: string | null
          tamano?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      espacio_objetos: {
        Row: {
          actualizado_en: string
          creado_en: string
          empresa_id: string | null
          es_de_plantilla: boolean
          escala_x: number
          escala_y: number
          escala_z: number
          espacio_id: string
          id: string
          modelo_url: string
          nombre: string | null
          owner_id: string | null
          plantilla_origen: string | null
          posicion_x: number
          posicion_y: number
          posicion_z: number
          rotacion_x: number
          rotacion_y: number
          rotacion_z: number
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          empresa_id?: string | null
          es_de_plantilla?: boolean
          escala_x?: number
          escala_y?: number
          escala_z?: number
          espacio_id: string
          id?: string
          modelo_url: string
          nombre?: string | null
          owner_id?: string | null
          plantilla_origen?: string | null
          posicion_x?: number
          posicion_y?: number
          posicion_z?: number
          rotacion_x?: number
          rotacion_y?: number
          rotacion_z?: number
          tipo?: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          empresa_id?: string | null
          es_de_plantilla?: boolean
          escala_x?: number
          escala_y?: number
          escala_z?: number
          espacio_id?: string
          id?: string
          modelo_url?: string
          nombre?: string | null
          owner_id?: string | null
          plantilla_origen?: string | null
          posicion_x?: number
          posicion_y?: number
          posicion_z?: number
          rotacion_x?: number
          rotacion_y?: number
          rotacion_z?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "espacio_objetos_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espacio_objetos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      espacios_trabajo: {
        Row: {
          actualizado_en: string
          configuracion: Json | null
          creado_en: string
          creado_por: string
          descripcion: string | null
          empresa_id: string | null
          id: string
          logo_url: string | null
          nombre: string
          slug: string
        }
        Insert: {
          actualizado_en?: string
          configuracion?: Json | null
          creado_en?: string
          creado_por: string
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          logo_url?: string | null
          nombre: string
          slug: string
        }
        Update: {
          actualizado_en?: string
          configuracion?: Json | null
          creado_en?: string
          creado_por?: string
          descripcion?: string | null
          empresa_id?: string | null
          id?: string
          logo_url?: string | null
          nombre?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "espacios_trabajo_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espacios_trabajo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      estadisticas_jugador: {
        Row: {
          id: string
          juego_favorito: string | null
          juegos_totales: number | null
          mejor_racha: number | null
          puntuacion_total: number | null
          racha_actual: number | null
          tiempo_total_jugado: number | null
          updated_at: string | null
          usuario_id: string
          victorias: number | null
        }
        Insert: {
          id?: string
          juego_favorito?: string | null
          juegos_totales?: number | null
          mejor_racha?: number | null
          puntuacion_total?: number | null
          racha_actual?: number | null
          tiempo_total_jugado?: number | null
          updated_at?: string | null
          usuario_id: string
          victorias?: number | null
        }
        Update: {
          id?: string
          juego_favorito?: string | null
          juegos_totales?: number | null
          mejor_racha?: number | null
          puntuacion_total?: number | null
          racha_actual?: number | null
          tiempo_total_jugado?: number | null
          updated_at?: string | null
          usuario_id?: string
          victorias?: number | null
        }
        Relationships: []
      }
      gamificacion_items: {
        Row: {
          clave: string
          created_at: string
          datos: Json | null
          descripcion: string | null
          icono: string | null
          id: string
          nivel_requerido: number
          nombre: string
          tipo: string
        }
        Insert: {
          clave: string
          created_at?: string
          datos?: Json | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          nivel_requerido?: number
          nombre: string
          tipo: string
        }
        Update: {
          clave?: string
          created_at?: string
          datos?: Json | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          nivel_requerido?: number
          nombre?: string
          tipo?: string
        }
        Relationships: []
      }
      gamificacion_logros: {
        Row: {
          clave: string
          condicion: Json | null
          created_at: string
          descripcion: string | null
          icono: string | null
          id: string
          tipo: string
          titulo: string
          xp_recompensa: number
        }
        Insert: {
          clave: string
          condicion?: Json | null
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          tipo?: string
          titulo: string
          xp_recompensa?: number
        }
        Update: {
          clave?: string
          condicion?: Json | null
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          tipo?: string
          titulo?: string
          xp_recompensa?: number
        }
        Relationships: []
      }
      gamificacion_logros_usuario: {
        Row: {
          desbloqueado_en: string
          espacio_id: string | null
          id: string
          logro_id: string
          usuario_id: string
        }
        Insert: {
          desbloqueado_en?: string
          espacio_id?: string | null
          id?: string
          logro_id: string
          usuario_id: string
        }
        Update: {
          desbloqueado_en?: string
          espacio_id?: string | null
          id?: string
          logro_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamificacion_logros_usuario_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamificacion_logros_usuario_logro_id_fkey"
            columns: ["logro_id"]
            isOneToOne: false
            referencedRelation: "gamificacion_logros"
            referencedColumns: ["id"]
          },
        ]
      }
      gamificacion_misiones: {
        Row: {
          completada_en: string | null
          created_at: string
          descripcion: string | null
          espacio_id: string | null
          estado: string
          fecha: string
          id: string
          objetivo_cantidad: number
          progreso_actual: number
          tipo: string
          titulo: string
          usuario_id: string
          xp_recompensa: number
        }
        Insert: {
          completada_en?: string | null
          created_at?: string
          descripcion?: string | null
          espacio_id?: string | null
          estado?: string
          fecha?: string
          id?: string
          objetivo_cantidad?: number
          progreso_actual?: number
          tipo: string
          titulo: string
          usuario_id: string
          xp_recompensa?: number
        }
        Update: {
          completada_en?: string | null
          created_at?: string
          descripcion?: string | null
          espacio_id?: string | null
          estado?: string
          fecha?: string
          id?: string
          objetivo_cantidad?: number
          progreso_actual?: number
          tipo?: string
          titulo?: string
          usuario_id?: string
          xp_recompensa?: number
        }
        Relationships: [
          {
            foreignKeyName: "gamificacion_misiones_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      gamificacion_usuarios: {
        Row: {
          created_at: string
          espacio_id: string | null
          estadisticas: Json | null
          id: string
          items_desbloqueados: Json | null
          nivel: number
          racha_dias: number
          racha_max: number
          titulo_activo: string | null
          ultimo_login: string | null
          updated_at: string
          usuario_id: string
          xp_total: number
        }
        Insert: {
          created_at?: string
          espacio_id?: string | null
          estadisticas?: Json | null
          id?: string
          items_desbloqueados?: Json | null
          nivel?: number
          racha_dias?: number
          racha_max?: number
          titulo_activo?: string | null
          ultimo_login?: string | null
          updated_at?: string
          usuario_id: string
          xp_total?: number
        }
        Update: {
          created_at?: string
          espacio_id?: string | null
          estadisticas?: Json | null
          id?: string
          items_desbloqueados?: Json | null
          nivel?: number
          racha_dias?: number
          racha_max?: number
          titulo_activo?: string | null
          ultimo_login?: string | null
          updated_at?: string
          usuario_id?: string
          xp_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "gamificacion_usuarios_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      grabaciones: {
        Row: {
          actualizado_en: string | null
          archivo_nombre: string | null
          archivo_url: string | null
          consentimiento_evaluado: boolean | null
          consentimiento_evaluado_fecha: string | null
          creado_en: string | null
          creado_por: string
          duracion_segundos: number | null
          error_mensaje: string | null
          espacio_id: string
          estado: string | null
          evaluado_email: string | null
          evaluado_id: string | null
          evaluado_nombre: string | null
          fin_grabacion: string | null
          formato: string | null
          id: string
          inicio_grabacion: string | null
          progreso_porcentaje: number | null
          reunion_id: string | null
          sala_id: string | null
          tamaño_bytes: number | null
          tiene_audio: boolean | null
          tiene_video: boolean | null
          tipo: string | null
        }
        Insert: {
          actualizado_en?: string | null
          archivo_nombre?: string | null
          archivo_url?: string | null
          consentimiento_evaluado?: boolean | null
          consentimiento_evaluado_fecha?: string | null
          creado_en?: string | null
          creado_por: string
          duracion_segundos?: number | null
          error_mensaje?: string | null
          espacio_id: string
          estado?: string | null
          evaluado_email?: string | null
          evaluado_id?: string | null
          evaluado_nombre?: string | null
          fin_grabacion?: string | null
          formato?: string | null
          id?: string
          inicio_grabacion?: string | null
          progreso_porcentaje?: number | null
          reunion_id?: string | null
          sala_id?: string | null
          tamaño_bytes?: number | null
          tiene_audio?: boolean | null
          tiene_video?: boolean | null
          tipo?: string | null
        }
        Update: {
          actualizado_en?: string | null
          archivo_nombre?: string | null
          archivo_url?: string | null
          consentimiento_evaluado?: boolean | null
          consentimiento_evaluado_fecha?: string | null
          creado_en?: string | null
          creado_por?: string
          duracion_segundos?: number | null
          error_mensaje?: string | null
          espacio_id?: string
          estado?: string | null
          evaluado_email?: string | null
          evaluado_id?: string | null
          evaluado_nombre?: string | null
          fin_grabacion?: string | null
          formato?: string | null
          id?: string
          inicio_grabacion?: string | null
          progreso_porcentaje?: number | null
          reunion_id?: string | null
          sala_id?: string | null
          tamaño_bytes?: number | null
          tiene_audio?: boolean | null
          tiene_video?: boolean | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grabaciones_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grabaciones_evaluado_id_fkey"
            columns: ["evaluado_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grabaciones_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "reuniones_programadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grabaciones_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
        ]
      }
      grabaciones_sala: {
        Row: {
          duracion_segundos: number | null
          estado_grabacion: string | null
          finalizado_en: string | null
          formato: string | null
          id: string
          iniciado_en: string | null
          iniciado_por: string
          livekit_egress_id: string | null
          metadata: Json | null
          nombre: string | null
          sala_id: string | null
          tamano_bytes: number | null
          url_storage: string | null
        }
        Insert: {
          duracion_segundos?: number | null
          estado_grabacion?: string | null
          finalizado_en?: string | null
          formato?: string | null
          id?: string
          iniciado_en?: string | null
          iniciado_por: string
          livekit_egress_id?: string | null
          metadata?: Json | null
          nombre?: string | null
          sala_id?: string | null
          tamano_bytes?: number | null
          url_storage?: string | null
        }
        Update: {
          duracion_segundos?: number | null
          estado_grabacion?: string | null
          finalizado_en?: string | null
          formato?: string | null
          id?: string
          iniciado_en?: string | null
          iniciado_por?: string
          livekit_egress_id?: string | null
          metadata?: Json | null
          nombre?: string | null
          sala_id?: string | null
          tamano_bytes?: number | null
          url_storage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grabaciones_sala_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_chat: {
        Row: {
          actualizado_en: string | null
          color: string | null
          contrasena: string | null
          creado_en: string | null
          creado_por: string | null
          descripcion: string | null
          espacio_id: string
          icono: string | null
          id: string
          nombre: string
          tipo: string
        }
        Insert: {
          actualizado_en?: string | null
          color?: string | null
          contrasena?: string | null
          creado_en?: string | null
          creado_por?: string | null
          descripcion?: string | null
          espacio_id: string
          icono?: string | null
          id?: string
          nombre: string
          tipo?: string
        }
        Update: {
          actualizado_en?: string | null
          color?: string | null
          contrasena?: string | null
          creado_en?: string | null
          creado_por?: string | null
          descripcion?: string | null
          espacio_id?: string
          icono?: string | null
          id?: string
          nombre?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_chat_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_chat_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_juegos: {
        Row: {
          datos_resultado: Json | null
          duracion: number | null
          gano: boolean | null
          id: string
          jugado_en: string | null
          posicion: number | null
          puntuacion: number | null
          sesion_id: string | null
          tipo_juego: string
          usuario_id: string
        }
        Insert: {
          datos_resultado?: Json | null
          duracion?: number | null
          gano?: boolean | null
          id?: string
          jugado_en?: string | null
          posicion?: number | null
          puntuacion?: number | null
          sesion_id?: string | null
          tipo_juego: string
          usuario_id: string
        }
        Update: {
          datos_resultado?: Json | null
          duracion?: number | null
          gano?: boolean | null
          id?: string
          jugado_en?: string | null
          posicion?: number | null
          puntuacion?: number | null
          sesion_id?: string | null
          tipo_juego?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historial_juegos_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_juego"
            referencedColumns: ["id"]
          },
        ]
      }
      intentos_verificacion: {
        Row: {
          creado_en: string | null
          exitoso: boolean | null
          id: string
          ip_address: string
          token_hash_intentado: string | null
        }
        Insert: {
          creado_en?: string | null
          exitoso?: boolean | null
          id?: string
          ip_address: string
          token_hash_intentado?: string | null
        }
        Update: {
          creado_en?: string | null
          exitoso?: boolean | null
          id?: string
          ip_address?: string
          token_hash_intentado?: string | null
        }
        Relationships: []
      }
      invitaciones_juegos: {
        Row: {
          configuracion: Json | null
          creada_en: string | null
          espacio_id: string
          estado: string
          expira_en: string | null
          id: string
          invitado_id: string
          invitador_id: string
          juego: string
          partida_id: string | null
          respondida_en: string | null
        }
        Insert: {
          configuracion?: Json | null
          creada_en?: string | null
          espacio_id: string
          estado?: string
          expira_en?: string | null
          id?: string
          invitado_id: string
          invitador_id: string
          juego?: string
          partida_id?: string | null
          respondida_en?: string | null
        }
        Update: {
          configuracion?: Json | null
          creada_en?: string | null
          espacio_id?: string
          estado?: string
          expira_en?: string | null
          id?: string
          invitado_id?: string
          invitador_id?: string
          juego?: string
          partida_id?: string | null
          respondida_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_juegos_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_juegos_invitado_id_fkey"
            columns: ["invitado_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_juegos_invitador_id_fkey"
            columns: ["invitador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_juegos_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas_ajedrez"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones_pendientes: {
        Row: {
          cargo_sugerido: Database["public"]["Enums"]["cargo_laboral"] | null
          creada_en: string
          creada_por: string
          email: string
          empresa_id: string
          espacio_id: string
          expira_en: string
          id: string
          rol: string
          token: string
          token_hash: string | null
          usada: boolean | null
        }
        Insert: {
          cargo_sugerido?: Database["public"]["Enums"]["cargo_laboral"] | null
          creada_en?: string
          creada_por: string
          email: string
          empresa_id: string
          espacio_id: string
          expira_en: string
          id?: string
          rol?: string
          token: string
          token_hash?: string | null
          usada?: boolean | null
        }
        Update: {
          cargo_sugerido?: Database["public"]["Enums"]["cargo_laboral"] | null
          creada_en?: string
          creada_por?: string
          email?: string
          empresa_id?: string
          espacio_id?: string
          expira_en?: string
          id?: string
          rol?: string
          token?: string
          token_hash?: string | null
          usada?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_pendientes_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_pendientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_pendientes_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones_reunion: {
        Row: {
          creado_en: string | null
          creado_por: string
          email: string
          enviado_en: string | null
          expira_en: string | null
          id: string
          mensaje_personalizado: string | null
          nombre: string | null
          participante_id: string | null
          sala_id: string | null
          showroom_duracion_min: number | null
          showroom_habilitado: boolean | null
          tipo_invitado: string | null
          token_hash: string | null
          token_unico: string
          ultimo_acceso: string | null
          usado: boolean | null
          veces_accedido: number | null
        }
        Insert: {
          creado_en?: string | null
          creado_por: string
          email: string
          enviado_en?: string | null
          expira_en?: string | null
          id?: string
          mensaje_personalizado?: string | null
          nombre?: string | null
          participante_id?: string | null
          sala_id?: string | null
          showroom_duracion_min?: number | null
          showroom_habilitado?: boolean | null
          tipo_invitado?: string | null
          token_hash?: string | null
          token_unico: string
          ultimo_acceso?: string | null
          usado?: boolean | null
          veces_accedido?: number | null
        }
        Update: {
          creado_en?: string | null
          creado_por?: string
          email?: string
          enviado_en?: string | null
          expira_en?: string | null
          id?: string
          mensaje_personalizado?: string | null
          nombre?: string | null
          participante_id?: string | null
          sala_id?: string | null
          showroom_duracion_min?: number | null
          showroom_habilitado?: boolean | null
          tipo_invitado?: string | null
          token_hash?: string | null
          token_unico?: string
          ultimo_acceso?: string | null
          usado?: boolean | null
          veces_accedido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_reunion_participante_id_fkey"
            columns: ["participante_id"]
            isOneToOne: false
            referencedRelation: "participantes_sala"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_reunion_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
        ]
      }
      jugadores_sesion: {
        Row: {
          avatar: string | null
          datos_juego: Json | null
          equipo_id: string | null
          esta_listo: boolean | null
          id: string
          joined_at: string | null
          nombre: string
          puntuacion: number | null
          rol: string | null
          sesion_id: string
          usuario_id: string
        }
        Insert: {
          avatar?: string | null
          datos_juego?: Json | null
          equipo_id?: string | null
          esta_listo?: boolean | null
          id?: string
          joined_at?: string | null
          nombre: string
          puntuacion?: number | null
          rol?: string | null
          sesion_id: string
          usuario_id: string
        }
        Update: {
          avatar?: string | null
          datos_juego?: Json | null
          equipo_id?: string | null
          esta_listo?: boolean | null
          id?: string
          joined_at?: string | null
          nombre?: string
          puntuacion?: number | null
          rol?: string | null
          sesion_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jugadores_sesion_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_juego"
            referencedColumns: ["id"]
          },
        ]
      }
      logros_jugador: {
        Row: {
          desbloqueado_en: string | null
          descripcion: string | null
          icono: string | null
          id: string
          logro_id: string
          nombre: string
          puntos: number | null
          rareza: string | null
          tipo_juego: string | null
          usuario_id: string
        }
        Insert: {
          desbloqueado_en?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          logro_id: string
          nombre: string
          puntos?: number | null
          rareza?: string | null
          tipo_juego?: string | null
          usuario_id: string
        }
        Update: {
          desbloqueado_en?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          logro_id?: string
          nombre?: string
          puntos?: number | null
          rareza?: string | null
          tipo_juego?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      mensajes_chat: {
        Row: {
          archivo_url: string | null
          contenido: string
          creado_en: string | null
          editado: boolean | null
          editado_en: string | null
          grupo_id: string
          id: string
          menciones: string[] | null
          respuesta_a: string | null
          respuestas_count: number | null
          tipo: string | null
          usuario_id: string | null
        }
        Insert: {
          archivo_url?: string | null
          contenido: string
          creado_en?: string | null
          editado?: boolean | null
          editado_en?: string | null
          grupo_id: string
          id?: string
          menciones?: string[] | null
          respuesta_a?: string | null
          respuestas_count?: number | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Update: {
          archivo_url?: string | null
          contenido?: string
          creado_en?: string | null
          editado?: boolean | null
          editado_en?: string | null
          grupo_id?: string
          id?: string
          menciones?: string[] | null
          respuesta_a?: string | null
          respuestas_count?: number | null
          tipo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_chat_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_chat_respuesta_a_fkey"
            columns: ["respuesta_a"]
            isOneToOne: false
            referencedRelation: "mensajes_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_chat_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_leidos: {
        Row: {
          grupo_id: string
          id: string
          leido_en: string | null
          ultimo_mensaje_leido: string | null
          usuario_id: string
        }
        Insert: {
          grupo_id: string
          id?: string
          leido_en?: string | null
          ultimo_mensaje_leido?: string | null
          usuario_id: string
        }
        Update: {
          grupo_id?: string
          id?: string
          leido_en?: string | null
          ultimo_mensaje_leido?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_leidos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_leidos_ultimo_mensaje_leido_fkey"
            columns: ["ultimo_mensaje_leido"]
            isOneToOne: false
            referencedRelation: "mensajes_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_leidos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_empresa: {
        Row: {
          actualizado_en: string | null
          conexiones: number | null
          creado_en: string | null
          desconexiones: number | null
          emotes_enviados: number | null
          empresa_id: string
          espacio_id: string
          fecha: string
          id: string
          mensajes_chat: number | null
          minutos_reunion: number | null
          nivel_promedio: number | null
          racha_promedio: number | null
          reuniones_asistidas: number | null
          reuniones_creadas: number | null
          saludos_wave: number | null
          teleports: number | null
          usuarios_activos: number | null
          xp_ganado: number | null
        }
        Insert: {
          actualizado_en?: string | null
          conexiones?: number | null
          creado_en?: string | null
          desconexiones?: number | null
          emotes_enviados?: number | null
          empresa_id: string
          espacio_id: string
          fecha?: string
          id?: string
          mensajes_chat?: number | null
          minutos_reunion?: number | null
          nivel_promedio?: number | null
          racha_promedio?: number | null
          reuniones_asistidas?: number | null
          reuniones_creadas?: number | null
          saludos_wave?: number | null
          teleports?: number | null
          usuarios_activos?: number | null
          xp_ganado?: number | null
        }
        Update: {
          actualizado_en?: string | null
          conexiones?: number | null
          creado_en?: string | null
          desconexiones?: number | null
          emotes_enviados?: number | null
          empresa_id?: string
          espacio_id?: string
          fecha?: string
          id?: string
          mensajes_chat?: number | null
          minutos_reunion?: number | null
          nivel_promedio?: number | null
          racha_promedio?: number | null
          reuniones_asistidas?: number | null
          reuniones_creadas?: number | null
          saludos_wave?: number | null
          teleports?: number | null
          usuarios_activos?: number | null
          xp_ganado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_empresa_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros_espacio: {
        Row: {
          aceptado: boolean | null
          aceptado_en: string | null
          cargo: string | null
          cargo_id: string | null
          departamento_id: string | null
          empresa_id: string
          espacio_id: string
          id: string
          invitacion_enviada_en: string | null
          invitacion_enviada_por: string | null
          invitacion_token: string | null
          onboarding_completado: boolean | null
          rol: string
          spawn_x: number | null
          spawn_z: number | null
          tour_completado: boolean | null
          tour_no_mostrar: boolean | null
          tour_veces_mostrado: number | null
          usuario_id: string
        }
        Insert: {
          aceptado?: boolean | null
          aceptado_en?: string | null
          cargo?: string | null
          cargo_id?: string | null
          departamento_id?: string | null
          empresa_id: string
          espacio_id: string
          id?: string
          invitacion_enviada_en?: string | null
          invitacion_enviada_por?: string | null
          invitacion_token?: string | null
          onboarding_completado?: boolean | null
          rol: string
          spawn_x?: number | null
          spawn_z?: number | null
          tour_completado?: boolean | null
          tour_no_mostrar?: boolean | null
          tour_veces_mostrado?: number | null
          usuario_id: string
        }
        Update: {
          aceptado?: boolean | null
          aceptado_en?: string | null
          cargo?: string | null
          cargo_id?: string | null
          departamento_id?: string | null
          empresa_id?: string
          espacio_id?: string
          id?: string
          invitacion_enviada_en?: string | null
          invitacion_enviada_por?: string | null
          invitacion_token?: string | null
          onboarding_completado?: boolean | null
          rol?: string
          spawn_x?: number | null
          spawn_z?: number | null
          tour_completado?: boolean | null
          tour_no_mostrar?: boolean | null
          tour_veces_mostrado?: number | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_espacio_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_espacio_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_espacio_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_espacio_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_espacio_invitacion_enviada_por_fkey"
            columns: ["invitacion_enviada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_espacio_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      miembros_grupo: {
        Row: {
          grupo_id: string
          id: string
          rol: string | null
          silenciado: boolean | null
          unido_en: string | null
          usuario_id: string
        }
        Insert: {
          grupo_id: string
          id?: string
          rol?: string | null
          silenciado?: boolean | null
          unido_en?: string | null
          usuario_id: string
        }
        Update: {
          grupo_id?: string
          id?: string
          rol?: string | null
          silenciado?: boolean | null
          unido_en?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "miembros_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "miembros_grupo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          creado_en: string | null
          datos_extra: Json | null
          entidad_id: string | null
          entidad_tipo: string | null
          espacio_id: string | null
          id: string
          leida: boolean | null
          leida_en: string | null
          mensaje: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string | null
          datos_extra?: Json | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          espacio_id?: string | null
          id?: string
          leida?: boolean | null
          leida_en?: string | null
          mensaje?: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Update: {
          creado_en?: string | null
          datos_extra?: Json | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          espacio_id?: string | null
          id?: string
          leida?: boolean | null
          leida_en?: string | null
          mensaje?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      participantes_grabacion: {
        Row: {
          consentimiento_dado: boolean | null
          consentimiento_fecha: string | null
          creado_en: string | null
          es_evaluado: boolean | null
          grabacion_id: string
          id: string
          nombre_mostrado: string | null
          usuario_id: string
        }
        Insert: {
          consentimiento_dado?: boolean | null
          consentimiento_fecha?: string | null
          creado_en?: string | null
          es_evaluado?: boolean | null
          grabacion_id: string
          id?: string
          nombre_mostrado?: string | null
          usuario_id: string
        }
        Update: {
          consentimiento_dado?: boolean | null
          consentimiento_fecha?: string | null
          creado_en?: string | null
          es_evaluado?: boolean | null
          grabacion_id?: string
          id?: string
          nombre_mostrado?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participantes_grabacion_grabacion_id_fkey"
            columns: ["grabacion_id"]
            isOneToOne: false
            referencedRelation: "grabaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participantes_grabacion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      participantes_sala: {
        Row: {
          admitido_en: string | null
          cam_activa: boolean | null
          compartiendo_pantalla: boolean | null
          email_invitado: string | null
          estado_participante: string | null
          id: string
          livekit_participant_id: string | null
          mic_activo: boolean | null
          nombre_invitado: string | null
          permisos: Json | null
          sala_id: string
          salido_en: string | null
          tipo_participante: string | null
          ultima_actividad: string | null
          unido_en: string | null
          usuario_id: string | null
        }
        Insert: {
          admitido_en?: string | null
          cam_activa?: boolean | null
          compartiendo_pantalla?: boolean | null
          email_invitado?: string | null
          estado_participante?: string | null
          id?: string
          livekit_participant_id?: string | null
          mic_activo?: boolean | null
          nombre_invitado?: string | null
          permisos?: Json | null
          sala_id: string
          salido_en?: string | null
          tipo_participante?: string | null
          ultima_actividad?: string | null
          unido_en?: string | null
          usuario_id?: string | null
        }
        Update: {
          admitido_en?: string | null
          cam_activa?: boolean | null
          compartiendo_pantalla?: boolean | null
          email_invitado?: string | null
          estado_participante?: string | null
          id?: string
          livekit_participant_id?: string | null
          mic_activo?: boolean | null
          nombre_invitado?: string | null
          permisos?: Json | null
          sala_id?: string
          salido_en?: string | null
          tipo_participante?: string | null
          ultima_actividad?: string | null
          unido_en?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participantes_sala_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participantes_sala_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas_ajedrez: {
        Row: {
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fen_actual: string | null
          ganador: string | null
          historial_movimientos: Json | null
          id: string
          jugador_blancas_id: string
          jugador_negras_id: string | null
          pgn: string | null
          piezas_capturadas_blancas: string[] | null
          piezas_capturadas_negras: string[] | null
          sesion_id: string | null
          tiempo_blancas: number | null
          tiempo_negras: number | null
          turno: string | null
          ultimo_movimiento: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fen_actual?: string | null
          ganador?: string | null
          historial_movimientos?: Json | null
          id?: string
          jugador_blancas_id: string
          jugador_negras_id?: string | null
          pgn?: string | null
          piezas_capturadas_blancas?: string[] | null
          piezas_capturadas_negras?: string[] | null
          sesion_id?: string | null
          tiempo_blancas?: number | null
          tiempo_negras?: number | null
          turno?: string | null
          ultimo_movimiento?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fen_actual?: string | null
          ganador?: string | null
          historial_movimientos?: Json | null
          id?: string
          jugador_blancas_id?: string
          jugador_negras_id?: string | null
          pgn?: string | null
          piezas_capturadas_blancas?: string[] | null
          piezas_capturadas_negras?: string[] | null
          sesion_id?: string | null
          tiempo_blancas?: number | null
          tiempo_negras?: number | null
          turno?: string | null
          ultimo_movimiento?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partidas_ajedrez_sesion_id_fkey"
            columns: ["sesion_id"]
            isOneToOne: false
            referencedRelation: "sesiones_juego"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_conexiones: {
        Row: {
          conectado_en: string
          created_at: string | null
          desconectado_en: string | null
          duracion_minutos: number | null
          empresa_id: string | null
          espacio_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          conectado_en?: string
          created_at?: string | null
          desconectado_en?: string | null
          duracion_minutos?: number | null
          empresa_id?: string | null
          espacio_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          conectado_en?: string
          created_at?: string | null
          desconectado_en?: string | null
          duracion_minutos?: number | null
          empresa_id?: string | null
          espacio_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_conexiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_conexiones_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      resumenes_ai: {
        Row: {
          action_items: Json | null
          costo_estimado: number | null
          creado_en: string | null
          grabacion_id: string
          id: string
          modelo_usado: string | null
          participacion_speakers: Json | null
          puntos_clave: Json | null
          resumen_corto: string | null
          resumen_detallado: string | null
          sentimiento_general: string | null
          tokens_usados: number | null
        }
        Insert: {
          action_items?: Json | null
          costo_estimado?: number | null
          creado_en?: string | null
          grabacion_id: string
          id?: string
          modelo_usado?: string | null
          participacion_speakers?: Json | null
          puntos_clave?: Json | null
          resumen_corto?: string | null
          resumen_detallado?: string | null
          sentimiento_general?: string | null
          tokens_usados?: number | null
        }
        Update: {
          action_items?: Json | null
          costo_estimado?: number | null
          creado_en?: string | null
          grabacion_id?: string
          id?: string
          modelo_usado?: string | null
          participacion_speakers?: Json | null
          puntos_clave?: Json | null
          resumen_corto?: string | null
          resumen_detallado?: string | null
          sentimiento_general?: string | null
          tokens_usados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resumenes_ai_grabacion_id_fkey"
            columns: ["grabacion_id"]
            isOneToOne: false
            referencedRelation: "grabaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      reunion_participantes: {
        Row: {
          estado: string | null
          id: string
          notificado: boolean | null
          respondido_en: string | null
          reunion_id: string
          usuario_id: string
        }
        Insert: {
          estado?: string | null
          id?: string
          notificado?: boolean | null
          respondido_en?: string | null
          reunion_id: string
          usuario_id: string
        }
        Update: {
          estado?: string | null
          id?: string
          notificado?: boolean | null
          respondido_en?: string | null
          reunion_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reunion_participantes_reunion_id_fkey"
            columns: ["reunion_id"]
            isOneToOne: false
            referencedRelation: "reuniones_programadas"
            referencedColumns: ["id"]
          },
        ]
      }
      reuniones_programadas: {
        Row: {
          creado_en: string | null
          creado_por: string
          descripcion: string | null
          es_recurrente: boolean | null
          espacio_id: string
          fecha_fin: string
          fecha_inicio: string
          google_event_id: string | null
          id: string
          meeting_link: string | null
          recordatorio_minutos: number | null
          recurrencia_regla: string | null
          sala_id: string | null
          tipo_reunion: string | null
          titulo: string
        }
        Insert: {
          creado_en?: string | null
          creado_por: string
          descripcion?: string | null
          es_recurrente?: boolean | null
          espacio_id: string
          fecha_fin: string
          fecha_inicio: string
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          recordatorio_minutos?: number | null
          recurrencia_regla?: string | null
          sala_id?: string | null
          tipo_reunion?: string | null
          titulo: string
        }
        Update: {
          creado_en?: string | null
          creado_por?: string
          descripcion?: string | null
          es_recurrente?: boolean | null
          espacio_id?: string
          fecha_fin?: string
          fecha_inicio?: string
          google_event_id?: string | null
          id?: string
          meeting_link?: string | null
          recordatorio_minutos?: number | null
          recurrencia_regla?: string | null
          sala_id?: string | null
          tipo_reunion?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "reuniones_programadas_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniones_programadas_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_reunion: {
        Row: {
          activa: boolean | null
          codigo_acceso: string | null
          configuracion: Json | null
          creado_en: string | null
          creador_id: string
          descripcion: string | null
          es_privada: boolean | null
          espacio_id: string
          expira_en: string | null
          finalizado_en: string | null
          id: string
          iniciado_en: string | null
          livekit_room_name: string | null
          max_participantes: number | null
          nombre: string
          password_hash: string | null
          tipo: string | null
        }
        Insert: {
          activa?: boolean | null
          codigo_acceso?: string | null
          configuracion?: Json | null
          creado_en?: string | null
          creador_id: string
          descripcion?: string | null
          es_privada?: boolean | null
          espacio_id: string
          expira_en?: string | null
          finalizado_en?: string | null
          id?: string
          iniciado_en?: string | null
          livekit_room_name?: string | null
          max_participantes?: number | null
          nombre: string
          password_hash?: string | null
          tipo?: string | null
        }
        Update: {
          activa?: boolean | null
          codigo_acceso?: string | null
          configuracion?: Json | null
          creado_en?: string | null
          creador_id?: string
          descripcion?: string | null
          es_privada?: boolean | null
          espacio_id?: string
          expira_en?: string | null
          finalizado_en?: string | null
          id?: string
          iniciado_en?: string | null
          livekit_room_name?: string | null
          max_participantes?: number | null
          nombre?: string
          password_hash?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salas_reunion_creador_id_fkey"
            columns: ["creador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salas_reunion_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_juego: {
        Row: {
          configuracion: Json | null
          created_at: string | null
          espacio_id: string | null
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          host_id: string
          id: string
          max_jugadores: number | null
          tiempo_limite: number | null
          tipo_juego: string
          updated_at: string | null
        }
        Insert: {
          configuracion?: Json | null
          created_at?: string | null
          espacio_id?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          host_id: string
          id?: string
          max_jugadores?: number | null
          tiempo_limite?: number | null
          tipo_juego: string
          updated_at?: string | null
        }
        Update: {
          configuracion?: Json | null
          created_at?: string | null
          espacio_id?: string | null
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          host_id?: string
          id?: string
          max_jugadores?: number | null
          tiempo_limite?: number | null
          tipo_juego?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sesiones_showroom: {
        Row: {
          acciones_log: Json | null
          avatar_temporal: Json | null
          creado_en: string | null
          duracion_segundos: number | null
          email_visitante: string | null
          espacio_id: string | null
          fin_en: string | null
          id: string
          inicio_en: string | null
          invitacion_id: string | null
          nombre_visitante: string
          sala_id: string | null
        }
        Insert: {
          acciones_log?: Json | null
          avatar_temporal?: Json | null
          creado_en?: string | null
          duracion_segundos?: number | null
          email_visitante?: string | null
          espacio_id?: string | null
          fin_en?: string | null
          id?: string
          inicio_en?: string | null
          invitacion_id?: string | null
          nombre_visitante: string
          sala_id?: string | null
        }
        Update: {
          acciones_log?: Json | null
          avatar_temporal?: Json | null
          creado_en?: string | null
          duracion_segundos?: number | null
          email_visitante?: string | null
          espacio_id?: string | null
          fin_en?: string | null
          id?: string
          inicio_en?: string | null
          invitacion_id?: string | null
          nombre_visitante?: string
          sala_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_showroom_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_showroom_invitacion_id_fkey"
            columns: ["invitacion_id"]
            isOneToOne: false
            referencedRelation: "invitaciones_reunion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_showroom_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas_reunion"
            referencedColumns: ["id"]
          },
        ]
      }
      terrenos_marketplace: {
        Row: {
          alto: number
          ancho: number
          color_preview: string | null
          comprado_por_empresa: string | null
          created_at: string
          descripcion: string | null
          destacado: boolean | null
          espacio_id: string
          estado: string
          features: Json | null
          id: string
          moneda: string
          nombre: string
          orden_visual: number | null
          posicion_x: number
          posicion_y: number
          precio_anual: number | null
          precio_mensual: number | null
          reservado_hasta: string | null
          reservado_por: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          alto?: number
          ancho?: number
          color_preview?: string | null
          comprado_por_empresa?: string | null
          created_at?: string
          descripcion?: string | null
          destacado?: boolean | null
          espacio_id: string
          estado?: string
          features?: Json | null
          id?: string
          moneda?: string
          nombre?: string
          orden_visual?: number | null
          posicion_x?: number
          posicion_y?: number
          precio_anual?: number | null
          precio_mensual?: number | null
          reservado_hasta?: string | null
          reservado_por?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          alto?: number
          ancho?: number
          color_preview?: string | null
          comprado_por_empresa?: string | null
          created_at?: string
          descripcion?: string | null
          destacado?: boolean | null
          espacio_id?: string
          estado?: string
          features?: Json | null
          id?: string
          moneda?: string
          nombre?: string
          orden_visual?: number | null
          posicion_x?: number
          posicion_y?: number
          precio_anual?: number | null
          precio_mensual?: number | null
          reservado_hasta?: string | null
          reservado_por?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terrenos_marketplace_comprado_por_empresa_fkey"
            columns: ["comprado_por_empresa"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terrenos_marketplace_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripciones: {
        Row: {
          confianza: number | null
          creado_en: string | null
          fin_segundos: number
          grabacion_id: string
          id: string
          idioma: string | null
          inicio_segundos: number
          speaker_id: string | null
          speaker_nombre: string | null
          texto: string
        }
        Insert: {
          confianza?: number | null
          creado_en?: string | null
          fin_segundos: number
          grabacion_id: string
          id?: string
          idioma?: string | null
          inicio_segundos: number
          speaker_id?: string | null
          speaker_nombre?: string | null
          texto: string
        }
        Update: {
          confianza?: number | null
          creado_en?: string | null
          fin_segundos?: number
          grabacion_id?: string
          id?: string
          idioma?: string | null
          inicio_segundos?: number
          speaker_id?: string | null
          speaker_nombre?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripciones_grabacion_id_fkey"
            columns: ["grabacion_id"]
            isOneToOne: false
            referencedRelation: "grabaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          apellido: string | null
          avatar_3d_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          estado_actualizado_en: string | null
          estado_disponibilidad: string | null
          estado_personalizado: string | null
          id: string
          last_sign_in_at: string | null
          nombre: string
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          avatar_3d_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          estado_actualizado_en?: string | null
          estado_disponibilidad?: string | null
          estado_personalizado?: string | null
          id: string
          last_sign_in_at?: string | null
          nombre: string
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          avatar_3d_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          estado_actualizado_en?: string | null
          estado_disponibilidad?: string | null
          estado_personalizado?: string | null
          id?: string
          last_sign_in_at?: string | null
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_avatar_3d_id_fkey"
            columns: ["avatar_3d_id"]
            isOneToOne: false
            referencedRelation: "avatares_3d"
            referencedColumns: ["id"]
          },
        ]
      }
      wp_desarrollo_programacion: {
        Row: {
          actualizado_en: string | null
          componentes_afectados: string[] | null
          creado_en: string | null
          dependencias: string[] | null
          descripcion: string | null
          estado: string
          fase: string | null
          fecha_completado_real: string | null
          fecha_creacion: string | null
          fecha_fin_estimada: string | null
          fecha_inicio_estimada: string | null
          id: string
          notas: string | null
          prioridad: number
          responsable: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          actualizado_en?: string | null
          componentes_afectados?: string[] | null
          creado_en?: string | null
          dependencias?: string[] | null
          descripcion?: string | null
          estado?: string
          fase?: string | null
          fecha_completado_real?: string | null
          fecha_creacion?: string | null
          fecha_fin_estimada?: string | null
          fecha_inicio_estimada?: string | null
          id?: string
          notas?: string | null
          prioridad?: number
          responsable?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          actualizado_en?: string | null
          componentes_afectados?: string[] | null
          creado_en?: string | null
          dependencias?: string[] | null
          descripcion?: string | null
          estado?: string
          fase?: string | null
          fecha_completado_real?: string | null
          fecha_creacion?: string | null
          fecha_fin_estimada?: string | null
          fecha_inicio_estimada?: string | null
          id?: string
          notas?: string | null
          prioridad?: number
          responsable?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      zonas_empresa: {
        Row: {
          actualizado_en: string
          alto: number
          ancho: number
          color: string | null
          creado_en: string
          empresa_id: string | null
          es_comun: boolean | null
          espacio_id: string
          estado: string
          id: string
          modelo_url: string | null
          nombre_zona: string | null
          posicion_x: number
          posicion_y: number
          spawn_x: number | null
          spawn_y: number | null
        }
        Insert: {
          actualizado_en?: string
          alto?: number
          ancho?: number
          color?: string | null
          creado_en?: string
          empresa_id?: string | null
          es_comun?: boolean | null
          espacio_id: string
          estado?: string
          id?: string
          modelo_url?: string | null
          nombre_zona?: string | null
          posicion_x?: number
          posicion_y?: number
          spawn_x?: number | null
          spawn_y?: number | null
        }
        Update: {
          actualizado_en?: string
          alto?: number
          ancho?: number
          color?: string | null
          creado_en?: string
          empresa_id?: string | null
          es_comun?: boolean | null
          espacio_id?: string
          estado?: string
          id?: string
          modelo_url?: string | null
          nombre_zona?: string | null
          posicion_x?: number
          posicion_y?: number
          spawn_x?: number | null
          spawn_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zonas_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zonas_empresa_espacio_id_fkey"
            columns: ["espacio_id"]
            isOneToOne: false
            referencedRelation: "espacios_trabajo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceptar_invitacion: { Args: { p_token: string }; Returns: Json }
      agregar_metricas_empresa: { Args: { p_fecha?: string }; Returns: number }
      check_is_admin: {
        Args: { p_espacio_id: string; p_user_id: string }
        Returns: boolean
      }
      crear_espacio_trabajo: {
        Args: { p_descripcion?: string; p_nombre: string }
        Returns: string
      }
      crear_grupo_chat: {
        Args: {
          p_descripcion?: string
          p_espacio_id: string
          p_icono?: string
          p_nombre: string
          p_tipo?: string
        }
        Returns: string
      }
      delete_meeting: { Args: { p_meeting_id: string }; Returns: Json }
      enviar_invitacion: {
        Args: {
          p_cargo?: string
          p_departamento_id?: string
          p_email: string
          p_espacio_id: string
          p_rol?: string
        }
        Returns: string
      }
      es_admin_de_espacio: { Args: { p_espacio_id: string }; Returns: boolean }
      es_admin_espacio: { Args: { p_espacio_id: string }; Returns: boolean }
      es_admin_misma_empresa: {
        Args: { p_empresa_id: string; p_espacio_id: string }
        Returns: boolean
      }
      es_grupo_publico: { Args: { p_grupo_id: string }; Returns: boolean }
      es_miembro_de_espacio: {
        Args: { p_espacio_id: string }
        Returns: boolean
      }
      es_miembro_espacio: { Args: { p_espacio_id: string }; Returns: boolean }
      es_miembro_grupo: { Args: { p_grupo_id: string }; Returns: boolean }
      es_miembro_misma_empresa: {
        Args: { p_empresa_id: string; p_espacio_id: string }
        Returns: boolean
      }
      generar_codigo_sala: { Args: never; Returns: string }
      generar_token_invitacion: { Args: never; Returns: string }
      get_mis_espacios: { Args: { p_user_id: string }; Returns: string[] }
      get_user_espacios: { Args: never; Returns: string[] }
      hash_token: { Args: { raw_token: string }; Returns: string }
      heartbeat_participante: {
        Args: { p_sala_id: string; p_usuario_id: string }
        Returns: undefined
      }
      limpiar_salas_zombie: {
        Args: { horas_inactividad?: number }
        Returns: {
          motivo: string
          sala_id: string
          sala_nombre: string
        }[]
      }
      marcar_participantes_zombie: {
        Args: { minutos_inactividad?: number }
        Returns: {
          minutos_sin_actividad: number
          participante_id: string
          sala_id: string
          usuario_id: string
        }[]
      }
      obtener_info_invitacion: {
        Args: { p_token: string }
        Returns: {
          email: string
          espacio_id: string
          espacio_nombre: string
          espacio_slug: string
          expira_en: string
          invitador_nombre: string
          rol: string
          usada: boolean
        }[]
      }
      puede_ver_analisis: { Args: { p_grabacion_id: string }; Returns: boolean }
      puede_ver_transcripcion: {
        Args: { p_grabacion_id: string }
        Returns: boolean
      }
      responder_consentimiento_grabacion: {
        Args: { p_acepta: boolean; p_grabacion_id: string }
        Returns: Json
      }
      solicitar_consentimiento_grabacion: {
        Args: {
          p_evaluado_id: string
          p_grabacion_id: string
          p_tipo_grabacion: string
        }
        Returns: Json
      }
    }
    Enums: {
      cargo_laboral:
        | "ceo"
        | "coo"
        | "director_rrhh"
        | "coordinador_rrhh"
        | "reclutador"
        | "director_comercial"
        | "coordinador_ventas"
        | "asesor_comercial"
        | "manager_equipo"
        | "team_lead"
        | "product_owner"
        | "scrum_master"
        | "colaborador"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cargo_laboral: [
        "ceo",
        "coo",
        "director_rrhh",
        "coordinador_rrhh",
        "reclutador",
        "director_comercial",
        "coordinador_ventas",
        "asesor_comercial",
        "manager_equipo",
        "team_lead",
        "product_owner",
        "scrum_master",
        "colaborador",
        "otro",
      ],
    },
  },
} as const
