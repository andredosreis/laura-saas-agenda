/**
 * leadsService — wrapper tipado para os endpoints /leads do Marcai Node.
 * Reusa a instância `api` (axios) já configurada com interceptors em api.js.
 */

import api from './api';
import type {
  Lead,
  LeadStatus,
  LeadOrigem,
  LeadUrgencia,
  CreateLeadDTO,
  UpdateLeadDTO,
  MoveStageDTO,
  ManualReplyDTO,
  ConvertLeadDTO,
  LeadsListResponse,
  LeadResponse,
  LeadDetailResponse,
} from '../types/lead';

export interface ListLeadsParams {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  origem?: LeadOrigem;
  urgencia?: LeadUrgencia;
  q?: string;
}

export const leadsService = {
  list: async (params: ListLeadsParams = {}): Promise<LeadsListResponse> => {
    const { data } = await api.get('/leads', { params });
    return data;
  },

  get: async (id: string): Promise<LeadDetailResponse> => {
    const { data } = await api.get(`/leads/${id}`);
    return data;
  },

  create: async (payload: CreateLeadDTO): Promise<LeadResponse> => {
    const { data } = await api.post('/leads', payload);
    return data;
  },

  update: async (id: string, payload: UpdateLeadDTO): Promise<LeadResponse> => {
    const { data } = await api.put(`/leads/${id}`, payload);
    return data;
  },

  remove: async (id: string): Promise<{ success: true; data: { id: string } }> => {
    const { data } = await api.delete(`/leads/${id}`);
    return data;
  },

  moveStage: async (id: string, payload: MoveStageDTO): Promise<LeadResponse> => {
    const { data } = await api.patch(`/leads/${id}/stage`, payload);
    return data;
  },

  manualReply: async (id: string, payload: ManualReplyDTO) => {
    const { data } = await api.post(`/leads/${id}/reply`, payload);
    return data as { success: true; data: { lead: Lead; conversa: unknown } };
  },

  convert: async (id: string, payload: ConvertLeadDTO = {}) => {
    const { data } = await api.post(`/leads/${id}/convert`, payload);
    return data as { success: true; data: { lead: Lead; cliente: unknown } };
  },

  pauseAi: async (id: string, iaAtiva: boolean): Promise<LeadResponse> => {
    const { data } = await api.post(`/leads/${id}/pause-ai`, { iaAtiva });
    return data;
  },
};

export default leadsService;
