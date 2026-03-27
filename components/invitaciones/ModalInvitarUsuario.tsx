import React, { useState } from 'react';
import { Mail, User, Shield, Users, Crown, X, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface Props {
  espacioId: string;
  espacioNombre: string;
  abierto: boolean;
  onCerrar: () => void;
  onExito?: () => void;
}

const ROLES = [
  { id: 'miembro', label: 'Miembro', desc: 'Acceso estándar al espacio', icon: Users, color: 'violet' },
  { id: 'moderador', label: 'Moderador', desc: 'Puede moderar chats y usuarios', icon: Shield, color: 'cyan' },
  { id: 'admin', label: 'Administrador', desc: 'Control total del espacio', icon: Crown, color: 'amber' },
];

export const ModalInvitarUsuario: React.FC<Props> = ({ 
  espacioId, 
  espacioNombre, 
  abierto, 
  onCerrar,
  onExito 
}) => {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('miembro');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  const handleEnviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setExito(false);

    if (!email || !email.includes('@')) {
      setError('Ingresa un correo válido');
      return;
    }

    setEnviando(true);

    try {
      // Obtener token fresco directamente del cliente Supabase
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.');
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/enviar-invitacion`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          espacio_id: espacioId,
          rol,
          nombre_invitado: nombre.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ');
        throw new Error(msg || `Error ${response.status}`);
      }
      if (data?.error) {
        const msg = [data.error, data.detail].filter(Boolean).join(' — ');
        throw new Error(msg);
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

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Tiempo de espera agotado. Intenta de nuevo.');
      } else {
        setError(err.message || 'Error al enviar la invitación');
      }
    } finally {
      setEnviando(false);
    }
  };

  const rolActual = ROLES.find(r => r.id === rol);

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
            {ROLES.map(r => {
              const Icon = r.icon;
              const isSelected = rol === r.id;
              const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
                violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/50', text: 'text-violet-400', glow: 'shadow-violet-500/20' },
                cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
                amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/50', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
              };
              const c = colorMap[r.color];

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
                  <div className={`p-2.5 lg:p-2 rounded-xl lg:rounded-lg transition-colors ${
                    isSelected ? c.bg : 'bg-white/[0.03]'
                  }`}>
                    <Icon className={`w-5 h-5 transition-colors ${
                      isSelected ? c.text : 'text-zinc-500'
                    }`} />
                  </div>
                  <div className="text-center">
                    <p className={`text-[10px] lg:text-[9px] font-black uppercase tracking-wider transition-colors ${
                      isSelected ? 'text-white' : 'text-zinc-400'
                    }`}>
                      {r.label}
                    </p>
                    <p className="text-[8px] lg:text-[7px] text-zinc-600 mt-0.5 leading-tight">
                      {r.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                      r.color === 'violet' ? 'bg-violet-400' : r.color === 'cyan' ? 'bg-cyan-400' : 'bg-amber-400'
                    }`} />
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

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            fullWidth
            onClick={onCerrar}
          >
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
