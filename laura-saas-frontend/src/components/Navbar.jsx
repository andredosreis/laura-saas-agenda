import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <nav className="bg-blue-600 p-4 text-white">
      <div className="flex justify-around">
        <Link to="/" className="hover:text-gray-300">Home</Link>
        <Link to="/clientes" className="hover:text-gray-300">Clientes</Link>
        <Link to="/criar-cliente" className="hover:text-gray-300">Novo Cliente</Link>
        <Link to="/agendamentos" className="hover:text-gray-300">Agendamentos</Link>
        <Link to="/agendar" className="hover:text-gray-300">Novo Agendamento</Link>
        <Link to="/pacotes" className="hover:text-gray-300">Pacotes</Link>
        <Link to="/criar-pacote" className="hover:text-gray-300">Novo Pacote</Link>
      </div>
    </nav>
  );
}

export default Navbar;
