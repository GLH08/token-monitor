function parseChannelInfo(raw) {
    if (!raw) {
        return null;
    }

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
}

module.exports = { parseChannelInfo };
