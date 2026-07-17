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
  // Express 5 define `query` como getter no prototype de req e re-parseia o URL a
  // CADA acesso, devolvendo um objecto novo de cada vez. Atribuir rebenta (getter
  // sem setter, ESM é strict) e mutar o que o getter devolve escreve num objecto
  // descartável — era assim que os defaults/coerções do Zod se perdiam a caminho
  // do controller. Definir uma propriedade própria sombreia o getter.
  Object.defineProperty(req, location, {
    value: result.data,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
};
