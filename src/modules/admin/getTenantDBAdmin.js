import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import logger from '../../utils/logger.js';

/**
 * getTenantDBAdmin — acessor read-only do painel super-admin para as DBs de
 * tenant (`tenant_<id>`). É o ÚNICO caminho sancionado para o painel ler dados
 * dentro de um tenant (Gate 4b, ADR-024).
 *
 * - Usa uma **conexão SEPARADA** (`createConnection(MONGO_TENANT_RO_URI)`), com
 *   credencial **read-only** — NUNCA a `mongoose.connection` principal (que é
 *   read-write e partilha o pool do produto). É a separação que torna o painel
 *   incapaz de escrever em dados de tenant — imposto pelo Mongo, não por disciplina.
 * - É **fail-closed**: sem `MONGO_TENANT_RO_URI`, lança. Nunca cai para a conexão
 *   principal (isso seria fail-open e derrotava o Gate 4b).
 * - `getTenantDBAdmin` só pode ser importado dentro de `src/modules/admin/`
 *   (eslint `no-restricted-imports`).
 *
 * ## Verificação em runtime da credencial RO (Gate 4b — F14)
 *
 * O Gate 4b só é tão forte quanto a credencial por trás de `MONGO_TENANT_RO_URI`.
 * Se esse URI for (mal)configurado com uma credencial **read-write**, o painel
 * passa silenciosamente a poder escrever nas DBs de tenant e nada o deteta. Por
 * isso o arranque chama `verifyTenantROEnforcement()`, que prova o read-only em
 * DUAS camadas:
 *   1. **Enumeração de privilégios** (`connectionStatus` + `showPrivileges`, sem
 *      escrita): afirma que a credencial não tem NENHUMA acção de escrita sobre um
 *      recurso que abranja dados de tenant (`tenant_*`, todas as DBs `db:''`,
 *      `anyResource` ou `cluster`). Apanha o caso que o canário sozinho não cobre —
 *      uma credencial que pode escrever num `tenant_<id>` real mas não na
 *      DB-sentinela do canário (as permissões Mongo são por-recurso; não há
 *      wildcard `tenant_*`).
 *   2. **Canário de escrita** (confirmação): tenta um insert numa DB-sentinela e
 *      **espera ser recusado** por autorização.
 * Se qualquer camada detectar capacidade de escrita, marca `roCompromised` e
 * `getTenantDBAdmin` passa a recusar TODAS as leituras cross-tenant (fail-closed).
 *
 * ### Setup Atlas necessário
 *
 * `MONGO_TENANT_RO_URI` tem de ser um **utilizador de BD dedicado** (nunca o
 * utilizador read-write do produto) com **apenas leitura**. Como as DBs de tenant
 * (`tenant_<id>`) são criadas dinamicamente, não há forma de conceder `read` por
 * padrão de nome `tenant_*`; usa-se a built-in role **`readAnyDatabase`** (ou uma
 * custom role equivalente só com acções de leitura). O que importa é que a
 * credencial **não tenha nenhuma acção de escrita** — é isso que
 * `verifyTenantROEnforcement()` prova em runtime. Ver o passo 1 do runbook
 * `deploy/RUNBOOK-PAINEL-SUPERADMIN.md` (que descreve o mesmo modelo).
 *
 * Mutações continuam proibidas no painel (Fase 3): esta conexão é só leitura.
 */
let roConnection = null;

// Namespace sentinela que nenhum tenant real usa. O canário nunca chega a criar
// esta DB quando a credencial está correta — o insert é recusado antes de escrever.
const CANARY_DB = 'tenant_ro_canary';
const CANARY_COLLECTION = 'ro_canary';

// Flag module-level: fica `true` se a verificação em runtime provar que a
// credencial de `MONGO_TENANT_RO_URI` aceita escritas (Gate 4b comprometido).
// Consultada por `getTenantDBAdmin` — fail-closed sem derrubar o produto.
let roCompromised = false;

function getRoConnection() {
  const uri = process.env.MONGO_TENANT_RO_URI;
  if (!uri) {
    throw new Error(
      'MONGO_TENANT_RO_URI não definido — getTenantDBAdmin é fail-closed e não usa a conexão principal.'
    );
  }
  if (!roConnection) {
    roConnection = mongoose.createConnection(uri);
  }
  return roConnection;
}

/**
 * Distingue um erro de **autorização** do Mongo (credencial RO a recusar a
 * escrita — o resultado saudável) de qualquer outro erro (rede, timeout, ...).
 * Duck-typed de propósito: aceita tanto `MongoServerError` reais como objetos de
 * erro sintetizados nos testes com a mesma forma.
 */
