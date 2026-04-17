import Redis from 'ioredis';
import logger from '../utils/logger.js';

let redisConnection = null;

export function getRedisConnection() {
  if (redisConnection) return redisConnection;

  if (!process.env.REDIS_URL) {
    logger.warn('[Redis] REDIS_URL não configurada — notificações por fila desactivadas');
    return null;
  }

  redisConnection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // obrigatório para BullMQ
    enableReadyCheck: false,
    tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
  });

  redisConnection.on('connect', () => logger.info('[Redis] Ligado ao Upstash Redis'));
  redisConnection.on('error', (err) => logger.error({ err }, '[Redis] Erro de ligação'));

  return redisConnection;
}
