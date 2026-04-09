/**
 * @module components/invitaciones/ModalInvitarUsuario
 * UI para crear y enviar invitaciones a un espacio de trabajo.
 *
 * Clean Architecture (REMEDIATION-007b — 2026-03-30, DI-001 — 2026-04-09):
 *  - Eliminado import directo de `supabase`, `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
 *  - Eliminado singleton a nivel módulo; repositorio inyectado desde DIProvider.
 *  - Toda la lógica de negocio delegada a EnviarInvitacionUseCase.
 *  - El componente solo gestiona estado UI (email, nombre, rol, errores visuales).
 */
import React, { useState } from 'react';
import { Mail, User, Shield, Users, Crown, X, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { EnviarInvitacionUseCase } from '../../src/core/application/usecases/EnviarInvitacionUseCase';
// DI: Repository port resolved from React Context, not module-level singleton
import { useDIUseCase } from '../../src/core/infrastructure/di/DIProvider';
import type { RolInvitacion } from '../../src/core/domain/ports/IEnviarInvitacionRepository';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  espacioId: string;
  espacioNombre: string;
  abierto: boolean;
  onCerrar: () => void;
  onExito?: () => void;
}

interface RolConfig {
  id: RolInvitacion;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: 'violet' | 'cyan' | 'amber';
}

// ─── Configuración de roles ───────────────────────────────────────────────────

const ROLES: RolConfig[] = [
  { id: 'miembro',    label: 'Miembro',         desc: 'Acceso estándar al espacio',    icon: Users, color: 'violet' },
  { id: 'moderador',  label: 'Moderador',        desc: 'Puede moderar chats y usuarios', icon: Shield, color: 'cyan'   },
  { id: 'admin',      label: 'Administrador',    desc: 'Control total del espacio',      icon: Crown, color: 'amber'  },
];

const COLOR_MAP: Record<'violet' | 'cyan' | 'amber', { bg: string; border: string; text: string; glow: string; dot: string }> = {
  violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/50', text: 'text-violet-400', glow: 'shadow-violet-500/20', dot: 'bg-violet-400' },
  cyan:   { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/50',   text: 'text-cyan-400',   glow: 'shadow-cyan-500/20',   dot: 'bg-cyan-400'   },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/50',  text: 'text-amber-400',  glow: 'shadow-amber-500/20',  dot: 'bg-amber-400'  },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export const ModalInvitarUsuario: React.FC<Props> = ({
  espacioId,
  espacioNombre,
  abierto,
  onCerrar,
  onExito,
}) => {
  // DI: Use Case resuelto desde el container inyectado por DIProvider
  const enviarUC = useDIUseCase((c) => new EnviarInvitacionUseCase(c.enviarInvitacion));

  const [email, setEmail]     = useState('');
  const [nombre, setNombre]   = useState('');
  const [rol, setRol]         = useState<RolInvitacion>('miembro');
  const [enviando, setEnviando] = useState(false);
  const [error, setError]     = useState('');
  const [exito, setExito]     = useState(false);

  const handleEnviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setExito(false);
    setEnviando(true);

    try {
      const result = await enviarUC.ejecutar({
        email,
        espacioId,
        rol,
        nombreInvitado: nombre || undefined,
      });

      if (!result.exito) {
        setError(result.mensaje ?? 'Error al enviar la invitación.');
        return;
      }

      setExito(true);
      setEmail('');
      setNombre('');
      setRol('miembro');

      setTimeout(() => {
        onExito?.();
        onCerrar();
        setExito(false);
      }, 2000);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      size="md"
      title="Invitar al equipo"
      subtitle={espacioNombre}
    >
      <form onSubmit={handleEnviar} className="p-6 lg:p-5 space-y-5 lg:space-y-4">

        {/* Email */}
        <Input
          label="Correo electrónico *"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          icon={<Mail className="w-4 h-4 text-zinc-400" />}
          required
        />

        {/* Nombre */}
        <Input
          label="Nombre (opcional)"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Juan Pérez"
          icon={<User className="w-4 h-4 text-zinc-400" />}
        />

        {/* Rol de acceso */}
        <div>
          <label className="block text-[10px] lg:text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-3 lg:mb-2">
            Rol de acceso
          </label>
          <div className="grid grid-cols-3 gap-2 lg:gap-1.5">
            {ROLES.map((r) => {
              const Icon = r.icon;
              const isSelected = rol === r.id;
              const c = COLOR_MAP[r.color];

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRol(r.id)}
                  className={`relative flex flex-col items-center gap-2 lg:gap-1.5 p-4 lg:p-3 rounded-xl lg:rounded-lg border transition-all duration-200 ${
                    isSelected
                      ? `${c.bg} ${c.border} shadow-lg ${c.glow}`
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]'
                  }`}
                >
                  <div className={`p-2.5 lg:p-2 rounded-xl lg:rounded-lg transition-colors ${isSelected ? c.bg : 'bg-white/[0.03]'}`}>
                    <Icon className={`w-5 h-5 transition-colors ${isSelected ? c.text : 'text-zinc-500'}`} />
                  </div>
                  <div className="text-center">
                    <p className={`text-[10px] lg:text-[9px] font-black uppercase tracking-wider transition-colors ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                      {r.label}
                    </p>
                    <p className="text-[8px] lg:text-[7px] text-zinc-600 mt-0.5 leading-tight">
                      {r.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${c.dot}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
        {exito && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400">Invitación enviada correctamente</p>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" size="lg" fullWidth onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={enviando}
            disabled={!email}
            icon={<Send className="w-4 h-4" />}
          >
            Enviar
          </Button>
        </div>

      </form>
    </Modal>
  );
};