function isAuthorizationError(err) {
  if (!err) return false;
  if (err.code === 13) return true;
  if (err.codeName === 'Unauthorized') return true;
  return typeof err.message === 'string' && /not authorized/i.test(err.message);
}

/**
 * Acções que representam ESCRITA. Concedidas sobre um recurso de tenant, provam
 * que a credencial não é read-only. Lista deliberadamente abrangente.
 */
const WRITE_ACTIONS = new Set([
  'insert',
  'update',
  'remove',
  'createCollection',
  'createIndex',
  'dropCollection',
  'dropIndex',
  'dropDatabase',
  'renameCollectionSameDB',
  'emptycapped',
  'collMod',
  'convertToCapped',
]);

/**
 * Um recurso do `connectionStatus` abrange dados de tenant se for a própria DB
 * `tenant_<id>`, OU abranger todas as bases normais (`db: ''`, ex.:
 * `readWriteAnyDatabase`), OU for `anyResource`/`cluster`. Bases de control-plane
 * (ex.: `laura-saas`) não contam — o Gate 4b protege dados DE TENANT.
 */
function resourceCoversTenantData(resource) {
  if (!resource || typeof resource !== 'object') return false;
  if (resource.anyResource === true) return true;
  if (resource.cluster === true) return true;
  if (typeof resource.db === 'string') {
    if (resource.db === '') return true; // todas as DBs normais
    if (resource.db.startsWith('tenant_')) return true;
  }
  return false;
}

/**
 * true se os privilégios efectivos concedem QUALQUER acção de escrita sobre um
 * recurso que abranja dados de tenant. É o que apanha o cenário que o canário
 * sozinho não deteta: uma credencial que escreve num `tenant_<id>` real mas não
 * na DB-sentinela do canário. Exportada para teste unitário.
 */
export function privilegesGrantTenantWrite(privileges) {
  if (!Array.isArray(privileges)) return false;
  return privileges.some(
    (p) =>
      p &&
      resourceCoversTenantData(p.resource) &&
      Array.isArray(p.actions) &&
      p.actions.some((a) => WRITE_ACTIONS.has(a))
  );
}

/**
 * Lê os privilégios efectivos da conexão RO via `connectionStatus`
 * (`showPrivileges`). Comando diagnóstico disponível a qualquer utilizador
 * autenticado, sem privilégio extra e sem escrita; funciona no Atlas.
 * É o default do seam `getEffectivePrivileges` de `verifyTenantROEnforcement`.
 */
async function defaultGetEffectivePrivileges() {
  const conn = getRoConnection();
  await conn.asPromise();
  const adminDb = conn.useDb('admin', { useCache: true });
  if (!adminDb.db) {
    await adminDb.asPromise();
  }
  const res = await adminDb.db.command({ connectionStatus: 1, showPrivileges: true });
  return res?.authInfo?.authenticatedUserPrivileges ?? [];
}

/**
 * Obtém a colecção nativa do canário via driver MongoDB (não via model Mongoose).
 * `useDb(CANARY_DB).db` aponta a `Db` nativa scoped a `tenant_ro_canary`
 * (`_setClient` faz `conn.db = client.db(dbName)`); `db.collection(...)` devolve a
 * colecção nativa com `insertOne`/`deleteOne`.
 */
async function defaultGetCanaryCollection() {
  const conn = getRoConnection();
  await conn.asPromise();
  const canaryDb = conn.useDb(CANARY_DB, { useCache: true });
  if (!canaryDb.db) {
    await canaryDb.asPromise();
  }
  return canaryDb.db.collection(CANARY_COLLECTION);
}

/**
 * Marca o Gate 4b como comprometido: recusa futuras leituras cross-tenant e
 * grita (log `error` + Sentry). Chamado tanto pela enumeração de privilégios como
 * pelo canário de escrita.
 */
function markROCompromised(motivo) {
  roCompromised = true;
  const err = new Error(
    `Gate 4b COMPROMETIDO: ${motivo}. A credencial do painel super-admin tem ` +
      'permissões de escrita nas DBs de tenant. As leituras cross-tenant do painel ' +
      'foram desactivadas (fail-closed). Corrigir a credencial Atlas para leitura apenas.'
  );
  logger.error({ err }, 'Gate 4b COMPROMETIDO — credencial RO aceita escrita');
  Sentry.captureException(err);
}

