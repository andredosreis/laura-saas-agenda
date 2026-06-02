/**
 * conversasService — wrapper tipado para os endpoints /conversas (inbox).
 * Reusa a instância `api` (axios) com interceptors. Ver FDD fdd-conversas-inbox.md.
 */

import api from './api';
import type {
  ConversaTipo,
  ConversasListResponse,
  ConversaMensagensResponse,
  ReplyResponse,
  PauseAiResponse,
} from '../types/conversa';

export interface ListConversasParams {
  page?: number;
  limit?: number;
  tipo?: 'todas' | 'leads' | 'clientes';
}

export const conversasService = {
  list: async (params: ListConversasParams = {}): Promise<ConversasListResponse> => {
    const { data } = await api.get('/conversas', { params });
    return data;
  },

  mensagens: async (
    telefone: string,
    params: { page?: number; limit?: number } = {},
  ): Promise<ConversaMensagensResponse> => {
    const { data } = await api.get(`/conversas/${telefone}/mensagens`, { params });
    return data;
  },

  reply: async (
    telefone: string,
    payload: { mensagem: string; pausarIa?: boolean },
  ): Promise<ReplyResponse> => {
    const { data } = await api.post(`/conversas/${telefone}/reply`, payload);
    return data;
  },

  pauseAi: async (telefone: string, ativa: boolean): Promise<PauseAiResponse> => {
    const { data } = await api.post(`/conversas/${telefone}/pause-ai`, { ativa });
    return data;
  },

  // Master switch da IA da clínica (todos os contactos de uma vez).
  getIaGlobal: async (): Promise<{ success: boolean; data: { ativa: boolean } }> => {
    const { data } = await api.get('/conversas/ia-global');
    return data;
  },

  setIaGlobal: async (ativa: boolean): Promise<{ success: boolean; data: { ativa: boolean } }> => {
    const { data } = await api.post('/conversas/ia-global', { ativa });
    return data;
  },
};

export type { ConversaTipo };
export default conversasService;
