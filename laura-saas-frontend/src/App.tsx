import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// 🆕 Contextos
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';

// Componentes de Layout
import Navbar from './components/Navbar';
import InstallPrompt from './components/InstallPrompt';

// 🆕 Página de Landing (Pública) - COMENTADO: promete funcionalidades não implementadas
// import LandingPage from './pages/LandingPage';

// 🆕 Páginas de Autenticação
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

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
import CalendarView from './pages/CalendarView';
import Financeiro from './pages/Financeiro';

// 💰 FASE 3: Páginas do Sistema Financeiro
import Transacoes from './pages/Transacoes';
import PacotesAtivos from './pages/PacotesAtivos';
import VenderPacote from './pages/VenderPacote';
import Caixa from './pages/Caixa';

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
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* 🆕 Página Inicial - Login direto (LandingPage comentada) */}
            <Route path="/" element={<Login />} />

            {/* 🆕 Rotas Públicas (sem navbar) */}
            <Route path="/login" element={<Login />} />
            <Route path="/registrar" element={<Register />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/reset-senha/:token" element={<ResetPassword />} />

            {/* 🔐 Rotas Protegidas (com navbar) */}
            <Route path="/dashboard" element={
              <ProtectedLayout><Dashboard /></ProtectedLayout>
            } />
            <Route path="/agendamentos" element={
              <ProtectedLayout><Agendamentos /></ProtectedLayout>
            } />
            <Route path="/calendario" element={
              <ProtectedLayout><CalendarView /></ProtectedLayout>
            } />
            <Route path="/clientes" element={
              <ProtectedLayout><Clientes /></ProtectedLayout>
            } />
            <Route path="/pacotes" element={
              <ProtectedLayout><Pacotes /></ProtectedLayout>
            } />
            <Route path="/financeiro" element={
              <ProtectedLayout><Financeiro /></ProtectedLayout>
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

            {/* 💰 FASE 3: Rotas do Sistema Financeiro */}
            <Route path="/transacoes" element={
              <ProtectedLayout><Transacoes /></ProtectedLayout>
            } />
            <Route path="/pacotes-ativos" element={
              <ProtectedLayout><PacotesAtivos /></ProtectedLayout>
            } />
            <Route path="/vender-pacote" element={
              <ProtectedLayout><VenderPacote /></ProtectedLayout>
            } />
            <Route path="/caixa" element={
              <ProtectedLayout><Caixa /></ProtectedLayout>
            } />
          </Routes>

          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            limit={3}
          />
          <InstallPrompt />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