/**
 * verifyTenantROEnforcement — prova em runtime que `MONGO_TENANT_RO_URI` é
 * read-only. Chamado uma vez no arranque (`src/server.js`).
 *
 * **Fail-closed mas NÃO fatal:** nunca lança nem derruba o backend. Uma credencial
 * partida só desliga as leituras cross-tenant do painel — os tenants continuam a
 * funcionar. Duas camadas:
 *   1. Enumeração de privilégios (sem escrita): se conceder escrita sobre um
 *      recurso de tenant → `roCompromised = true`.
 *   2. Canário de escrita na DB-sentinela: insert RECUSADO por autorização →
 *      credencial RO (log `info`); insert com SUCESSO → escrita → comprometido
 *      (apaga o canário best-effort); erro de rede/outro → inconclusivo (log
 *      `warn`, não marca comprometido).
 *
 * Os parâmetros `getEffectivePrivileges`/`getCanaryCollection` são seams
 * **só-para-testes**; em produção usam os defaults nativos.
 */
export async function verifyTenantROEnforcement({
  getEffectivePrivileges = defaultGetEffectivePrivileges,
  getCanaryCollection = defaultGetCanaryCollection,
} = {}) {
  // Camada 1 — enumeração de privilégios (sem escrita). Apanha escrita em QUALQUER
  // recurso de tenant, incluindo um `tenant_<id>` real fora da DB-sentinela.
  try {
    const privileges = await getEffectivePrivileges();
    if (privilegesGrantTenantWrite(privileges)) {
      markROCompromised('os privilégios efectivos concedem escrita em dados de tenant');
      return;
    }
  } catch (err) {
    // connectionStatus indisponível/erro de rede: inconclusivo — segue para o canário.
    logger.warn(
      { err },
      'Gate 4b: enumeração de privilégios inconclusiva — a confirmar pelo canário de escrita'
    );
  }

  // Camada 2 — canário de escrita (confirmação).
  let collection;
  try {
    collection = await getCanaryCollection();
  } catch (err) {
    logger.warn(
      { err },
      'Gate 4b: verificação RO inconclusiva (falha ao abrir a conexão RO) — roCompromised mantém-se false'
    );
    return;
  }

  try {
    await collection.insertOne({ canary: true, at: new Date() });
  } catch (err) {
    if (isAuthorizationError(err)) {
      // Resultado esperado: a credencial RO recusou a escrita.
      logger.info('Gate 4b verificado: credencial RO recusa escrita');
      return;
    }
    // Rede/timeout/outro erro → NÃO prova nada. Não marca verificado nem comprometido.
    logger.warn(
      { err },
      'Gate 4b: verificação RO inconclusiva (erro não-autorização no insert do canário) — roCompromised mantém-se false'
    );
    return;
  }

  // O insert PASSOU → a credencial tem permissões de escrita na DB-sentinela.
  // Best-effort: apagar o canário para não deixar lixo na sentinela.
  await collection.deleteOne({ canary: true }).catch(() => {});
  markROCompromised('MONGO_TENANT_RO_URI aceitou uma escrita no canário');
}

export function getTenantDBAdmin(tenantId) {
  if (roCompromised) {
    throw new Error(
      'MONGO_TENANT_RO_URI tem permissões de escrita — Gate 4b comprometido; painel recusa leituras cross-tenant.'
    );
  }
  if (!tenantId) {
    throw new Error('getTenantDBAdmin: tenantId obrigatório');
  }
  // useDb na conexão RO separada — muda só o namespace, mantém a credencial read-only.
  return getRoConnection().useDb(`tenant_${tenantId}`, { useCache: true });
}

/**
 * Fecha a conexão RO. Usado pelos testes (afterAll/afterEach) para não deixar
 * handles abertos no Jest. Em produção a conexão vive o processo todo.
 *
 * **NÃO repõe `roCompromised`:** uma credencial provada como read-write deve
 * continuar a recusar leituras cross-tenant até um novo arranque re-correr
 * `verifyTenantROEnforcement()` — fechar/reabrir a conexão não re-verifica, e
 * limpar a flag aqui seria fail-open silencioso. Os testes usam `_resetROState()`.
 */
export async function closeTenantDBAdmin() {
  if (roConnection) {
    await roConnection.close();
    roConnection = null;
  }
}

/**
 * _resetROState — só-para-testes. Repõe a flag `roCompromised` para exercitar os
 * dois caminhos (comprometido / saudável) sem reabrir a conexão.
 */
export function _resetROState() {
  roCompromised = false;
}

export default getTenantDBAdmin;
