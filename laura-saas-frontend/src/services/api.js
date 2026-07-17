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
  401: 'Sessão expirada. Por favor, faça login novamente.',
  403: 'Acesso negado. Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  422: 'Dados inválidos. Verifique os campos preenchidos.',
  429: 'Muitas requisições. Por favor, aguarde um momento.',
  500: 'Erro interno do servidor. Tente novamente mais tarde.',
  503: 'Serviço indisponível. Tente novamente mais tarde.'
};

// 🆕 Chaves do localStorage (AlinhINHAdo com AuthContext)
const TOKEN_KEY = 'laura_access_token';
const REFRESH_TOKEN_KEY = 'laura_refresh_token';

export const TWO_FACTOR_SETUP_REQUIRED_EVENT = 'marcai:two-factor-setup-required';
// Espelha TWO_FACTOR_SETUP_REQUIRED_CODE em src/modules/admin/require2FA.js.
// Emparelhar pelo `code` e não pela mensagem: o texto é copy e muda sem partir
// o contrato.
const TWO_FACTOR_SETUP_REQUIRED_CODE = 'TWO_FACTOR_SETUP_REQUIRED';

// 🆕 Flag para evitar múltiplos refreshs simultâneos
let isRefreshing = false;
let refreshSubscribers = [];

// Helper para notificar subscribers após refresh
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

const onTokenRefreshed = (newToken) => {
  refreshSubscribers.forEach(callback => callback(newToken));
  refreshSubscribers = [];
};

// Interceptor de requisição
api.interceptors.request.use(
  config => {
    // 🆕 Usar nova chave do localStorage
    const token = localStorage.getItem(TOKEN_KEY);
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
    // 🆕 Só mostrar toast se não for uma resposta de autenticação
    if (response.data?.message && !response.config.url.includes('/auth/')) {
      toast.success(response.data.message);
    }
    return response;
  },
  async error => {
    const originalRequest = error.config;

    // F16: a flag de enforcement vive apenas no backend. Quando ele confirma
    // que o operador ainda não está enrolado, avisamos a shell da consola sem
    // duplicar a configuração numa env var do browser.
    if (error.response?.status === 403 &&
      error.response?.data?.code === TWO_FACTOR_SETUP_REQUIRED_CODE &&
      typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TWO_FACTOR_SETUP_REQUIRED_EVENT));
    }

    // 🆕 Se receber 401 e não é uma tentativa de refresh, tentar renovar token
    if (error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/')) {

      // Se TOKEN_EXPIRED, tentar refresh
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        originalRequest._retry = true;

        if (!isRefreshing) {
          isRefreshing = true;

          try {
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

            if (refreshToken) {
              const response = await api.post('/auth/refresh', { refreshToken });

              if (response.data.success) {
                const { accessToken, refreshToken: newRefreshToken } = response.data.data.tokens;

                localStorage.setItem(TOKEN_KEY, accessToken);
                localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
                api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

                isRefreshing = false;
                onTokenRefreshed(accessToken);

                // Retry da requisição original com novo token
                originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
                return api(originalRequest);
              }
            }
          } catch (refreshError) {
            isRefreshing = false;
            // Refresh falhou, avisar usuário com tempo para reagir
            toast.warning('⚠️ Sua sessão expirou! Você tem 30 segundos para copiar seus dados antes de ser redirecionado para o login.', {
              autoClose: 30000,
              position: "top-center",
              style: { fontSize: '16px', fontWeight: 'bold' }
            });

            setTimeout(() => {
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(REFRESH_TOKEN_KEY);
              localStorage.removeItem('laura_user');
              localStorage.removeItem('laura_tenant');
              window.location.href = '/login';
            }, 30000);

            return Promise.reject(refreshError);
          }
        }

        // Se já está fazendo refresh, aguardar
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      // 401 sem código de expiração = credenciais inválidas
      toast.warning('⚠️ Autenticação inválida! Você tem 30 segundos para copiar seus dados antes de ser redirecionado para o login.', {
        autoClose: 30000,
        position: "top-center",
        style: { fontSize: '16px', fontWeight: 'bold' }
      });

      setTimeout(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem('laura_user');
        localStorage.removeItem('laura_tenant');
        window.location.href = '/login';
      }, 30000);
    }

    console.error('Erro na API:', error);

    let errorMessage = 'Ocorreu um erro ao processar sua solicitação.';

    if (error.response) {
      // Erro com resposta do servidor
      const status = error.response.status;
      errorMessage = error.response.data?.error ||
        error.response.data?.message ||
        ERROR_MESSAGES[status] ||
        `Erro ${status}`;

      // Tratamento especial para erros de validação
      if (status === 422 && error.response.data?.errors) {
        errorMessage = Object.values(error.response.data.errors)
          .flat()
          .join('\n');
      }

    } else if (error.request) {
      // Erro sem resposta do servidor
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'A requisição demorou muito para responder. Tente novamente.';
      } else {
        errorMessage = 'Não foi possível se conectar ao servidor. Verifique sua conexão.';
      }
    }

    // 🆕 Não mostrar toast para erros de autenticação (já tratados pelo redirect)
    if (!error.config?.url?.includes('/auth/')) {
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }

    return Promise.reject(error);
  }
);

// Métodos auxiliares para requisições comuns
const apiHelpers = {
  // GET com tratamento de erro simplificado
  async get(url, config = {}) {
    const response = await api.get(url, config);
    return response.data;
  },

  // POST com tratamento de erro simplificado
  async post(url, data = {}, config = {}) {
    const response = await api.post(url, data, config);
    return response.data;
  },

  // PUT com tratamento de erro simplificado
  async put(url, data = {}, config = {}) {
    const response = await api.put(url, data, config);
    return response.data;
  },

  // DELETE com tratamento de erro simplificado
  async delete(url, config = {}) {
    const response = await api.delete(url, config);
    return response.data;
  }
};

// Exporta tanto a instância do axios quanto os helpers
export { apiHelpers };
export default api;
