import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHealthReport, summarizeLiveProbeError, tokenState } from '../src/health.js';

test('tokenState distinguishes missing, expired, and valid tokens', () => {
    const now = Date.parse('2026-08-10T22:00:00.000Z');
    assert.equal(tokenState('', '', { now }).status, 'missing');
    assert.equal(tokenState('secret', '2026-08-10T21:00:00.000Z', { now }).status, 'expired');
    assert.equal(tokenState('secret', '2026-08-10T23:00:00.000Z', { now }).status, 'valid');
});

test('health report hides secrets and disables unofficial collection', () => {
    const report = buildHealthReport({
        now: Date.parse('2026-08-10T22:00:00.000Z'),
        api: { igUserId: '123' },
        privateApi: { username: 'creator', password: 'private-secret', sessionFile: '.cache/session.json', pythonBin: 'python3' },
        accessToken: 'access-secret',
        accessTokenExpiresAt: '2026-08-10T21:00:00.000Z',
        appId: 'app',
        appSecret: 'app-secret',
        sessionFileExists: false,
        pythonInstagrapiInstalled: false,
    });

    assert.equal(report.capabilities.officialApi.status, 'expired');
    assert.equal(report.capabilities.unofficialAdapter.enabledByDefault, false);
    assert.equal(report.capabilities.unofficialAdapter.collectorAutoLogin, false);
    assert.doesNotMatch(JSON.stringify(report), /access-secret|private-secret|app-secret/);
});

test('live probe recognizes Meta code 190 without retaining the error message', () => {
    const error = new Error('token secret expired');
    error.status = 400;
    error.payload = { error: { code: 190 } };
    assert.deepEqual(summarizeLiveProbeError(error), {
        status: 'expired-or-invalid',
        httpStatus: 400,
        platformCode: 190,
    });
});
