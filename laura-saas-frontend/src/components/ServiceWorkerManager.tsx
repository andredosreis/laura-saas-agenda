import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { registerServiceWorker, checkForUpdates } from '../services/serviceWorkerService';

/**
 * Componente que gerencia o Service Worker
 * Só registra o SW quando o usuário está autenticado
 */
const ServiceWorkerManager = () => {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // ✅ Só registra SW se o usuário estiver autenticado
    if (!isAuthenticated) {
      console.log('[SW Manager] ⏸️ Usuário não autenticado, não registrando SW');
      return;
    }

    let unsubscribe: (() => void) | undefined;

    const setupServiceWorker = async () => {
      console.log('[SW Manager] 🚀 Usuário autenticado, iniciando setup de Service Worker...');

      try {
        const registration = await registerServiceWorker();

        if (registration) {
          console.log('[SW Manager] ✅ SW registrado, configurando verificação de updates');

          unsubscribe = checkForUpdates(
            () => {
              console.log('[SW Manager] 📦 Update disponível! Mostrando notificação...');
              toast.info(
                '🔄 Nova versão disponível! Recarregue a página para atualizar.',
                {
                  toastId: 'update-available', // Evita duplicatas
                  position: 'top-right',
                  autoClose: 10000, // 10 segundos
                  closeButton: true,
                  pauseOnHover: true,
                  draggable: true,
                }
              );
            },
            60
          );
        } else {
          console.error('[SW Manager] ❌ Falha ao registar SW');
        }
      } catch (error) {
        console.error('[SW Manager] ❌ Erro no setup:', error);
      }
    };

    setupServiceWorker();

    return () => {
      console.log('[SW Manager] 🛑 Limpando listeners do SW');
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isAuthenticated]); // Re-executa quando isAuthenticated mudar

  return null; // Componente invisível
};

export default ServiceWorkerManager;
