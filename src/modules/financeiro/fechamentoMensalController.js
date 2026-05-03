import { gerarSnapshotMensal } from './services/snapshotService.js';

// @desc    Cria/re-fecha snapshot mensal (soft close — não bloqueia mutações).
//          Re-fechar incrementa `versao` atomicamente via $inc + upsert.
// @route   POST /api/fechamentos-mensais
// @access  admin
export const criarFechamento = async (req, res) => {
  try {
    const { FechamentoMensal } = req.models;
    const { ano, mes, observacoes } = req.body;

    const snapshot = await gerarSnapshotMensal(req.models, req.tenantId, ano, mes);

    // Upsert idempotente: $set para todos os campos calculados, $inc para versao,
    // $setOnInsert para campos imutáveis (criadoEm, fechadoPor inicial).
    const fechamento = await FechamentoMensal.findOneAndUpdate(
      { tenantId: req.tenantId, ano, mes },
      {
        $set: {
          ...snapshot,
          observacoes: observacoes || '',
          fechadoPor: req.user.userId,
          fechadoEm: new Date(),
          // Re-fechar limpa o flag stale — utilizador acabou de revalidar
          stale: { desde: null, transacoesIds: [] },
        },
        $setOnInsert: {
          tenantId: req.tenantId,
          ano,
          mes,
          criadoEm: new Date(),
        },
        $inc: { versao: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, data: fechamento });
  } catch (err) {
    console.error('[criarFechamento]', err);
    res.status(500).json({ success: false, error: 'Erro ao gerar fechamento mensal' });
  }
};

// @desc    Lista fechamentos do tenant. Filtro opcional por `ano`. Paginada.
// @route   GET /api/fechamentos-mensais
// @access  authenticated
export const listarFechamentos = async (req, res) => {
  try {
    const { FechamentoMensal } = req.models;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 24);
    const skip  = (page - 1) * limit;

    const filtro = { tenantId: req.tenantId };
    if (req.query.ano) filtro.ano = parseInt(req.query.ano);

    const [data, total] = await Promise.all([
      FechamentoMensal.find(filtro)
        .sort({ ano: -1, mes: -1 })
        .skip(skip)
        .limit(limit),
      FechamentoMensal.countDocuments(filtro),
    ]);

    res.json({
      success: true,
      data,
      pagination: { total, page, pages: Math.ceil(total / limit), limit },
    });
  } catch (err) {
    console.error('[listarFechamentos]', err);
    res.status(500).json({ success: false, error: 'Erro ao listar fechamentos' });
  }
};

// @desc    Obtém fechamento de um (ano, mes) específico.
//          Recurso de outro tenant → 404 (não revelar existência).
// @route   GET /api/fechamentos-mensais/:ano/:mes
// @access  authenticated
export const obterFechamento = async (req, res) => {
  try {
    const { FechamentoMensal } = req.models;
    const ano = parseInt(req.params.ano);
    const mes = parseInt(req.params.mes);

    const fechamento = await FechamentoMensal.findOne({ tenantId: req.tenantId, ano, mes });
    if (!fechamento) {
      return res.status(404).json({ success: false, error: 'Fechamento não encontrado' });
    }

    res.json({ success: true, data: fechamento });
  } catch (err) {
    console.error('[obterFechamento]', err);
    res.status(500).json({ success: false, error: 'Erro ao obter fechamento' });
  }
};

// @desc    Remove um fechamento. Soft close: utilizador pode re-fechar depois.
// @route   DELETE /api/fechamentos-mensais/:ano/:mes
// @access  admin
export const removerFechamento = async (req, res) => {
  try {
    const { FechamentoMensal } = req.models;
    const ano = parseInt(req.params.ano);
    const mes = parseInt(req.params.mes);

    const result = await FechamentoMensal.findOneAndDelete({ tenantId: req.tenantId, ano, mes });
    if (!result) {
      return res.status(404).json({ success: false, error: 'Fechamento não encontrado' });
    }

    res.json({ success: true, data: { ano, mes, removido: true } });
  } catch (err) {
    console.error('[removerFechamento]', err);
    res.status(500).json({ success: false, error: 'Erro ao remover fechamento' });
  }
};
