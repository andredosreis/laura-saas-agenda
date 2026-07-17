import mongoose from 'mongoose';
import AuditLog from '../../models/AuditLog.js';
import logger from '../../utils/logger.js';

/**
 * adminMutation(action, work) — factory de mutação auditada (Gate 2, ADR-024 Fase 3).
 *
 * Única forma permitida de mutar no painel super-admin (Gate 4 / #9 do ESLint:
 * `router.post/put/patch/delete` cru em `src/modules/admin/` é erro de lint).
 *
 * `work(req, { session })` corre dentro da transação e devolve
 * `{ data, targetTenantId, targetResourceId?, before?, after?, metadata?, afterCommit? }`.
 * Contém SÓ operações de DB — `session.withTransaction` pode re-executar o callback
 * em erros transientes, pelo que um side-effect externo (ex: envio de email,
 * Evolution API) NUNCA deve correr dentro de `work`. Devolve-o em `afterCommit`:
 * uma função disparada UMA só vez depois do commit, fora da transação.
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
  const base = {
    actorUserId: req.user.userId || req.user._id,
    actorEmail: req.user.email,
    action,
    ip: req.ip,
  };
  let targetTenantId = null;
  // startSession() DENTRO do try: se o Mongo estiver indisponível, a rejeição
  // tem de chegar ao catch → next(err), senão o middleware rejeita silenciosamente
  // e um `next` compensatório (ex.: logout da instância órfã no F21) nunca corre.
  let session;

  try {
    let payload;
    let afterCommit = null;

    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      const ctx = await work(req, { session });
      payload = ctx.data;
      targetTenantId = ctx.targetTenantId ?? null;
      // Side-effect pós-commit: capturado aqui, mas só disparado após o commit.
      // Em retry transitório só o valor da última execução (a que commitou) sobrevive.
      afterCommit = ctx.afterCommit ?? null;

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

    // Side-effects pós-commit (fora da transação, disparados uma só vez).
    // Fire-and-forget: não atrasam a resposta nem revertem o commit se falharem.
    if (afterCommit) {
      Promise.resolve()
        .then(afterCommit)
        .catch((e) => logger.error('adminMutation afterCommit falhou:', e.message));
    }
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
    // session pode não existir se o próprio startSession() rejeitou.
    if (session) await session.endSession();
  }
};

export default adminMutation;
