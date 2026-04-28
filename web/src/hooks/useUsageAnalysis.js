import { useEffect, useMemo, useState } from 'react';
import { fetchUsageBreakdown, fetchUsageSummary, fetchUsageTimeseries } from '../api';

const ensureNoApiError = (value) => {
    if (value?.error) {
        throw new Error(value.error);
    }
    return value;
};

export const useUsageAnalysis = (filters) => {
    const [data, setData] = useState({ summary: null, breakdown: [], timeseries: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const queryFilters = useMemo(() => ({ ...filters }), [filters]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [summaryResult, breakdownResult, timeseriesResult] = await Promise.all([
                    fetchUsageSummary(queryFilters),
                    fetchUsageBreakdown(queryFilters),
                    fetchUsageTimeseries({ ...queryFilters, split: 'none' })
                ]);
                const summary = ensureNoApiError(summaryResult);
                const breakdown = ensureNoApiError(breakdownResult);
                const timeseries = ensureNoApiError(timeseriesResult);

                if (!Array.isArray(breakdown) || !Array.isArray(timeseries?.series)) {
                    throw new Error('Invalid usage analysis response');
                }

                if (!cancelled) {
                    setData({
                        summary,
                        breakdown,
                        timeseries: timeseries.series
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err);
                    setData({ summary: null, breakdown: [], timeseries: [] });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [queryFilters]);

    return { ...data, loading, error };
};
