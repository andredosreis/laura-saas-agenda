import { useState } from 'react';
import { toast } from 'react-toastify';
import { useAdminTenantWhatsApp } from '../../hooks/useAdminTenantWhatsApp';
import { ConsoleCard } from './ConsoleUI';
import { WhatsAppConnectionState } from '../../types/admin';

interface WhatsAppCardProps {
  tenantId: string;
  tenantNome: string;
}

// Estados da Evolution. Não reutiliza o STATUS_STYLES do ConsoleUI: aquele é o
// vocabulário do plano do tenant (trial/ativo/suspenso) e colidiria por acaso.
const STATE_STYLES: Record<WhatsAppConnectionState, { pill: string; dot: string; label: string }> = {
  open: { pill: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400', label: 'Ligado' },
  connecting: { pill: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', label: 'A ligar' },
  close: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Desligado' },
  unknown: { pill: 'bg-dark-600/40 text-dark-300', dot: 'bg-dark-400', label: 'Desconhecido' },
};

function ConnectionPill({ state }: { state: WhatsAppConnectionState }) {
  const s = STATE_STYLES[state] ?? STATE_STYLES.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[2px] text-[12.5px] font-semibold whitespace-nowrap ${s.pill}`}
    >
      <span className={`w-[7px] h-[7px] rounded-[1px] inline-block ${s.dot}`} />
      {s.label}
    </span>
  );
}

function LogoutConfirmDialog({
  tenantNome,
  submitting,
  onConfirm,
  onCancel,
}: {
  tenantNome: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md bg-dark-800 border border-white/10 rounded-[5px] shadow-2xl p-6">
        <h2 className="text-[16px] font-semibold text-dark-50 tracking-tight mb-3">
          Desligar sessão WhatsApp de {tenantNome}?
        </h2>
        <p className="text-dark-400 text-[13px] mb-5 leading-relaxed">
          A IA e os lembretes deste cliente deixam de conseguir enviar mensagens. Para voltar a ligar é preciso
          ler um QR code novo no telemóvel da clínica.
        </p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2.5 rounded-[2px] text-[13px] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-[2px] text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'A processar...' : 'Desligar sessão'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0">
      <span className="text-dark-400 text-[13px]">{label}</span>
      {value}
    </div>
  );
}

export function WhatsAppCard({ tenantId, tenantNome }: WhatsAppCardProps) {
  const { data, loading, error, submitting, qr, createInstance, fetchQr, clearQr, logout } =
    useAdminTenantWhatsApp(tenantId);
  const [instanceName, setInstanceName] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async () => {
    setFormError(null);
    try {
      const res = await createInstance(instanceName.trim() || undefined);
      toast.success(`Instância ${res.instanceName} criada. Leia o QR para ligar o WhatsApp.`);
      setInstanceName('');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setFormError(axErr?.response?.data?.error || 'Não foi possível criar a instância.');
    }
  };

  const handleQr = async () => {
    setFormError(null);
    try {
      await fetchQr();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setFormError(axErr?.response?.data?.error || 'Não foi possível obter o QR code.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Sessão WhatsApp terminada.');
      setConfirmLogout(false);
    } catch {
      // O interceptor de api.js já mostrou o toast; mantém o diálogo para retry.
    }
  };

  if (loading) {
    return (
      <ConsoleCard className="p-5 md:col-span-2">
        <div className="flex items-center gap-3 text-dark-400 text-[13px]">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
          A carregar integração WhatsApp...
        </div>
      </ConsoleCard>
    );
  }

  if (error || !data) {
    return (
      <ConsoleCard className="p-5 md:col-span-2">
        <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400 mb-3.5">WhatsApp</h3>
        <p className="text-red-300 text-[13px]">{error || 'Não foi possível carregar a integração WhatsApp.'}</p>
      </ConsoleCard>
    );
  }

  const temInstancia = Boolean(data.instanceName);

  return (
    <ConsoleCard className="p-5 md:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400">
          WhatsApp · Evolution
        </h3>
        {temInstancia && <ConnectionPill state={data.connectionState} />}
      </div>

      {/* Evolution inalcançável: o card continua a mostrar o que está guardado. */}
      {temInstancia && !data.evolutionReachable && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-[2px] px-3 py-2 text-[12.5px] text-amber-300">
          Evolution inacessível — o estado da ligação não pôde ser confirmado. Os dados abaixo são os últimos
          guardados.
        </div>
      )}

      {formError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-[2px] px-3 py-2 text-[12.5px] text-red-300">
          {formError}
        </div>
      )}

      {!temInstancia ? (
        <div>
          <p className="text-dark-400 text-[13px] mb-4 leading-relaxed">
            Este cliente ainda não tem instância WhatsApp. Criar uma instância regista-a na Evolution e configura
            o webhook — depois é só ler o QR code no telemóvel da clínica.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:items-start">
            <div className="flex-1">
              <label
                htmlFor="instanceName"
                className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5"
              >
                Nome da instância (opcional)
              </label>
              <input
                id="instanceName"
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="deriva do slug do tenant"
                maxLength={50}
                className="w-full font-console-mono bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 text-[13px] text-dark-50 placeholder:text-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
              />
              <p className="text-dark-500 text-[11.5px] mt-1">Apenas minúsculas, números e hífenes.</p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="sm:mt-[22px] bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2.5 rounded-[2px] text-[13px] font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {submitting ? 'A criar...' : 'Criar instância'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <Row
            label="Instância"
            value={<span className="font-console-mono text-[13px] text-dark-50">{data.instanceName}</span>}
          />
          <Row
            label="Número"
            value={
              <span className="font-console-mono text-[13px] text-dark-50">{data.numeroWhatsapp || '—'}</span>
            }
          />
          <Row
            label="Webhook"
            value={
              <span className={`text-[13px] font-medium ${data.webhookConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>
                {data.webhookConfigured ? 'Configurado' : 'Por configurar'}
              </span>
            }
          />

          {qr && (
            <div className="pt-3">
              <div className="bg-white/5 border border-white/10 rounded-[3px] p-4 flex flex-col items-center gap-3">
                {qr.qrBase64 ? (
                  <img
                    src={qr.qrBase64}
                    alt="QR code para ligar o WhatsApp"
                    className="w-[220px] h-[220px] max-w-full bg-white rounded-[2px] p-2"
                  />
                ) : (
                  <p className="text-dark-400 text-[13px]">A Evolution não devolveu imagem de QR.</p>
                )}
                {qr.pairingCode && (
                  <div className="text-center">
                    <div className="font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1">
                      Código de emparelhamento
                    </div>
                    <div className="font-console-mono text-[16px] font-semibold text-dark-50 tracking-[.15em]">
                      {qr.pairingCode}
                    </div>
                  </div>
                )}
                <p className="text-dark-500 text-[11.5px] text-center">
                  O QR expira ao fim de poucos segundos — se falhar, gere outro.
                </p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleQr}
                    disabled={submitting}
                    className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-3.5 py-2 rounded-[2px] text-[12.5px] transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'A gerar...' : 'Gerar novo QR'}
                  </button>
                  <button
                    type="button"
                    onClick={clearQr}
                    className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-3.5 py-2 rounded-[2px] text-[12.5px] transition-colors"
                  >
                    Ocultar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-3 flex-wrap">
            {!qr && (
              <button
                type="button"
                onClick={handleQr}
                disabled={submitting}
                className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? 'A obter QR...' : 'Mostrar QR'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              disabled={submitting}
              className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors disabled:opacity-50"
            >
              Desligar sessão
            </button>
          </div>
        </div>
      )}

      {confirmLogout && (
        <LogoutConfirmDialog
          tenantNome={tenantNome}
          submitting={submitting}
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </ConsoleCard>
  );
}
