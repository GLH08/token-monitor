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

// Split a multi-key channel's `key` DB field into individual keys. Mirrors
// new-api model.Channel.GetKeys(): a value starting with '[' is parsed as a
// JSON array of keys (used by Vertex AI and any channel configured with an
// array); only a parse failure falls back to the newline-separated
// convention.
function splitChannelKeys(raw) {
    if (!raw || typeof raw !== 'string') {
        return [];
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
                    .filter((item) => typeof item === 'string' && item.trim())
                    .map((item) => item.trim());
            }
        } catch {
            // Not valid JSON: fall back to newline split below.
        }
    }
    return trimmed.split('\n').map((k) => k.trim()).filter(Boolean);
}

module.exports = { parseChannelInfo, splitChannelKeys };
