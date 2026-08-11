import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMeta, normalizeInstagramTarget, probeInstagramTarget } from '../src/publicProbe.js';

test('normalizeInstagramTarget accepts usernames and rejects other hosts', () => {
    assert.equal(normalizeInstagramTarget('@example.creator'), 'https://www.instagram.com/example.creator/');
    assert.throws(() => normalizeInstagramTarget('https://example.com/profile'), /must use instagram.com/);
    const credentialUrl = new URL('https://instagram.com/profile');
    credentialUrl.username = 'secret';
    assert.throws(() => normalizeInstagramTarget(credentialUrl.toString()), /must not contain credentials/);
});

test('extractMeta handles attribute order and HTML entities', () => {
    const html = '<meta content="Example &amp; Co &#064;creator" property="og:title">';
    assert.equal(extractMeta(html, 'og:title'), 'Example & Co @creator');
});

test('public profile probe returns bounded anonymous metadata', async () => {
    const result = await probeInstagramTarget('@creator', {
        fetchImpl: async (url) => ({
            ok: true,
            status: 200,
            url,
            text: async () => '<meta property="og:title" content="Creator (@creator)">',
        }),
    });
    assert.equal(result.title, 'Creator (@creator)');
    assert.equal(result.authenticated, false);
    assert.equal(result.collector, 'direct-public-http');
});
