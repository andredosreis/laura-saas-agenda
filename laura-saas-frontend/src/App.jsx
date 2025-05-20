import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';  // Corrigido
import 'react-toastify/dist/ReactToastify.css';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Agendamentos from './pages/Agendamentos';
import Clientes from './pages/Clientes';
import Pacotes from './pages/Pacotes';
import CriarCliente from './pages/CriarCliente';
import CriarAgendamento from './pages/CriarAgendamento';
import CriarPacote from './pages/CriarPacote';
import EditarCliente from './pages/EditarCliente';
import EditarPacote from './pages/EditarPacote';

function App() {
  return (
    <Router>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agendamentos" element={<Agendamentos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/pacotes" element={<Pacotes />} />
          <Route path="/criar-cliente" element={<CriarCliente />} />
          <Route path="/criar-agendamento" element={<CriarAgendamento />} />
          <Route path="/criar-pacote" element={<CriarPacote />} />
          <Route path="/clientes/editar/:id" element={<EditarCliente />} />
          <Route path="/pacotes/editar/:id" element={<EditarPacote />} />
        </Routes>
        <ToastContainer />  {/* Movido para dentro do Router e corrigido o nome */}
      </main>
    </Router>
  );
}

export default App;