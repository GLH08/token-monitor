const express = require('express');
const router = express.Router();
const { getAvailableModels, getModelStatus, getAllModelsStatusOverview, TIME_WINDOWS } = require('../modelStatus');
const { parseWindow, parseOptionalId, sendValidationError } = require('../request');

router.get('/models', async (req, res) => {
    try {
        const models = await getAvailableModels();
        res.json({ success: true, data: models });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/overview', async (req, res) => {
    const window = parseWindow(req.query.window, Object.keys(TIME_WINDOWS), '24h');
    const channelId = parseOptionalId(req.query.channel_id);

    if (window === null || (req.query.channel_id && channelId === null)) {
        return sendValidationError(res);
    }

    try {
        const data = await getAllModelsStatusOverview(window, channelId);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/windows/config', (req, res) => {
    res.json({ success: true, data: TIME_WINDOWS });
});

router.get('/:modelName', async (req, res) => {
    const window = parseWindow(req.query.window, Object.keys(TIME_WINDOWS), '24h');
    const modelName = decodeURIComponent(req.params.modelName);
    const channelId = parseOptionalId(req.query.channel_id);

    if (!modelName || window === null || (req.query.channel_id && channelId === null)) {
        return sendValidationError(res);
    }

    try {
        const data = await getModelStatus(modelName, window, channelId);
        if (!data) {
            return res.status(404).json({ success: false, error: 'Model not found' });
        }
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
