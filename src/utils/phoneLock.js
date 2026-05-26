const pending = new Map();
const STALE_MS = 30_000;

export async function withPhoneLock(telefone, fn) {
  while (pending.has(telefone)) {
    const entry = pending.get(telefone);
    if (Date.now() - entry.ts > STALE_MS) {
      pending.delete(telefone);
      break;
    }
    await entry.promise;
  }

  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  pending.set(telefone, { promise, ts: Date.now() });

  try {
    return await fn();
  } finally {
    pending.delete(telefone);
    resolve();
  }
}
