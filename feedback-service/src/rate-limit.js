export function createRateLimiter({
  max = 10,
  windowMs = 60 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const clients = new Map();
  return {
    consume(clientId) {
      const key = String(clientId || "anonymous").slice(0, 200);
      const current = now();
      const existing = clients.get(key);
      const entry = !existing || current - existing.startedAt >= windowMs
        ? { startedAt: current, count: 0 }
        : existing;
      entry.count += 1;
      clients.set(key, entry);
      if (clients.size > 5000) {
        for (const [storedKey, stored] of clients) {
          if (current - stored.startedAt >= windowMs) clients.delete(storedKey);
        }
      }
      return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retryAfterMs: Math.max(0, windowMs - (current - entry.startedAt)),
      };
    },
  };
}
