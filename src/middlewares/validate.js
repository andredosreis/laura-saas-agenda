/**
 * Middleware de validação Zod.
 *
 * Uso:
 *   router.post('/', validate(createClienteSchema), ctrl.criar);
 *   router.get('/:id', validate(objectIdParamSchema, 'params'), ctrl.obter);
 *   router.get('/', validate(listQuerySchema, 'query'), ctrl.listar);
 *
 * Em sucesso, substitui req.<location> pelos dados já parseados (com coerções
 * aplicadas). Em falha, responde 400 seguindo o contrato `{ success, error }`.
 */

// Campos geridos pelo servidor que nunca devem vir do cliente. Alguns clientes
// (ex.: PWA com bundle antigo em cache) reenviam o documento Mongo inteiro no
// body — removemos estes antes de validar para não disparar `.strict()` por algo
// inofensivo. tenantId vem sempre do JWT; _id/__v/timestamps são do servidor.
const SERVER_MANAGED_KEYS = ['_id', 'tenantId', '__v', 'createdAt', 'updatedAt'];

export const validate = (schema, location = 'body') => (req, res, next) => {
  // Express 5 + body-parser 2.x: req.body é undefined quando POST/PATCH chega sem corpo.
  // Schemas com todos os campos opcionais (ex: enviarLembreteSchema) devem aceitar isto.
  let data = req[location] ?? (location === 'body' ? {} : req[location]);
  // Só no body: descartar campos geridos pelo servidor (cópia — não mutar o original).
  if (location === 'body' && data && typeof data === 'object' && !Array.isArray(data)) {
    data = { ...data };
    for (const key of SERVER_MANAGED_KEYS) delete data[key];
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({
      success: false,
      error: `${path}${first.message}`,
    });
  }
  // Express 5: req.query é getter-only, não pode ser atribuído. Mutamos em vez.
  // Para body/params a atribuição directa funciona.
  try {
    req[location] = result.data;
  } catch (err) {
    if (req[location] && typeof req[location] === 'object') {
      Object.keys(req[location]).forEach((k) => { delete req[location][k]; });
      Object.assign(req[location], result.data);
    } else {
      throw err;
    }
  }
  next();
};
