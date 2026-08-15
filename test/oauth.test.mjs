import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SCOPES, buildAuthorizationUrl } from '../src/oauth.js';

test('authorization URL matches the configured Instagram business-login flow', () => {
    const { url, state } = buildAuthorizationUrl({
        appId: 'instagram-app-id',
        redirectUri: 'https://example.com/oauth/instagram/callback',
        state: 'csrf-state',
    });
    const parsed = new URL(url);

    assert.equal(parsed.origin + parsed.pathname, 'https://www.instagram.com/oauth/authorize');
    assert.equal(parsed.searchParams.get('client_id'), 'instagram-app-id');
    assert.equal(parsed.searchParams.get('force_reauth'), 'true');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'https://example.com/oauth/instagram/callback');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.deepEqual(parsed.searchParams.get('scope').split(','), DEFAULT_SCOPES);
    assert.equal(parsed.searchParams.get('state'), state);
});
