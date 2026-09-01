// Lightweight in-memory rate limiter (sliding window). The auth surface is
// small enough (single shared password) that pulling in express-rate-limit
// is overkill, but online guessing is still trivial without throttling.
//
// Usage:
//   const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
//   const attempt = limiter.take(clientKey);
//   if (!attempt.allowed) return res.status(429).json(...);
//
// State is process-local; if the dashboard ever runs multi-instance, swap
// this for a shared store. Keys older than windowMs are evicted lazily on
// take() so memory stays bounded under sustained load.
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
    const buckets = new Map();

    function evict(now) {
        const cutoff = now - windowMs;
        for (const [key, timestamps] of buckets) {
            const fresh = timestamps.filter((t) => t > cutoff);
            if (fresh.length === 0) {
                buckets.delete(key);
            } else {
                buckets.set(key, fresh);
            }
        }
    }

    return {
        take(key) {
            const now = Date.now();
            evict(now);
            const cutoff = now - windowMs;
            const existing = (buckets.get(key) || []).filter((t) => t > cutoff);
            if (existing.length >= max) {
                const oldest = existing[0];
                const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
                buckets.set(key, existing);
                return { allowed: false, retryAfterSec, remaining: 0 };
            }
            existing.push(now);
            buckets.set(key, existing);
            return {
                allowed: true,
                retryAfterSec: 0,
                remaining: Math.max(0, max - existing.length)
            };
        }
    };
}

module.exports = { createRateLimiter };
