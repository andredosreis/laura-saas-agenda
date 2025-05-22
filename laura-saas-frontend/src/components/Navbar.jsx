import { NavLink } from 'react-router-dom';
import { useState } from 'react';

function Navbar() {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Define os links de navegação para reutilização
  const navLinks = [
    { to: "/", text: "Dashboard" },
    { to: "/clientes", text: "Clientes" },
    { to: "/agendamentos", text: "Agendamentos" },
    { to: "/pacotes", text: "Pacotes" },
    // Adicionar mais links aqui se necessário
  ];

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!isMobileMenuOpen);
  };

  const linkClass = ({ isActive }) => 
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${ // Ajustei para text-sm font-medium
      isActive 
        ? 'text-amber-500' // Link ativo: Dourado
        : 'text-gray-300 hover:text-amber-400' // Link inativo: Cinza claro, hover dourado mais claro
    }`;
     const linkClassMobile = ({ isActive }) =>
    `block px-3 py-2 rounded-md text-base font-medium transition-colors ${ // 'block' para ocupar a largura e empilhar
      isActive 
        ? 'bg-amber-500 text-black' // Ex: Fundo dourado e texto preto para link ativo no mobile
        : 'text-gray-300 hover:bg-gray-700 hover:text-white' // Estilo para link inativo no mobile
    }`;
  
  // ADICIONA ESTA FUNÇÃO PARA FECHAR O MENU:
  const closeMobileMenu = () => {
    setMobileMenuOpen(false); // Corrigido: setIsMobileMenuOpen para setMobileMenuOpen
  };


  return (
    <nav className="bg-gray-900 shadow-md"> {/* Adicionei uma sombra sutil */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8"> {/* Padding responsivo */}
        <div className="flex items-center justify-between h-16"> {/* Define altura e alinhamento */}
          
          {/* Nome da Marca / Logo (Esquerda) */}
          <div className="flex-shrink-0">
            <NavLink 
              to="/" 
              className="text-2xl font-bold text-amber-500 hover:text-amber-400 transition-colors" // Estilo para o nome da marca
              onClick={isMobileMenuOpen ? closeMobileMenu : undefined} // Fecha o menu se estiver aberto
            >
              LA Estética Avançada
            </NavLink>
          </div>

          {/* Links de Navegação (Direita) */}
          <div className="hidden md:flex md:items-center md:space-x-4"> {/* Esconde em mobile, mostra em desktop */}
            {navLinks.map((link) => (
              <NavLink 
                key={link.to} 
                to={link.to} 
                className={linkClass}
                // Adiciona 'end' para o link da Dashboard ou qualquer link que aponte para "/"
                {...(link.to === "/" ? { end: true } : {})} 
              >
                {link.text}
              </NavLink>
            ))}
          </div>
          
          {/* Botão de Menu Mobile */}
          <div className="md:hidden flex items-center">
            <button 
              type="button" 
              className="text-gray-400 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500"
              onClick={toggleMobileMenu} // Corrigido: onClick como propriedade
              aria-controls="mobile-menu" // Associa o botão ao menu
              aria-expanded={isMobileMenuOpen} // Indica se o menu está expandido
            >
              <span className="sr-only">Abrir menu principal</span>
              {isMobileMenuOpen ? (
                // Ícone "X" (quando o menu está aberto)
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Ícone "Hamburger" (quando o menu está fechado)
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Menu Mobile Expansível */}
       {isMobileMenuOpen && (
        <div className="md:hidden" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={linkClassMobile}
                onClick={closeMobileMenu} // Fecha o menu ao clicar
                // Adiciona 'end' para o link da Dashboard ou qualquer link que aponte para "/"
                {...(link.to === "/" ? { end: true } : {})} 
              >
                {link.text}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}


export default Navbar;