function finiteValues(values) {
    return values
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((a, b) => a - b);
}

function percentile(values, rank) {
    const sorted = finiteValues(values);
    if (sorted.length === 0) {
        return 0;
    }

    const boundedRank = Math.min(1, Math.max(0, Number(rank) || 0));
    const position = (sorted.length - 1) * boundedRank;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) {
        return sorted[lower];
    }

    const fraction = position - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function summarizePercentiles(values) {
    const sorted = finiteValues(values);
    return {
        count: sorted.length,
        p50: Number(percentile(sorted, 0.5).toFixed(2)),
        p95: Number(percentile(sorted, 0.95).toFixed(2)),
        p99: Number(percentile(sorted, 0.99).toFixed(2))
    };
}

module.exports = { percentile, summarizePercentiles };
