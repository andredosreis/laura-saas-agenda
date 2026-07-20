import crypto from 'crypto';

/**
 * Versão da política de privacidade em vigor.
 *
 * Constante global por agora (a política é do Marcai enquanto subcontratante).
 * Pode passar a ser por tenant quando cada clínica tiver a sua — o modelo
 * guarda `versao` como string em qualquer dos casos.
 *
 * ⚠️ Ao publicar uma política nova: incrementar esta versão. As entradas de
 * consentimento antigas continuam a apontar para a versão que o titular viu,
 * que é exactamente o que dá valor probatório ao registo.
 */
export const POLICY_VERSION = '2026-06-25';

/**
 * Texto de referência da política em vigor.
 *
 * ⚠️ PLACEHOLDER — a redacção final do aviso Art. 13 (responsável, finalidades,
 * bases legais, destinatários, transferências, retenção, direitos + CNPD,
 * contacto) está pendente de revisão por jurista de protecção de dados PT
 * (ver `docs/operacoes/rgpd-perguntas-jurista.md`, bloco F.1).
 *
 * A F04 constrói o aviso completo interpolado por tenant e passa o texto
 * EFECTIVAMENTE APRESENTADO a `noticeHash()`. Até lá, o registo feito pelo
 * painel carimba o hash deste texto de referência, para que `textoHash` nunca
 * fique vazio — o campo é obrigatório no modelo.
 */
export const POLICY_TEXT_REFERENCIA = [
  `Política de privacidade — versão ${POLICY_VERSION}.`,
  'A clínica é a responsável pelo tratamento dos seus dados pessoais.',
  'Texto integral pendente de validação jurídica.',
].join('\n');

/**
 * sha256 do texto de consentimento/aviso apresentado ao titular.
 *
 * Guardar o hash (e não o texto inteiro) em cada entrada permite provar, mais
 * tarde, EXACTAMENTE o que a pessoa viu quando consentiu, sem duplicar o texto
 * em milhares de documentos.
 *
 * @param {string} [texto] texto apresentado; por omissão, o de referência
 * @returns {string} hash prefixado com o algoritmo (ex.: `sha256:9f2c...`)
 */
export const noticeHash = (texto = POLICY_TEXT_REFERENCIA) =>
  `sha256:${crypto.createHash('sha256').update(String(texto), 'utf8').digest('hex')}`;
