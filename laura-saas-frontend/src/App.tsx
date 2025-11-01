import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useEffect } from 'react';
import Navbar from './components/Navbar';
import InstallPrompt from './components/InstallPrompt';
// ❌ REMOVIDO: import Home from './pages/Home';
import Agendamentos from './pages/Agendamentos';
import Clientes from './pages/Clientes';
import Pacotes from './pages/Pacotes';
import CriarCliente from './pages/CriarCliente';
import CriarAgendamento from './pages/CriarAgendamento';
import CriarPacote from './pages/CriarPacote';
import EditarCliente from './pages/EditarCliente';
import EditarPacote from './pages/EditarPacote';
import EditarAgendamento from './pages/EditarAgendamento';
import Dashboard from './pages/Dashboard';
import Disponibilidade from './pages/Disponibilidade';
import { registerServiceWorker, checkForUpdates } from './services/serviceWorkerService';

const App = () => {
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupServiceWorker = async () => {
      console.log('[App] 🚀 Iniciando setup de Service Worker...');

      try {
        const registration = await registerServiceWorker();

        if (registration) {
          console.log('[App] ✅ SW registrado, configurando verificação de updates');

          unsubscribe = checkForUpdates(
            () => {
              console.log('[App] 📦 Update disponível! Mostrando notificação...');
              toast.info(
                '🔄 Nova versão disponível! Recarregue a página para atualizar.',
                {
                  position: 'top-right',
                  autoClose: false,
                  closeButton: true,
                  pauseOnHover: true,
                }
              );
            },
            60
          );
        } else {
          console.error('[App] ❌ Falha ao registar SW');
        }
      } catch (error) {
        console.error('[App] ❌ Erro no setup:', error);
      }
    };

    setupServiceWorker();

    return () => {
      console.log('[App] 🛑 Desmontando App, limpando listeners');
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return (
    <Router>
      <Navbar />

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agendamentos" element={<Agendamentos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/pacotes" element={<Pacotes />} />
          <Route path="/criar-cliente" element={<CriarCliente />} />
          <Route path="/criar-agendamento" element={<CriarAgendamento />} />
          <Route path="/criar-pacote" element={<CriarPacote />} />
          <Route path="/clientes/editar/:id" element={<EditarCliente />} />
          <Route path="/pacotes/editar/:id" element={<EditarPacote />} />
          <Route path="/agendamentos/editar/:id" element={<EditarAgendamento />} />
          <Route path="/disponibilidade" element={<Disponibilidade />} />
        </Routes>
        <ToastContainer />
        <InstallPrompt />

    </Router>
  );
};

export default App;