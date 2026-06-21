import mongoose from 'mongoose';
import Tenant from '../../models/Tenant.js';
import User from '../../models/User.js';
import { getModels } from '../../models/registry.js';
import { getTenantDBAdmin } from './getTenantDBAdmin.js';

/**
 * GET /admin/tenants — lista todos os tenants.
 *
 * Control-plane (DB partilhada `laura-saas`), travessia cross-tenant SANCIONADA:
 * este é o painel super-admin, logo NÃO há filtro `{ tenantId }` — ao contrário
 * de todo o resto do sistema. A guarda é o `requireSuperadmin` no router.
 */
export const listarTenants = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Tenant.find()
      .select('nome slug plano createdAt')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Tenant.countDocuments(),
  ]);

  req.audit.set({ action: 'tenant.list', metadata: { page, limit, returned: data.length } });

  res.json({
    success: true,
    data,
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  });
};

/**
 * GET /admin/tenants/:id — detalhe de um tenant + contagem de utilizadores.
 *
 * Control-plane. `Tenant.findById` sem filtro tenantId é correcto AQUI (o Tenant
 * é a própria entidade de tenant, e este é o painel super-admin). Inexistente →
 * 404 de NEGÓCIO (o superadmin não inventa realidade) — distinto do 404 de
 * negação de acesso, que o requireSuperadmin trata.
 */
export const obterTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const [tenant, totalUsuarios] = await Promise.all([
    Tenant.findById(id),
    User.countDocuments({ tenantId: id }),
  ]);

  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  req.audit.set({ action: 'tenant.view', targetTenantId: id });

  res.json({ success: true, data: { tenant, totalUsuarios } });
};

/**
 * GET /admin/tenants/:id/uso — métricas de uso de um tenant (cross-tenant).
 *
 * Lê a DB do tenant via `getTenantDBAdmin` — conexão SEPARADA read-only (Gate 4b):
 * o painel não consegue escrever em dados de tenant, imposto pelo Mongo. Dentro
 * de `tenant_<id>` não há filtro `tenantId` (a DB é o próprio tenant). Contagens
 * em paralelo (Promise.all bounded — 3 contagens).
 */
export const usoTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  const { Cliente, Agendamento, Mensagem } = getModels(getTenantDBAdmin(id));
  const [clientes, agendamentos, mensagens] = await Promise.all([
    Cliente.countDocuments({}),
    Agendamento.countDocuments({}),
    Mensagem.countDocuments({}),
  ]);

  req.audit.set({ action: 'tenant.uso', targetTenantId: id, metadata: { clientes, agendamentos, mensagens } });

  res.json({ success: true, data: { clientes, agendamentos, mensagens } });
};
