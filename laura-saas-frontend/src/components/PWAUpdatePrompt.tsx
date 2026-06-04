import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

// Verifica se há nova versão de hora a hora, MESMO com a app aberta (standalone).
// Sem isto, o service worker só re-verifica ao recarregar a página — e quem mantém
// o PWA aberto fica preso na versão antiga indefinidamente.
const intervalMS = 60 * 60 * 1000;

/**
 * Banner discreto que avisa quando há uma nova versão publicada.
 * Usa registerType: 'prompt' (vite.config.ts) — nunca recarrega sozinho:
 * o utilizador decide quando atualizar (evita perder dados a meio de um formulário).
 */
const PWAUpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update();
        }, intervalMS);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Erro no registo do service worker', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Nova versão disponível
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Há uma atualização do Marcai. Atualize para ver as novidades.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Atualizar
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="shrink-0 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-2 rounded-lg transition-colors"
              aria-label="Agora não"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdatePrompt;
