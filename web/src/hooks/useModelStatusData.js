import { useState, useEffect, useCallback } from 'react';
import { fetchModelStatusOverview, fetchModelStatusDetail } from '../api';

export const useModelStatusData = (timeWindow, selectedChannel, selectedModel) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Model detail state
    const [modelDetail, setModelDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchOverview = useCallback(async () => {
        try {
            const result = await fetchModelStatusOverview(timeWindow, selectedChannel || null);
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch model status:', error);
            setData(null);
        }
    }, [timeWindow, selectedChannel]);

    const fetchModelDetail = useCallback(async (modelName) => {
        setDetailLoading(true);
        try {
            const result = await fetchModelStatusDetail(modelName, timeWindow, selectedChannel || null);
            if (result.success) {
                setModelDetail(result.data);
            } else {
                setModelDetail(null);
            }
        } catch (error) {
            console.error('Failed to fetch model detail:', error);
            setModelDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, [timeWindow, selectedChannel]);

    // Initial load and polling for overview
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            setLoading(true);
            await fetchOverview();
            if (isMounted) setLoading(false);
        };
        loadData();

        const interval = setInterval(fetchOverview, 30000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [fetchOverview]);

    // Load detail when selectedModel changes
    useEffect(() => {
        if (selectedModel) {
            fetchModelDetail(selectedModel);
        } else {
            setModelDetail(null);
        }
    }, [selectedModel, fetchModelDetail]);

    // Manual refresh action
    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetchOverview(),
                selectedModel ? fetchModelDetail(selectedModel) : Promise.resolve()
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    return {
        data,
        loading,
        refreshing,
        modelDetail,
        detailLoading,
        handleRefresh
    };
};
