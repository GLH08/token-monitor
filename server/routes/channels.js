const express = require('express');
const router = express.Router();
const { prisma } = require('../syncer');

router.get('/overview', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({
            select: {
                id: true, name: true, type: true, status: true
            }
        });

        const statusCount = { enabled: 0, disabled: 0, autoDisabled: 0 };
        channels.forEach(ch => {
            if (ch.status === 1) statusCount.enabled++;
            else if (ch.status === 2) statusCount.disabled++;
            else if (ch.status === 3) statusCount.autoDisabled++;
        });

        res.json({ channels, statusCount, total: channels.length });
    } catch (error) {
        console.error('[API] /channels/overview error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({ select: { id: true, name: true } });
        res.json(channels);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
