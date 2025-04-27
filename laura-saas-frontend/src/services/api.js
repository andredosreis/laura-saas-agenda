import axios from 'axios';

// Criando a instância padrão do axios
const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Base URL para suas rotas de backend
});

export default api;
