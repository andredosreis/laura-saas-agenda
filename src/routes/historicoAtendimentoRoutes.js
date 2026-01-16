import express from 'express';
import {
  criarHistoricoAtendimento,
  listarHistoricosAtendimento,
  buscarHistoricoPorId,
  atualizarHistoricoAtendimento,
  finalizarHistoricoAtendimento,
  deletarHistoricoAtendimento,
  buscarHistoricoCliente,
  buscarTecnicasMaisUsadas,
  estatisticasAtendimentos
} from '../controllers/historicoAtendimentoController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

/**
 * Rotas de Histórico de Atendimentos
 *
 * Todas as rotas requerem autenticação
 * Algumas rotas requerem permissões específicas
 */

// ============================================
// ROTAS PÚBLICAS (autenticadas)
// ============================================

// Criar novo histórico
router.post(
  '/',
  authenticate,
  authorize('admin', 'profissional'),
  criarHistoricoAtendimento
);

// Listar históricos (com filtros e paginação)
router.get(
  '/',
  authenticate,
  listarHistoricosAtendimento
);

// Estatísticas gerais
router.get(
  '/stats',
  authenticate,
  authorize('admin', 'profissional'),
  estatisticasAtendimentos
);

// Buscar histórico por ID
router.get(
  '/:id',
  authenticate,
  buscarHistoricoPorId
);

// Atualizar histórico
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'profissional'),
  atualizarHistoricoAtendimento
);

// Finalizar histórico (bloqueia edições futuras)
router.put(
  '/:id/finalizar',
  authenticate,
  authorize('admin', 'profissional'),
  finalizarHistoricoAtendimento
);

// Deletar histórico (admin apenas)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  deletarHistoricoAtendimento
);

// ============================================
// ROTAS ESPECÍFICAS DE CLIENTE
// ============================================

// Buscar histórico completo de um cliente
router.get(
  '/cliente/:clienteId',
  authenticate,
  buscarHistoricoCliente
);

// Buscar técnicas mais utilizadas para um cliente
router.get(
  '/cliente/:clienteId/tecnicas',
  authenticate,
  buscarTecnicasMaisUsadas
);

export default router;
