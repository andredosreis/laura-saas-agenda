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
} from './historicoAtendimentoController.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createHistoricoSchema,
  updateHistoricoSchema,
  historicoIdParamSchema,
  clienteIdParamSchema,
} from './historicoSchemas.js';

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
  validate(createHistoricoSchema),
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
  validate(historicoIdParamSchema, 'params'),
  buscarHistoricoPorId
);

// Atualizar histórico
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'profissional'),
  validate(historicoIdParamSchema, 'params'),
  validate(updateHistoricoSchema),
  atualizarHistoricoAtendimento
);

// Finalizar histórico (bloqueia edições futuras)
router.put(
  '/:id/finalizar',
  authenticate,
  authorize('admin', 'profissional'),
  validate(historicoIdParamSchema, 'params'),
  finalizarHistoricoAtendimento
);

// Deletar histórico (admin apenas)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(historicoIdParamSchema, 'params'),
  deletarHistoricoAtendimento
);

// ============================================
// ROTAS ESPECÍFICAS DE CLIENTE
// ============================================

// Buscar histórico completo de um cliente
router.get(
  '/cliente/:clienteId',
  authenticate,
  validate(clienteIdParamSchema, 'params'),
  buscarHistoricoCliente
);

// Buscar técnicas mais utilizadas para um cliente
router.get(
  '/cliente/:clienteId/tecnicas',
  authenticate,
  validate(clienteIdParamSchema, 'params'),
  buscarTecnicasMaisUsadas
);

export default router;
