import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

import Header from './components/Header';
import Agendamentos from './pages/Agendamentos';
import Pacotes from './pages/Pacotes';
import Clientes from './pages/Clientes';
import Dashboard from './pages/Dashboard';


function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agendamentos" element={<Agendamentos />} />
        <Route path="/pacotes" element={<Pacotes />} />
        <Route path="/clientes" element={<Clientes />} />
      </Routes>
    </Router>
  );
}

export default App;
