// ============================================
// SERVICE WORKER SERVICE - LAURA SAAS
// ============================================
// Responsável por:
// 1. Registar o Service Worker
// 2. Verificar atualizações periodicamente
// 3. Gerenciar ciclo de vida do SW
// ============================================

// ============================================
// 1️⃣ REGISTAR SERVICE WORKER
// ============================================
// Esta função registra o SW quando o app inicia
// Ela avisa o navegador: "Hey, temos um Service Worker em public/service-worker.ts"
// Retorna: ServiceWorkerContainer se bem-sucedido, null se falhar


export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null>{
  // ❌ Se o navegador não suporta SW (ex: navegadores muito antigos), sair
  if (!navigator.serviceWorker) {
    console.warn('[SW] ❌ Service Worker não suportado neste navegador');
    return null;
  }

  try {
    // ✅ Registar o SW
    // Caminho: '/service-worker.js' (gerado automaticamente pelo Vite do arquivo .ts)
    // scope: '/' = SW controla todo o site
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });
    
    console.log('[SW] ✅ Registrado com sucesso');
    console.log('[SW] SW Controller ativo:', registration.active);
    
    return registration;
  } catch (error) {
    console.error('[SW] ❌ Erro ao registar:', error);
    return null;
  }
}

// ============================================
// 2️⃣ VERIFICAR ATUALIZAÇÕES PERIODICAMENTE
// ============================================
// Esta função verifica se há nova versão do SW a cada intervalo
// Devolve uma callback quando detecta uma atualização
// Exemplo: quando alguém faz push do novo código para produção

export function checkForUpdates(
  // Callback: o que fazer quando há update disponível
  onUpdateAvailable: () => void,
  // Intervalo em minutos (padrão: 60 = 1 hora)
  intervalMinutes: number = 60
): () => void {
  // ❌ Se SW não está ativo, não faz sentido verificar
  if (!navigator.serviceWorker?.controller) {
    console.warn('[SW] ⚠️ SW controller não ativo, pulando verificação de updates');
    return () => {};
  }

  console.log(`[SW] 🔄 Iniciando verificação de updates a cada ${intervalMinutes} minutos`);

  // 1️⃣ Verificar IMEDIATAMENTE
  navigator.serviceWorker.controller.postMessage({ type: 'CHECK_UPDATE' });

  // 2️⃣ Depois verificar a cada X minutos
  // Exemplo: Se 60 minutos = 60 * 60 * 1000 = 3.600.000 ms
  const interval = setInterval(() => {
    console.log('[SW] 🔄 Verificando updates...');
    navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_UPDATE' });
  }, intervalMinutes * 60 * 1000);

  // 3️⃣ Listener para quando há UPDATE disponível
  // Quando SW muda de "waiting" para "active", é porque há nova versão
  const updateListener = () => {
    console.log('[SW] 📦 Update detectado! Chamando callback...');
    onUpdateAvailable();
  };

  navigator.serviceWorker.addEventListener('controllerchange', updateListener);

  // 4️⃣ Retornar função de CLEANUP
  // Vai ser chamada quando o component desmonta (evita memory leak)
  return () => {
    console.log('[SW] 🛑 Limpando listeners de update');
    clearInterval(interval);
    navigator.serviceWorker?.removeEventListener('controllerchange', updateListener);
  };
}

// ============================================
// 3️⃣ FUNÇÃO AUXILIAR - Unregistar SW
// ============================================
// Útil para testes ou quando quiser desabilitar o SW
export async function unregisterServiceWorker(): Promise<void> {
  if (!navigator.serviceWorker) {
    console.warn('[SW] ⚠️ Service Worker não suportado');
    return;
  }

  try {
    // Listar todas as registrações do SW
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const registration of registrations) {
      // Unregistar cada uma
      await registration.unregister();
      console.log('[SW] ✅ Unregistrado:', registration);
    }
  } catch (error) {
    console.error('[SW] ❌ Erro ao unregistar:', error);
  }
}

// ============================================
// 4️⃣ FUNÇÃO AUXILIAR - Limpar Cache
// ============================================
// Útil para testes ou quando quer resetar o app
export async function clearAllCaches(): Promise<void> {
  try {
    // Listar todos os caches
    const cacheNames = await caches.keys();

    // Deletar cada um
    await Promise.all(
      cacheNames.map(cacheName => {
        console.log(`[Cache] 🗑️ Deletando cache: ${cacheName}`);
        return caches.delete(cacheName);
      })
    );

    console.log('[Cache] ✅ Todos os caches deletados');
  } catch (error) {
    console.error('[Cache] ❌ Erro ao limpar caches:', error);
  }
}