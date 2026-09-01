const express = require('express');
const router = express.Router();
const { createToken, getAuthConfig, isAuthEnabled, verifyPassword, verifyToken } = require('../auth');
const { requirePasswordLogin, sendValidationError } = require('../request');
const { createRateLimiter } = require('../rateLimiter');

// The dashboard has a single shared password; without throttling it can be
// guessed at unlimited rate (timingSafeEqual only prevents timing leaks, not
// online guessing). 10 attempts / 15 min / client IP. Note: behind a reverse
// proxy set app.set('trust proxy', ...) so req.ip is the real client.
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/login', (req, res) => {
    if (!isAuthEnabled()) {
        return res.json({ success: true, data: { token: '', expires_in: 0, auth_disabled: true } });
    }

    const clientKey = req.ip || req.socket?.remoteAddress || 'unknown';
    const attempt = loginLimiter.take(clientKey);
    if (!attempt.allowed) {
        const minutes = Math.max(1, Math.ceil(attempt.retryAfterSec / 60));
        return res.status(429).json({ error: `尝试过于频繁，请 ${minutes} 分钟后再试` });
    }

    const payload = requirePasswordLogin(req.body);
    if (!payload) {
        return sendValidationError(res, 'Invalid login payload');
    }

    if (!verifyPassword(payload.password)) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = createToken();
    const authConfig = getAuthConfig();
    return res.json({
        success: true,
        data: {
            token,
            expires_in: authConfig.expiresIn
        }
    });
});

router.post('/logout', (req, res) => {
    res.json({ success: true });
});

router.get('/config', (req, res) => {
    res.json({
        success: true,
        data: getAuthConfig()
    });
});


const authMiddleware = (req, res, next) => {
    if (!isAuthEnabled()) return next();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.slice('Bearer '.length).trim();
    const verification = verifyToken(token);
    if (!verification.valid) return res.status(401).json({ error: verification.reason === 'expired' ? 'Session expired' : 'Unauthorized' });
    req.auth = verification.payload;
    next();
};

router.get('/me', authMiddleware, (req, res) => {
    const authConfig = getAuthConfig();
    res.json({
        success: true,
        data: {
            authenticated: true,
            expires_in: authConfig.expiresIn,
            expires_at: req.auth?.expiresAt || null
        }
    });
});

module.exports = router;
