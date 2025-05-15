import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Atualiza o estado para que o próximo renderizado mostre a UI de fallback
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    // Você também pode registrar o erro em um serviço de relatório de erro
    console.error(error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      // Você pode renderizar qualquer UI de fallback
      return (
        <div className='text-red-500 p-4'>
            <h1>Algo deu errado.</h1>
            <p>Por favor, tente novamente mais tarde.</p>
        </div>
      )
    }
    return this.props.children;
  }
}

export default ErrorBoundary;