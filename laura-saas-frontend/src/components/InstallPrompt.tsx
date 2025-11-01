import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

// Tipo para o evento beforeinstallprompt (não nativo do TypeScript)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Previne o mini-infobar do Chrome de aparecer automaticamente
      e.preventDefault();

      // Guarda o evento para usar depois
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Mostra o prompt customizado
      setShowPrompt(true);

      console.log('[PWA] Evento beforeinstallprompt capturado');
    };

    // Escuta o evento beforeinstallprompt
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detecta se app já está instalado
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('[PWA] App já está instalado');
      setShowPrompt(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('[PWA] Nenhum prompt disponível');
      return;
    }

    // Mostra o prompt de instalação nativo
    deferredPrompt.prompt();

    // Aguarda a escolha do usuário
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`[PWA] Usuário ${outcome === 'accepted' ? 'aceitou' : 'recusou'} a instalação`);

    // Limpa o prompt guardado
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);

    // Guarda no localStorage que usuário dispensou (opcional - pode implementar lógica de "não mostrar novamente por X dias")
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  // Não mostra nada se não houver prompt ou se já foi dispensado
  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
          <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Instalar Laura
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Instale o app na tela inicial para acesso rápido e uso offline!
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleInstallClick}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-2 rounded-lg transition-colors"
              aria-label="Dispensar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;