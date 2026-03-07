const express = require('express');
const router = express.Router();
const { createToken, getAuthConfig, isAuthEnabled, verifyPassword } = require('../auth');
const { requirePasswordLogin, sendValidationError } = require('../request');

router.post('/login', (req, res) => {
    if (!isAuthEnabled()) {
        return res.json({ success: true, data: { token: '', expires_in: 0, auth_disabled: true } });
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

const { verifyToken } = require('../auth');

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
