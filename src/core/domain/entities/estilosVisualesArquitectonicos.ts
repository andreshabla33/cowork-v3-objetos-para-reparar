export type EstiloVisualArquitectonico = 'corporativo' | 'industrial' | 'minimalista';

export interface PerfilVisualArquitectonico {
  estilo: EstiloVisualArquitectonico;
  composicion: {
    mampara: {
      montante_relativo: number;
      zocalo_relativo: number;
      cabezal_relativo: number;
      ancho_panel_minimo: number;
    };
    ventana: {
      montante_relativo: number;
      zocalo_relativo: number;
      cabezal_relativo: number;
      ancho_panel_minimo: number;
    };
  };
  materiales: {
    color_metal: string;
    color_vidrio: string;
    opacidad_vidrio_mampara: number;
    opacidad_vidrio_ventana: number;
    rugosidad_vidrio_mampara: number;
    rugosidad_vidrio_ventana: number;
  };
  render: {
    grosor_perfil_mampara_max: number;
    grosor_perfil_ventana_min: number;
    grosor_perfil_ventana_max: number;
    mostrar_remates_division: boolean;
    mostrar_montantes_laterales_mampara: boolean;
    mostrar_bandas_perimetrales: boolean;
    espesor_remate_division: number;
    espesor_cabezal_division: number;
    espesor_montante_lateral: number;
    grosor_banda_perimetral_inferior: number;
    grosor_banda_perimetral_superior: number;
  };
}

const PERFILES_VISUALES_ARQUITECTONICOS: Record<EstiloVisualArquitectonico, PerfilVisualArquitectonico> = {
  corporativo: {
    estilo: 'corporativo',
    composicion: {
      mampara: {
        montante_relativo: 0.022,
        zocalo_relativo: 0.28,
        cabezal_relativo: 0.06,
        ancho_panel_minimo: 0.74,
      },
      ventana: {
        montante_relativo: 0.035,
        zocalo_relativo: 0.36,
        cabezal_relativo: 0.08,
        ancho_panel_minimo: 0.84,
      },
    },
    materiales: {
      color_metal: '#6b7280',
      color_vidrio: '#d6e7f1',
      opacidad_vidrio_mampara: 0.58,
      opacidad_vidrio_ventana: 0.5,
      rugosidad_vidrio_mampara: 0.08,
      rugosidad_vidrio_ventana: 0.06,
    },
    render: {
      grosor_perfil_mampara_max: 0.045,
      grosor_perfil_ventana_min: 0.05,
      grosor_perfil_ventana_max: 0.07,
      mostrar_remates_division: true,
      mostrar_montantes_laterales_mampara: true,
      mostrar_bandas_perimetrales: true,
      espesor_remate_division: 0.035,
      espesor_cabezal_division: 0.03,
      espesor_montante_lateral: 0.028,
      grosor_banda_perimetral_inferior: 0.055,
      grosor_banda_perimetral_superior: 0.045,
    },
  },
  industrial: {
    estilo: 'industrial',
    composicion: {
      mampara: {
        montante_relativo: 0.03,
        zocalo_relativo: 0.33,
        cabezal_relativo: 0.08,
        ancho_panel_minimo: 0.7,
      },
      ventana: {
        montante_relativo: 0.042,
        zocalo_relativo: 0.4,
        cabezal_relativo: 0.1,
        ancho_panel_minimo: 0.8,
      },
    },
    materiales: {
      color_metal: '#2f343c',
      color_vidrio: '#c9d6de',
      opacidad_vidrio_mampara: 0.52,
      opacidad_vidrio_ventana: 0.45,
      rugosidad_vidrio_mampara: 0.12,
      rugosidad_vidrio_ventana: 0.1,
    },
    render: {
      grosor_perfil_mampara_max: 0.058,
      grosor_perfil_ventana_min: 0.06,
      grosor_perfil_ventana_max: 0.085,
      mostrar_remates_division: true,
      mostrar_montantes_laterales_mampara: true,
      mostrar_bandas_perimetrales: true,
      espesor_remate_division: 0.042,
      espesor_cabezal_division: 0.036,
      espesor_montante_lateral: 0.034,
      grosor_banda_perimetral_inferior: 0.07,
      grosor_banda_perimetral_superior: 0.055,
    },
  },
  minimalista: {
    estilo: 'minimalista',
    composicion: {
      mampara: {
        montante_relativo: 0.016,
        zocalo_relativo: 0.22,
        cabezal_relativo: 0.045,
        ancho_panel_minimo: 0.82,
      },
      ventana: {
        montante_relativo: 0.026,
        zocalo_relativo: 0.3,
        cabezal_relativo: 0.06,
        ancho_panel_minimo: 0.92,
      },
    },
    materiales: {
      color_metal: '#9aa4af',
      color_vidrio: '#deedf5',
      opacidad_vidrio_mampara: 0.46,
      opacidad_vidrio_ventana: 0.4,
      rugosidad_vidrio_mampara: 0.04,
      rugosidad_vidrio_ventana: 0.03,
    },
    render: {
      grosor_perfil_mampara_max: 0.03,
      grosor_perfil_ventana_min: 0.038,
      grosor_perfil_ventana_max: 0.055,
      mostrar_remates_division: true,
      mostrar_montantes_laterales_mampara: false,
      mostrar_bandas_perimetrales: false,
      espesor_remate_division: 0.024,
      espesor_cabezal_division: 0.022,
      espesor_montante_lateral: 0.02,
      grosor_banda_perimetral_inferior: 0.038,
      grosor_banda_perimetral_superior: 0.032,
    },
  },
};

export const ESTILOS_VISUALES_ARQUITECTONICOS = Object.keys(PERFILES_VISUALES_ARQUITECTONICOS) as EstiloVisualArquitectonico[];

export const esEstiloVisualArquitectonicoValido = (valor: unknown): valor is EstiloVisualArquitectonico => {
  return typeof valor === 'string' && ESTILOS_VISUALES_ARQUITECTONICOS.includes(valor as EstiloVisualArquitectonico);
};

export const normalizarEstiloVisualArquitectonico = (
  valor: unknown,
  fallback: EstiloVisualArquitectonico = 'corporativo',
): EstiloVisualArquitectonico => {
  if (esEstiloVisualArquitectonicoValido(valor)) return valor;
  if (typeof valor === 'string') {
    const normalizado = valor.trim().toLowerCase();
    if (esEstiloVisualArquitectonicoValido(normalizado)) return normalizado;
  }
  return fallback;
};

export const resolverPerfilVisualArquitectonico = (
  estilo: unknown,
  fallback: EstiloVisualArquitectonico = 'corporativo',
): PerfilVisualArquitectonico => {
  const estiloNormalizado = normalizarEstiloVisualArquitectonico(estilo, fallback);
  return PERFILES_VISUALES_ARQUITECTONICOS[estiloNormalizado];
};
