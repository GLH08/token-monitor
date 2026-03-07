const express = require('express');
const router = express.Router();
const { parseTimeRange, sendValidationError } = require('../request');

router.post('/rebuild-stats', async (req, res) => {
    const timeRange = parseTimeRange(req.body);
    if (!timeRange || timeRange.startTs === null || timeRange.endTs === null) {
        return sendValidationError(res, 'start_ts and end_ts are required');
    }

    try {
        const { rebuildStatsForDateRange } = require('../syncer');
        const result = await rebuildStatsForDateRange(timeRange.startTs, timeRange.endTs);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
