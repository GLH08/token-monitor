const assert = require('node:assert/strict');
const test = require('node:test');

const { summarizeLogTokenStats } = require('../routes/logs');

test('summarizeLogTokenStats returns input/output and cache dimensions', () => {
    const stats = summarizeLogTokenStats([
        {
            promptTokens: 100,
            completionTokens: 20,
            useTime: 1,
            other: JSON.stringify({ cache_tokens: 30, cache_write_tokens: 10 })
        },
        {
            promptTokens: 200,
            completionTokens: 50,
            useTime: 2,
            other: JSON.stringify({
                claude: true,
                usage_semantic: 'anthropic',
                cache_tokens: 40,
                cache_creation_tokens: 15
            })
        }
    ]);

    assert.deepEqual(stats, {
        total_tokens: 370,
        total_prompt_tokens: 300,
        total_completion_tokens: 70,
        total_cache_read_tokens: 70,
        total_cache_write_tokens: 25,
        total_input_tokens: 355,
        throughput_total: 425
    });
});

test('summarizeLogTokenStats tolerates empty and malformed logs', () => {
    assert.deepEqual(summarizeLogTokenStats([{ other: 'not-json' }, null]), {
        total_tokens: 0,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_write_tokens: 0,
        total_input_tokens: 0,
        throughput_total: 0
    });
});
