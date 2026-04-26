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
export const validate = (schema, location = 'body') => (req, res, next) => {
  // Express 5 + body-parser 2.x: req.body é undefined quando POST/PATCH chega sem corpo.
  // Schemas com todos os campos opcionais (ex: enviarLembreteSchema) devem aceitar isto.
  const data = req[location] ?? (location === 'body' ? {} : req[location]);
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({
      success: false,
      error: `${path}${first.message}`,
    });
  }
  req[location] = result.data;
  next();
};
