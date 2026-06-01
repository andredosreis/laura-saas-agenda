/**
 * Tipos do Inbox de Conversas (FDD fdd-conversas-inbox.md).
 * Um número de telemóvel = uma conversa contínua (🌱 lead → 👤 cliente).
 */

export type ConversaTipo = 'cliente' | 'lead';

export interface ConversaListItem {
  telefone: string;
  tipo: ConversaTipo;
  contactoId: string | null;
  nome: string;
  iaAtiva: boolean;
  estado: string | null;
  ultimaMensagem: string;
  ultimaData: string;
  ultimaDirecao: 'entrada' | 'saida';
  naoLidas: number;
}

export interface ConversaMensagem {
  _id: string;
  mensagem: string;
  origem: 'cliente' | 'laura';
  direcao: 'entrada' | 'saida';
  geradoPor?: 'ia' | 'humano' | 'cliente';
  data: string;
}

export interface Pagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ConversasListResponse {
  success: true;
  data: ConversaListItem[];
  pagination: Pagination;
}

export interface ConversaMensagensResponse {
  success: true;
  data: ConversaMensagem[];
  pagination: Pagination;
}

export interface ReplyResponse {
  success: true;
  data: { telefone: string; iaAtiva: boolean; enviado: boolean };
}

export interface PauseAiResponse {
  success: true;
  data: { telefone: string; iaAtiva: boolean };
}
