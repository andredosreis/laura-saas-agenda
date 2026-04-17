import { Queue } from 'bullmq';
import { getRedisConnection } from './redisConnection.js';

let notificationQueue = null;

export function getNotificationQueue() {
  if (notificationQueue) return notificationQueue;

  const connection = getRedisConnection();
  if (!connection) return null;

  notificationQueue = new Queue('notifications', {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });

  return notificationQueue;
}
