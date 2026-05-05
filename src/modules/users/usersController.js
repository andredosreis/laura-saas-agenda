import crypto from 'crypto';
import User from '../../models/User.js';
import Tenant from '../../models/Tenant.js';
import { sendInvitationEmail } from '../../services/emailService.js';

// =============================================
// Helpers internos
// =============================================

/**
 * Gera token de reset (não hasheado) + hash para guardar no DB.
 * Mesmo padrão do forgot-password em authController.js.
 */
function gerarTokenConvite() {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

// =============================================
// LISTAR colaboradores do tenant
// GET /api/users
// =============================================
export const listarColaboradores = async (req, res) => {
  try {
    const { incluirInativos } = req.query;
    const filter = { tenantId: req.tenantId };
    if (incluirInativos !== 'true') {
      filter.ativo = true;
    }

    const users = await User.find(filter)
      .select('-passwordHash -refreshTokens -resetPasswordToken -resetPasswordExpires -emailVerificationToken -emailVerificationExpires -loginAttempts -lockUntil')
      .sort({ ativo: -1, nome: 1 });

    const total = await User.countDocuments({ tenantId: req.tenantId, ativo: true });
    const tenant = await Tenant.findById(req.tenantId).select('limites.maxUsuarios');
    const limiteRaw = tenant?.limites?.maxUsuarios;
    // Convenção: <= 0 ou null = ilimitado → devolvemos null ao frontend
    const maxUsuarios = (limiteRaw == null || limiteRaw <= 0) ? null : limiteRaw;

    res.json({
      success: true,
      data: users,
      meta: {
        total,
        ativos: total,
        maxUsuarios,
      },
    });
  } catch (error) {
    console.error('Erro ao listar colaboradores:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao listar colaboradores' });
  }
};

// =============================================
// CRIAR colaborador (envia convite por email)
// POST /api/users
// =============================================
export const criarColaborador = async (req, res) => {
  try {
    const { nome, email, role, telefone, permissoes, comissaoPadrao, dadosBancarios } = req.body;

    // Apenas superadmin pode criar outro superadmin (defense-in-depth)
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas superadmin pode criar outro superadmin',
      });
    }

    // Limite do plano (apenas users activos contam)
    const tenant = await Tenant.findById(req.tenantId).select('limites nome');
    // Convenção: maxUsuarios <= 0 ou null = ilimitado
    const limiteRaw = tenant?.limites?.maxUsuarios;
    const maxUsuarios = (limiteRaw == null || limiteRaw <= 0) ? Infinity : limiteRaw;
    const ativosActuais = await User.countDocuments({ tenantId: req.tenantId, ativo: true });
    if (ativosActuais >= maxUsuarios) {
      return res.status(403).json({
        success: false,
        error: `Limite do plano atingido (${maxUsuarios} colaboradores activos)`,
      });
    }

    // Email único dentro do tenant
    const existente = await User.findByEmail(req.tenantId, email);
    if (existente) {
      return res.status(409).json({
        success: false,
        error: 'Já existe um colaborador com este email',
      });
    }

    // Gerar token de convite (mesmo padrão do reset password)
    const { token, hash } = gerarTokenConvite();

    // Password aleatória — o colaborador define a sua via link de reset
    const passwordTemporaria = crypto.randomBytes(24).toString('hex');

    // Permissões: usar do body se passadas, senão defaults da role
    const permissoesFinais = permissoes && Object.keys(permissoes).length > 0
      ? { ...User.getDefaultPermissions(role), ...permissoes }
      : User.getDefaultPermissions(role);

    const userPayload = {
      tenantId: req.tenantId,
      nome,
      email,
      role,
      telefone,
      ativo: true,
      emailVerificado: false,
      permissoes: permissoesFinais,
      // Guardar token de reset para o colaborador definir password no primeiro acesso
      resetPasswordToken: hash,
      resetPasswordExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 dias para aceitar convite
    };
    if (comissaoPadrao !== undefined) userPayload.comissaoPadrao = comissaoPadrao;
    if (dadosBancarios) userPayload.dadosBancarios = dadosBancarios;

    const novoUser = await User.createWithPassword({ ...userPayload, password: passwordTemporaria });

    // Enviar email de convite. Se falhar, não bloqueia (graceful degrade) mas avisa.
    let emailEnviado = true;
    try {
      await sendInvitationEmail(novoUser.email, token, novoUser.nome, tenant.nome);
    } catch (emailErr) {
      console.error('Erro ao enviar email de convite:', emailErr);
      emailEnviado = false;
    }

    res.status(201).json({
      success: true,
      data: novoUser.toSafeObject(),
      meta: {
        emailEnviado,
        mensagem: emailEnviado
          ? 'Convite enviado por email. O colaborador define a sua password ao seguir o link.'
          : 'Colaborador criado mas o email de convite falhou. Reenvia manualmente ou verifica configuração SMTP.',
      },
    });
  } catch (error) {
    console.error('Erro ao criar colaborador:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Email já registado' });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao criar colaborador' });
  }
};

