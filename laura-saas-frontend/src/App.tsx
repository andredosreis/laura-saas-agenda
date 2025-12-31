import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useEffect } from 'react';

// 🆕 Contexto de Autenticação
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Componentes de Layout
import Navbar from './components/Navbar';
import InstallPrompt from './components/InstallPrompt';

// 🆕 Páginas de Autenticação
import Login from './pages/Login';
import Register from './pages/Register';

// Páginas Protegidas
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

// Services
import { registerServiceWorker, checkForUpdates } from './services/serviceWorkerService';

// Componente para layout protegido (com Navbar)
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ProtectedRoute>
      <Navbar />
      {children}
    </ProtectedRoute>
  );
};

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
    <AuthProvider>
      <Router>
        <Routes>
          {/* 🆕 Rotas Públicas (sem navbar) */}
          <Route path="/login" element={<Login />} />
          <Route path="/registrar" element={<Register />} />

          {/* 🔐 Rotas Protegidas (com navbar) */}
          <Route path="/" element={
            <ProtectedLayout><Dashboard /></ProtectedLayout>
          } />
          <Route path="/agendamentos" element={
            <ProtectedLayout><Agendamentos /></ProtectedLayout>
          } />
          <Route path="/clientes" element={
            <ProtectedLayout><Clientes /></ProtectedLayout>
          } />
          <Route path="/pacotes" element={
            <ProtectedLayout><Pacotes /></ProtectedLayout>
          } />
          <Route path="/criar-cliente" element={
            <ProtectedLayout><CriarCliente /></ProtectedLayout>
          } />
          <Route path="/criar-agendamento" element={
            <ProtectedLayout><CriarAgendamento /></ProtectedLayout>
          } />
          <Route path="/criar-pacote" element={
            <ProtectedLayout><CriarPacote /></ProtectedLayout>
          } />
          <Route path="/clientes/editar/:id" element={
            <ProtectedLayout><EditarCliente /></ProtectedLayout>
          } />
          <Route path="/pacotes/editar/:id" element={
            <ProtectedLayout><EditarPacote /></ProtectedLayout>
          } />
          <Route path="/agendamentos/editar/:id" element={
            <ProtectedLayout><EditarAgendamento /></ProtectedLayout>
          } />
          <Route path="/disponibilidade" element={
            <ProtectedLayout><Disponibilidade /></ProtectedLayout>
          } />
        </Routes>

        <ToastContainer />
        <InstallPrompt />
      </Router>
    </AuthProvider>
  );
};

export default App;