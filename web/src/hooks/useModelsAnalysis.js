import { useState, useEffect, useCallback } from 'react';
import { fetchModelsAnalysis } from '../api';
import { MODEL_ANALYSIS_WINDOW_TO_SECONDS } from '../components/PageUI';

export const useModelsAnalysis = (period, selectedChannel) => {
    const [data, setData] = useState({ models: [], summary: {} });
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const now = Math.floor(Date.now() / 1000);
            const start_ts = now - (MODEL_ANALYSIS_WINDOW_TO_SECONDS[period] || 86400);
            const result = await fetchModelsAnalysis({ start_ts, end_ts: now, channel_id: selectedChannel });
            setData(result || { models: [], summary: {} });
        } catch (error) {
            console.error('Load data error:', error);
            setData({ models: [], summary: {} });
        } finally {
            setLoading(false);
        }
    }, [period, selectedChannel]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return { data, loading, refetch: loadData };
};