// =============================================
// ACTUALIZAR colaborador (nome, role, permissoes, comissão)
// PUT /api/users/:id
// =============================================
export const atualizarColaborador = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, role, telefone, permissoes, comissaoPadrao, dadosBancarios } = req.body;

    // Promoção a superadmin só por superadmin
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas superadmin pode promover a superadmin',
      });
    }

    const user = await User.findOne({ _id: id, tenantId: req.tenantId });
    if (!user) {
      // Acesso cruzado entre tenants → 404 (regra multi-tenant)
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    }

    // Não permitir despromoção do próprio admin se for o último admin (segurança)
    if (
      String(user._id) === String(req.user.userId) &&
      role && role !== 'admin' && role !== 'superadmin'
    ) {
      return res.status(400).json({
        success: false,
        error: 'Não podes despromover-te a ti próprio. Pede a outro admin.',
      });
    }

    if (nome !== undefined) user.nome = nome;
    if (telefone !== undefined) user.telefone = telefone;
    if (comissaoPadrao !== undefined) user.comissaoPadrao = comissaoPadrao;
    if (dadosBancarios) user.dadosBancarios = { ...user.dadosBancarios?.toObject?.(), ...dadosBancarios };

    if (role && role !== user.role) {
      user.role = role;
      // Reaplica defaults da nova role apenas se permissoes não foram explicitamente passadas
      if (!permissoes) {
        user.permissoes = User.getDefaultPermissions(role);
      }
    }
    if (permissoes && Object.keys(permissoes).length > 0) {
      // Merge sobre permissões actuais
      const actuais = user.permissoes?.toObject?.() ?? user.permissoes ?? {};
      user.permissoes = { ...actuais, ...permissoes };
    }

    await user.save();
    res.json({ success: true, data: user.toSafeObject() });
  } catch (error) {
    console.error('Erro ao atualizar colaborador:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao atualizar colaborador' });
  }
};

// =============================================
// DESACTIVAR colaborador (soft delete — ativo=false)
// PATCH /api/users/:id/desativar
// =============================================
export const desativarColaborador = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        error: 'Não podes desactivar-te a ti próprio',
      });
    }

    const user = await User.findOne({ _id: id, tenantId: req.tenantId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    }

    if (!user.ativo) {
      return res.json({ success: true, data: user.toSafeObject(), meta: { jaInativo: true } });
    }

    user.ativo = false;
    // Invalidar refresh tokens — o user fica sem sessões activas
    user.refreshTokens = [];
    await user.save();

    res.json({ success: true, data: user.toSafeObject() });
  } catch (error) {
    console.error('Erro ao desactivar colaborador:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao desactivar colaborador' });
  }
};

// =============================================
// ELIMINAR PERMANENTEMENTE colaborador (hard delete)
// DELETE /api/users/:id
// Restrito: admin/superadmin (já no router) + colaborador tem que estar inactivo
// =============================================
export const eliminarColaborador = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        error: 'Não podes eliminar-te a ti próprio',
      });
    }

    const user = await User.findOne({ _id: id, tenantId: req.tenantId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    }

    // Safety: só permitir hard delete se já estiver desactivado.
    // Força workflow: desativar → confirmar inactivo → eliminar definitivamente.
    if (user.ativo) {
      return res.status(400).json({
        success: false,
        error: 'Para eliminar, primeiro desactiva o colaborador. Isto evita eliminações acidentais.',
      });
    }

    await User.deleteOne({ _id: id, tenantId: req.tenantId });

    res.json({ success: true, data: { _id: id, deleted: true } });
  } catch (error) {
    console.error('Erro ao eliminar colaborador:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao eliminar colaborador' });
  }
};

// =============================================
// REENVIAR convite por email
// POST /api/users/:id/reenviar-convite
// Gera novo token, renova expiry e reenvia o email de definição de password.
// Só faz sentido para colaboradores activos e ainda sem email verificado.
// =============================================
export const reenviarConvite = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, tenantId: req.tenantId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    }

    if (!user.ativo) {
      return res.status(400).json({
        success: false,
        error: 'Colaborador está inactivo. Reactiva-o antes de reenviar o convite.',
      });
    }

    if (user.emailVerificado) {
      return res.status(400).json({
        success: false,
        error: 'Este colaborador já confirmou a conta. Não há convite pendente.',
      });
    }

    const { token, hash } = gerarTokenConvite();
    const tenant = await Tenant.findById(req.tenantId).select('nome');
    user.resetPasswordToken = hash;
    user.resetPasswordExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await user.save();

    let emailEnviado = true;
    try {
      await sendInvitationEmail(user.email, token, user.nome, tenant?.nome);
    } catch (emailErr) {
      console.error('Erro ao reenviar email de convite:', emailErr);
      emailEnviado = false;
    }

    res.json({
      success: true,
      data: user.toSafeObject(),
      meta: {
        emailEnviado,
        mensagem: emailEnviado
          ? 'Convite reenviado por email.'
          : 'Token actualizado mas o email falhou. Verifica configuração SMTP.',
      },
    });
  } catch (error) {
    console.error('Erro ao reenviar convite:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao reenviar convite' });
  }
};

// =============================================
// REACTIVAR colaborador
// PATCH /api/users/:id/ativar
// =============================================
export const ativarColaborador = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, tenantId: req.tenantId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    }

    // Limite do plano também aplica ao reactivar (não pode passar do max activos)
    const tenant = await Tenant.findById(req.tenantId).select('limites');
    // Convenção: maxUsuarios <= 0 ou null = ilimitado
    const limiteRaw = tenant?.limites?.maxUsuarios;
    const maxUsuarios = (limiteRaw == null || limiteRaw <= 0) ? Infinity : limiteRaw;
    const ativosActuais = await User.countDocuments({ tenantId: req.tenantId, ativo: true });
    if (!user.ativo && ativosActuais >= maxUsuarios) {
      return res.status(403).json({
        success: false,
        error: `Limite do plano atingido (${maxUsuarios} colaboradores activos). Desactiva outro antes de reactivar este.`,
      });
    }

    user.ativo = true;
    await user.save();

    res.json({ success: true, data: user.toSafeObject() });
  } catch (error) {
    console.error('Erro ao reactivar colaborador:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao reactivar colaborador' });
  }
};
