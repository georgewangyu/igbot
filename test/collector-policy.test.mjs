import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUnofficialAdapterAllowed } from '../src/collectorPolicy.js';

test('unofficial adapter is disabled unless explicitly enabled', () => {
    assert.throws(() => assertUnofficialAdapterAllowed(), /disabled by default/);
    assert.doesNotThrow(() => assertUnofficialAdapterAllowed({ enabled: true }));
});
