const express = require('express');
const router = express.Router();
const db = require('../db');
const { parseAlertBody, parseOptionalId, sendValidationError } = require('../request');
const { getAlertHistory, ALERT_TYPES } = require('../alerter');

router.get('/', async (req, res) => {
    try {
        const rows = await db.allAsync("SELECT * FROM alerts ORDER BY id DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const payload = parseAlertBody(req.body);
    if (!payload) {
        return sendValidationError(res, 'Invalid alert payload');
    }

    try {
        const result = await db.runAsync(
            `INSERT INTO alerts (name, rule, enabled, start_time, end_time, notify_telegram, trigger_action, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [payload.name, JSON.stringify(payload.rule), payload.enabled ? 1 : 0, payload.start_time, payload.end_time, payload.notify_telegram ? 1 : 0, payload.trigger_action, Math.floor(Date.now() / 1000)]
        );
        res.json({ id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const alertId = parseOptionalId(req.params.id);
    const payload = parseAlertBody(req.body);
    if (alertId === null || !payload) {
        return sendValidationError(res, 'Invalid alert payload');
    }

    try {
        await db.runAsync(
            `UPDATE alerts SET name = ?, rule = ?, enabled = ?, start_time = ?, end_time = ?, notify_telegram = ?, trigger_action = ? WHERE id = ?`,
            [payload.name, JSON.stringify(payload.rule), payload.enabled ? 1 : 0, payload.start_time, payload.end_time, payload.notify_telegram ? 1 : 0, payload.trigger_action, alertId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/toggle', async (req, res) => {
    const alertId = parseOptionalId(req.params.id);
    if (alertId === null || typeof req.body !== 'object') {
        return sendValidationError(res);
    }

    const enabled = req.body.enabled === true;
    try {
        await db.runAsync("UPDATE alerts SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, alertId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    const alertId = parseOptionalId(req.params.id);
    if (alertId === null) {
        return sendValidationError(res);
    }

    try {
        await db.runAsync("DELETE FROM alerts WHERE id = ?", [alertId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/history', async (req, res) => {
    const limit = parseOptionalId(req.query.limit) ?? 100;
    const alertId = parseOptionalId(req.query.alert_id);

    try {
        const history = await getAlertHistory(limit, alertId);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/types', (req, res) => {
    res.json(ALERT_TYPES);
});

module.exports = router;
