import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

/**
 * Campos derivados no servidor que o corpo do pedido nunca pode ditar
 * (RECONCILIATION R6/R7). São descartados ANTES da validação, para que um
 * cliente antigo que reenvie o documento inteiro não leve 400 — mas também
 * nunca consiga influenciar a prova. `tenantId`/`_id`/`__v`/timestamps já são
 * removidos pelo middleware `validate`.
 *
 * Um registo em que o cliente escolhe a versão da política, o hash do texto ou
 * se auto-declara "titular" não prova nada — daí a lista.
 */
const CAMPOS_SERVIDOR = ['versao', 'actor', 'textoHash', 'fichaTokenId', 'registadoPor', 'ip'];

const descartarCamposServidor = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const copia = { ...v };
  for (const chave of CAMPOS_SERVIDOR) delete copia[chave];
  return copia;
};

/** Registo de consentimento pelo painel (funcionário autenticado). */
export const registarConsentimentoSchema = z.preprocess(
  descartarCamposServidor,
  z
    .object({
      clienteId: objectId,
      // `politica_privacidade` não existe aqui: a entrega do aviso é um
      // NoticeReceipt, não um consentimento (R7).
      tipo: z.enum(['dados_saude', 'marketing', 'whatsapp_optin']),
      accao: z.enum(['granted', 'withdrawn']),
      origem: z.enum(['formulario', 'booking', 'whatsapp', 'painel']),
      evidencia: z.string().trim().min(1).max(500).optional(),
    })
    // Qualquer OUTRA chave desconhecida continua a dar 400 (apanha typos).
    .strict()
    .superRefine((data, ctx) => {
      // Concessão registada por funcionário é uma DECLARAÇÃO ASSISTIDA: tem de
      // dizer o que a suporta. Retirada não exige nada (Art. 7(3)).
      if (data.accao === 'granted' && !data.evidencia) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidencia'],
          message: 'obrigatória ao registar consentimento em nome do titular',
        });
      }
    })
);

/**
 * Query do histórico: cliente + paginação.
 * `limit` é LIMITADO a 100 (não rejeitado) — mesma convenção do resto da API.
 */
export const consentQuerySchema = z
  .object({
    clienteId: objectId,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).default(20).transform((v) => Math.min(v, 100)),
  })
  .strip();
