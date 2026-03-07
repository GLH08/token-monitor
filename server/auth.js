const crypto = require('crypto');

const AUTH_TTL_SECONDS = Number.parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || '28800', 10);
const AUTH_VERSION = 'v1';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET || ACCESS_PASSWORD || null;

function getAuthConfig() {
    return {
        enabled: Boolean(ACCESS_PASSWORD),
        expiresIn: AUTH_TTL_SECONDS
    };
}

function isAuthEnabled() {
    return getAuthConfig().enabled;
}

function getSigningSecret() {
    if (!AUTH_SECRET) {
        throw new Error('AUTH_SECRET or ACCESS_PASSWORD must be configured when auth is enabled');
    }
    return AUTH_SECRET;
}

function sign(payload) {
    return crypto
        .createHmac('sha256', getSigningSecret())
        .update(payload)
        .digest('base64url');
}

function createToken() {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + AUTH_TTL_SECONDS;
    const nonce = crypto.randomBytes(12).toString('base64url');
    const payload = [AUTH_VERSION, issuedAt, expiresAt, nonce].join('.');
    return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'missing' };
    }

    const parts = token.split('.');
    if (parts.length !== 5) {
        return { valid: false, reason: 'format' };
    }

    const [version, issuedAtRaw, expiresAtRaw, nonce, signature] = parts;
    if (version !== AUTH_VERSION || !nonce || !signature) {
        return { valid: false, reason: 'format' };
    }

    const issuedAt = Number.parseInt(issuedAtRaw, 10);
    const expiresAt = Number.parseInt(expiresAtRaw, 10);
    if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt)) {
        return { valid: false, reason: 'format' };
    }

    const payload = [version, issuedAt, expiresAt, nonce].join('.');
    const expectedSignature = sign(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return { valid: false, reason: 'signature' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now) {
        return { valid: false, reason: 'expired' };
    }

    return {
        valid: true,
        payload: {
            issuedAt,
            expiresAt
        }
    };
}

function verifyPassword(password) {
    if (!ACCESS_PASSWORD) {
        return true;
    }
    if (typeof password !== 'string') {
        return false;
    }

    const inputBuffer = Buffer.from(password);
    const passwordBuffer = Buffer.from(ACCESS_PASSWORD);
    if (inputBuffer.length !== passwordBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(inputBuffer, passwordBuffer);
}

module.exports = {
    createToken,
    getAuthConfig,
    isAuthEnabled,
    verifyPassword,
    verifyToken
};
