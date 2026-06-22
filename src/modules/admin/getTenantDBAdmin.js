import mongoose from 'mongoose';

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
 * Mutações continuam proibidas no painel (Fase 3): esta conexão é só leitura.
 */
let roConnection = null;

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

export function getTenantDBAdmin(tenantId) {
  if (!tenantId) {
    throw new Error('getTenantDBAdmin: tenantId obrigatório');
  }
  // useDb na conexão RO separada — muda só o namespace, mantém a credencial read-only.
  return getRoConnection().useDb(`tenant_${tenantId}`, { useCache: true });
}

/**
 * Fecha a conexão RO. Usado pelos testes (afterAll) para não deixar handles
 * abertos no Jest. Em produção a conexão vive o processo todo.
 */
export async function closeTenantDBAdmin() {
  if (roConnection) {
    await roConnection.close();
    roConnection = null;
  }
}

export default getTenantDBAdmin;
