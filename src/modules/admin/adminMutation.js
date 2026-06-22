import mongoose from 'mongoose';
import AuditLog from '../../models/AuditLog.js';

/**
 * adminMutation(action, work) — factory de mutação auditada (Gate 2, ADR-024 Fase 3).
 *
 * Única forma permitida de mutar no painel super-admin (Gate 4 / #9 do ESLint:
 * `router.post/put/patch/delete` cru em `src/modules/admin/` é erro de lint).
 *
 * `work(req, { session })` corre dentro da transação e devolve
 * `{ data, targetTenantId, targetResourceId?, before?, after? }`. Contém SÓ
 * operações de DB — `session.withTransaction` pode re-executar o callback em
 * erros transientes, pelo que um side-effect externo (ex: Evolution API) tem de
 * ficar fora da transação e ser idempotente.
 *
 * Sucesso: a mutação e a entrada `AuditLog` (`status: 'ok'`) commitam juntas,
 * na mesma `session` — atómico. Falha: nada é commitado e regista-se, fora da
 * transação, uma entrada best-effort `status: 'error'`. Em ambos os casos
 * `req.audit.committed = true` evita a escrita duplicada do `auditMiddleware`.
 *
 * Restrito ao control-plane (`laura-saas`: Tenant/User/UserSubscription) — uma
 * transação só é atómica numa única conexão, e é nessa conexão que vive o
 * AuditLog.
 */
export const adminMutation = (action, work) => async (req, res, next) => {
  const session = await mongoose.startSession();
  const base = {
    actorUserId: req.user.userId || req.user._id,
    actorEmail: req.user.email,
    action,
    ip: req.ip,
  };
  let targetTenantId = null;

  try {
    let payload;

    await session.withTransaction(async () => {
      const ctx = await work(req, { session });
      payload = ctx.data;
      targetTenantId = ctx.targetTenantId ?? null;

      await AuditLog.create(
        [
          {
            ...base,
            status: 'ok',
            targetTenantId,
            before: ctx.before ?? null,
            after: ctx.after ?? null,
            metadata: {
              ...(ctx.targetResourceId ? { targetResourceId: ctx.targetResourceId } : {}),
              ...(ctx.metadata ?? {}),
            },
          },
        ],
        { session }
      );
    });

    req.audit.committed = true;
    res.json({ success: true, data: payload });
  } catch (err) {
    await AuditLog.create({
      ...base,
      status: 'error',
      targetTenantId,
      metadata: { message: err.message },
    }).catch(() => {});

    req.audit.committed = true;
    next(err);
  } finally {
    await session.endSession();
  }
};

export default adminMutation;
