import mongoose from 'mongoose';

// Cache de conexões por tenant (Map: dbName → mongoose Connection)
const connectionCache = new Map();

/**
 * Retorna uma conexão isolada para a base de dados do tenant.
 * Usa mongoose.connection.useDb() que reutiliza o mesmo connection pool
 * mas muda o namespace da DB — sem criar novas ligações TCP.
 *
 * @param {string} tenantId
 * @returns {mongoose.Connection}
 */
export function getTenantDB(tenantId) {
  const dbName = `tenant_${tenantId}`;

  if (!connectionCache.has(dbName)) {
    // useCache: true → se já existe uma useDb para este nome, reutiliza
    const db = mongoose.connection.useDb(dbName, { useCache: true });
    connectionCache.set(dbName, db);
  }

  return connectionCache.get(dbName);
}
