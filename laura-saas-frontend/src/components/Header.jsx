import React from 'react'
import { Link } from 'react-router-dom'

function Header() {
  return (
    <header>
      <nav>
        <ul style={{display: 'flex', gap: '20px', listStyle: 'none' }}>
          <li><Link to="/">Dashboard</Link></li>
          <li><Link to="/agendamentos">Agendamentos</Link></li>
          <li><Link to="/pacotes">Pacotes</Link></li>
          <li><Link to="/clientes">Clientes</Link></li>
        </ul>
      </nav>
    </header>
  )
}
export default Header
