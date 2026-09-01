// In-flight guard for scheduled jobs. setInterval will happily fire its
// callback while a previous run is still pending, so a slow upstream query
// can stack callbacks and eventually starve the event loop. createJobGuard
// returns a wrapper that drops the new call (with a single warn line) when
// the previous one is still running, while still letting the next tick
// retry normally.
function createJobGuard({ name = 'job' } = {}) {
    let inFlight = false;
    return async function runGuarded(task) {
        if (inFlight) {
            console.warn(`[${name}] previous run still in flight, skipping tick`);
            return null;
        }
        inFlight = true;
        try {
            return await task();
        } finally {
            inFlight = false;
        }
    };
}

module.exports = { createJobGuard };
