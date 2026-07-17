import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Copy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { apiHelpers } from '../../services/api';

interface SetupData {
  otpauthUri: string;
  secret: string;
}

function normaliseCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

function CodeInput({
  value,
  onChange,
  id,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-dark-200">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(normaliseCode(event.target.value))}
        placeholder="000000"
        className="min-h-11 w-full max-w-xs rounded-[3px] border border-white/10 bg-dark-900 px-4 py-3 text-center font-console-mono text-xl tracking-[.35em] text-dark-50 placeholder:text-dark-500 focus:outline-hidden focus:ring-2 focus:ring-primary-400"
      />
    </div>
  );
}

function DisableConfirmDialog({
  code,
  submitting,
  onCancel,
  onConfirm,
}: {
  code: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-[5px] border border-white/10 bg-dark-800 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disable-2fa-title"
        aria-describedby="disable-2fa-description"
      >
        <h2 id="disable-2fa-title" className="text-[16px] font-semibold text-dark-50 tracking-tight mb-3">
          Desactivar autenticação em dois passos?
        </h2>
        <p id="disable-2fa-description" className="text-[13px] leading-relaxed text-dark-300 mb-5">
          A senha voltará a ser o único factor de acesso. Confirme com o código atual da aplicação autenticadora.
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={submitting}
            className="min-h-11 flex-1 rounded-[2px] border border-white/10 bg-dark-900 px-4 py-2.5 text-[13px] text-dark-200 transition-colors hover:border-primary-500 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !/^\d{6}$/.test(code)}
            className="min-h-11 flex-1 rounded-[2px] bg-red-500 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-red-600 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
          >
            {submitting ? 'A desactivar...' : 'Desactivar 2FA'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  const { user, logout, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(Boolean(user?.twoFactorEnabled));
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [activateCode, setActivateCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const disableTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setEnabled(Boolean(user?.twoFactorEnabled));
  }, [user?.twoFactorEnabled]);

  const startSetup = async () => {
    setSubmitting(true);
    setCopyStatus('');
    try {
      const response = await apiHelpers.post('/admin/2fa/setup', {});
      setSetupData(response.data);
      setActivateCode('');
    } catch {
      // O interceptor é a fonte única do toast de erro.
    } finally {
      setSubmitting(false);
    }
  };

  const activate = async () => {
    if (!/^\d{6}$/.test(activateCode)) return;
    setSubmitting(true);
    try {
      await apiHelpers.post('/admin/2fa/activate', { token: activateCode });
      toast.success('2FA activado. Volte a iniciar sessão para concluir.');
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // O interceptor é a fonte única do toast de erro.
    } finally {
      setSubmitting(false);
    }
  };

  const disable = async () => {
    setSubmitting(true);
    try {
      await apiHelpers.post('/admin/2fa/disable', { token: disableCode });
      setEnabled(false);
      setSetupData(null);
      setDisableCode('');
      setShowDisableConfirm(false);
      await refreshAuth();
      toast.success('2FA desactivado.');
    } catch {
      // O interceptor é a fonte única do toast de erro; mantém o diálogo para retry.
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopyStatus('Chave copiada.');
    } catch {
      setCopyStatus('Não foi possível copiar. Selecione a chave manualmente.');
    }
  };

  const closeDisableDialog = () => {
    setShowDisableConfirm(false);
    requestAnimationFrame(() => disableTriggerRef.current?.focus());
  };

  return (
    <section aria-labelledby="security-title">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-[4px] bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shrink-0">
          <ShieldCheck aria-hidden="true" className="w-5 h-5 text-primary-300" />
        </div>
        <div>
          <h1 id="security-title" className="text-xl font-semibold tracking-tight text-dark-50">Segurança</h1>
          <p className="text-[13px] text-dark-400 mt-1">Proteja o acesso cross-tenant com um código temporário TOTP.</p>
        </div>
      </div>

      <div className="bg-dark-900/60 border border-white/10 rounded-[4px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            {enabled
              ? <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-emerald-400" />
              : <ShieldOff aria-hidden="true" className="w-5 h-5 text-amber-400" />}
            <div>
              <h2 className="text-[15px] font-semibold text-dark-50">Aplicação autenticadora</h2>
              <p className="text-[12px] text-dark-400 mt-0.5">Estado: {enabled ? 'activa' : 'não configurada'}</p>
            </div>
          </div>
          {!enabled && !setupData && (
            <button
              type="button"
              onClick={startSetup}
              disabled={submitting}
              className="min-h-11 rounded-[2px] bg-gradient-to-r from-primary-500 to-purple-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:from-primary-600 hover:to-purple-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50"
            >
              {submitting ? 'A preparar...' : 'Activar 2FA'}
            </button>
          )}
        </div>

        {!enabled && !setupData && (
          <p className="max-w-2xl text-[13px] leading-relaxed text-dark-300">
            Use Google Authenticator, 1Password, Authy ou outra aplicação compatível. Depois de activar, será necessário um código a cada novo login de super-admin.
          </p>
        )}

        {!enabled && setupData && (
          <div className="grid lg:grid-cols-[auto_1fr] gap-6 pt-2">
            <div className="bg-white p-4 rounded-[4px] w-fit">
              <QRCodeSVG value={setupData.otpauthUri} size={184} level="M" title="QR code para configurar 2FA" />
            </div>
            <div className="space-y-5 min-w-0">
              <div>
                <h3 className="text-[14px] font-semibold text-dark-50 mb-1">1. Digitalize o QR code</h3>
                <p className="text-[12.5px] text-dark-400">Se não conseguir digitalizar, introduza manualmente esta chave:</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 break-all bg-dark-800 border border-white/10 px-3 py-2 rounded-[2px] font-console-mono text-[12px] text-dark-200">
                    {setupData.secret}
                  </code>
                  <button type="button" onClick={copySecret} aria-label="Copiar chave 2FA" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[2px] border border-white/10 p-2.5 text-dark-300 transition-colors hover:border-primary-500 hover:text-dark-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400">
                    <Copy aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
                <p aria-live="polite" className="mt-2 min-h-5 text-[12px] text-dark-300">{copyStatus}</p>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-dark-50 mb-2">2. Confirme o código</h3>
                <CodeInput id="activate-2fa-code" label="Código de 6 dígitos" value={activateCode} onChange={setActivateCode} />
                <button
                  type="button"
                  onClick={activate}
                  disabled={submitting || !/^\d{6}$/.test(activateCode)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[2px] bg-gradient-to-r from-primary-500 to-purple-600 px-4 py-2.5 text-[13px] font-medium text-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50"
                >
                  <KeyRound aria-hidden="true" className="w-4 h-4" />
                  {submitting ? 'A confirmar...' : 'Confirmar e activar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {enabled && (
          <div className="pt-2 border-t border-white/10">
            <p className="text-[13px] text-dark-300 mb-3">Para desactivar, introduza primeiro um código atual.</p>
            <CodeInput id="disable-2fa-code" label="Código de 6 dígitos" value={disableCode} onChange={setDisableCode} />
            <button
              type="button"
              onClick={() => setShowDisableConfirm(true)}
              disabled={!/^\d{6}$/.test(disableCode)}
              ref={disableTriggerRef}
              className="mt-3 min-h-11 rounded-[2px] border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-300 transition-colors hover:bg-red-500/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50"
            >
              Desactivar 2FA
            </button>
          </div>
        )}
      </div>

      {showDisableConfirm && (
        <DisableConfirmDialog
          code={disableCode}
          submitting={submitting}
          onCancel={closeDisableDialog}
          onConfirm={disable}
        />
      )}
    </section>
  );
}
