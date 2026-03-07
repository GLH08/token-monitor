import { useState, useCallback, useEffect } from 'react';

export function usePaginatedData(fetcher, initialFilters = {}, options = {}) {
    const {
        pageSize = 20,
        cacheKey = null,
        cacheTTL = 300000 // 5 minutes
    } = options;

    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState(initialFilters);

    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError('');

        try {
            const params = { page, pageSize, ...filters };
            const result = await fetcher(params);

            if (!result || typeof result !== 'object' || result.error) {
                throw new Error(result?.error || '获取数据失败');
            }

            const resData = result.data || result.logs || [];
            setData(Array.isArray(resData) ? resData : []);
            setTotal(result.total || 0);
            if (result.stats) setStats(result.stats);

            // 缓存逻辑 (可选)，只有第一页且没有筛选条件时才缓存
            const hasNoFilters = Object.values(filters).every(v => v === '' || v === null || v === undefined);
            if (cacheKey && page === 1 && hasNoFilters) {
                sessionStorage.setItem(cacheKey, JSON.stringify({
                    data: resData,
                    total: result.total || 0,
                    stats: result.stats,
                    timestamp: Date.now()
                }));
            }
            return true;
        } catch (err) {
            console.error('Fetch data failed:', err);
            if (!silent) {
                setData([]);
                setTotal(0);
            }
            setError(err.message || '加载发生异常');
            return false;
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fetcher, filters, page, pageSize, cacheKey]);

    useEffect(() => {
        let useCache = false;
        const hasNoFilters = Object.values(filters).every(v => v === '' || v === null || v === undefined);

        if (cacheKey && page === 1 && hasNoFilters) {
            const cache = sessionStorage.getItem(cacheKey);
            if (cache) {
                try {
                    const parsed = JSON.parse(cache);
                    if (Date.now() - parsed.timestamp < cacheTTL) {
                        setData(parsed.data || []);
                        setTotal(parsed.total || 0);
                        if (parsed.stats) setStats(parsed.stats);
                        useCache = true;
                    }
                } catch (e) {
                    console.error("Failed to parse cache", e);
                }
            }
        }

        // 即使命中了缓存，如果是组件初次挂载或者用户做了操作，我们仍然在后台静默发起一次最新请求吗？
        // 之前的 LogsTable 实现是先用缓存覆盖状态，然后继续 loadLogs() 更新内容。
        loadData({ silent: useCache });
    }, [page, loadData, cacheKey, cacheTTL]);
    // 注意: 这里不依赖 filters，如果 filters 更新了，我们需要手动调用 setPage(1)，
    // 或者我们把 filters 加到依赖项里。但 loadData 已经包含了 filters 作为依赖。
    // 为了防止死循环，建议每次 setFilters 时也一并 setPage(1)，或者通过专门的 search 提交函数。

    const handleSearch = useCallback((newFilters) => {
        setFilters(newFilters);
        setPage(1);
    }, []);

    const handleResetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPage(1);
    }, [initialFilters]);

    return {
        data,
        total,
        stats,
        page,
        setPage,
        loading,
        refreshing,
        error,
        filters,
        setFilters,
        handleSearch,
        handleResetFilters,
        loadData,
        totalPages: Math.ceil(total / pageSize)
    };
}
