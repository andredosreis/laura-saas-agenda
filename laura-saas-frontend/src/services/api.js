import axios from 'axios';
import { toast } from 'react-toastify';



// Configurações do axios
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000, // Timeout de 10 segundos
  headers: {
    'Content-Type': 'application/json',
  }
});

// Mensagens de erro personalizadas por código HTTP
const ERROR_MESSAGES = {
  400: 'Dados inválidos. Por favor, verifique as informações.',
  401: 'Não autorizado. Por favor, faça login novamente.',
  403: 'Acesso negado. Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  422: 'Dados inválidos. Verifique os campos preenchidos.',
  429: 'Muitas requisições. Por favor, aguarde um momento.',
  500: 'Erro interno do servidor. Tente novamente mais tarde.',
  503: 'Serviço indisponível. Tente novamente mais tarde.'
};

// Interceptor de requisição
api.interceptors.request.use(
  config => {
    // Aqui você pode adicionar um token de autenticação, se necessário
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    console.error('Erro na requisição:', error);
    return Promise.reject(error);
  }
);

// Interceptor de resposta
api.interceptors.response.use(
  response => {
    // Se a resposta incluir uma mensagem de sucesso, mostrar toast
    if (response.data?.message) {
      toast.success(response.data.message);
    }
    return response;
  },
  error => {
    console.error('Erro na API:', error);

    let errorMessage = 'Ocorreu um erro ao processar sua solicitação.';

    if (error.response) {
      // Erro com resposta do servidor
      const status = error.response.status;
      errorMessage = error.response.data?.message || 
                    ERROR_MESSAGES[status] || 
                    `Erro ${status}`;

      // Tratamento especial para erros de validação
      if (status === 422 && error.response.data?.errors) {
        errorMessage = Object.values(error.response.data.errors)
          .flat()
          .join('\n');
      }

      // Se receber 401, limpar token e redirecionar para login
      if (status === 401) {
        localStorage.removeItem('token');
        // window.location.href = '/login';
      }

    } else if (error.request) {
      // Erro sem resposta do servidor
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'A requisição demorou muito para responder. Tente novamente.';
      } else {
        errorMessage = 'Não foi possível se conectar ao servidor. Verifique sua conexão.';
      }
    }

    // Mostrar toast de erro
    toast.error(errorMessage, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });

    return Promise.reject(error);
  }
);

// Métodos auxiliares para requisições comuns
const apiHelpers = {
  // GET com tratamento de erro simplificado
  async get(url, config = {}) {
    try {
      const response = await api.get(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // POST com tratamento de erro simplificado
  async post(url, data = {}, config = {}) {
    try {
      const response = await api.post(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // PUT com tratamento de erro simplificado
  async put(url, data = {}, config = {}) {
    try {
      const response = await api.put(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // DELETE com tratamento de erro simplificado
  async delete(url, config = {}) {
    try {
      const response = await api.delete(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Exporta tanto a instância do axios quanto os helpers
export { apiHelpers };
export default api;