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
import { authenticate, authorize, requirePermission } from '../../middlewares/auth.js';
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
  requirePermission('gerenciarHistorico'),
  authorize('admin', 'gerente', 'terapeuta'),
  validate(createHistoricoSchema),
  criarHistoricoAtendimento
);

// Listar históricos (com filtros e paginação)
router.get(
  '/',
  authenticate,
  requirePermission('verClientes'),
  listarHistoricosAtendimento
);

// Estatísticas gerais
router.get(
  '/stats',
  authenticate,
  requirePermission('verClientes'),
  estatisticasAtendimentos
);

// Buscar histórico por ID
router.get(
  '/:id',
  authenticate,
  requirePermission('verClientes'),
  validate(historicoIdParamSchema, 'params'),
  buscarHistoricoPorId
);

// Atualizar histórico
router.put(
  '/:id',
  authenticate,
  requirePermission('gerenciarHistorico'),
  authorize('admin', 'gerente', 'terapeuta'),
  validate(historicoIdParamSchema, 'params'),
  validate(updateHistoricoSchema),
  atualizarHistoricoAtendimento
);

// Finalizar histórico (bloqueia edições futuras)
router.put(
  '/:id/finalizar',
  authenticate,
  requirePermission('gerenciarHistorico'),
  authorize('admin', 'gerente', 'terapeuta'),
  validate(historicoIdParamSchema, 'params'),
  finalizarHistoricoAtendimento
);

// Deletar histórico (admin apenas)
router.delete(
  '/:id',
  authenticate,
  requirePermission('deletarClientes'),
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
  requirePermission('verClientes'),
  validate(clienteIdParamSchema, 'params'),
  buscarHistoricoCliente
);

// Buscar técnicas mais utilizadas para um cliente
router.get(
  '/cliente/:clienteId/tecnicas',
  authenticate,
  requirePermission('verClientes'),
  validate(clienteIdParamSchema, 'params'),
  buscarTecnicasMaisUsadas
);

export default router;
