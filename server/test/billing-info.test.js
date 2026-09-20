const test = require('node:test');
const assert = require('node:assert/strict');

const { parseBillingInfo, metricsFromLog, mapBillingTypeSummary } = require('../tokenMetrics');

test('parseBillingInfo reads newer new-api tiered_expr billing metadata', () => {
    const other = {
        billing_mode: 'tiered_expr',
        billing_unit: 'token',
        fixed_price: 0.0123,
        matched_tier: 'tier1',
        image_count: 2,
        billing_tokens: {
            p: 100, c: 20, len: 120, cr: 30, cc: 0, cc1h: 0,
            img: 10, img_cr: 5, img_o: 0, ai: 0, ao: 0
        }
    };
    assert.deepEqual(parseBillingInfo(other), other);
});

test('parseBillingInfo maps fixed-price request billing without token breakdown', () => {
    const other = {
        billing_mode: 'tiered_expr',
        billing_unit: 'request',
        fixed_price: 0.02,
        matched_tier: null,
        image_count: null
    };
    assert.deepEqual(parseBillingInfo(other), {
        billing_mode: 'tiered_expr',
        billing_unit: 'request',
        fixed_price: 0.02,
        matched_tier: null,
        image_count: null,
        billing_tokens: null
    });
});

test('parseBillingInfo is null for legacy and malformed other', () => {
    assert.equal(parseBillingInfo(null), null);
    assert.equal(parseBillingInfo({}), null);
    assert.equal(parseBillingInfo({ billing_tokens: 'not-an-object' }), null);
});

test('billingType stays null for task logs lacking billing_unit', () => {
    const metrics = metricsFromLog({
        promptTokens: 10,
        completionTokens: 0,
        other: JSON.stringify({
            billing_mode: 'tiered_expr',
            matched_tier: 'base'
        })
    });
    assert.equal(metrics.billingInfo.billing_mode, 'tiered_expr');
    assert.equal(metrics.billingType, null);
});

test('metricsFromLog carries billingInfo on logs', () => {
    const metrics = metricsFromLog({
        promptTokens: 100,
        completionTokens: 20,
        other: JSON.stringify({
            billing_mode: 'tiered_expr',
            billing_unit: 'token',
            matched_tier: 't1',
            billing_tokens: { p: 100, c: 20 }
        })
    });
    assert.equal(metrics.billingInfo.billing_mode, 'tiered_expr');
    assert.deepEqual(metrics.billingInfo.billing_tokens, { p: 100, c: 20, len: 0, cr: 0, cc: 0, cc1h: 0, img: 0, img_cr: 0, img_o: 0, ai: 0, ao: 0 });
});

test('mapBillingTypeSummary reports request and quota shares', () => {
    assert.deepEqual(mapBillingTypeSummary({
        fixed_price_requests: 1, fixed_price_quota: 600,
        token_billing_requests: 3, token_billing_quota: 900
    }), {
        fixed_price_requests: 1,
        fixed_price_quota: 600,
        token_billing_requests: 3,
        token_billing_quota: 900,
        billing_type_stats: {
            fixed_price_ratio: 0.25,
            token_billing_ratio: 0.75,
            total_tiered_requests: 4
        }
    });
});
