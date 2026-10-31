import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InstagramClient } from '../src/client.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const master = { videoUrl: 'https://cdn.test/reel.mp4', caption: 'Approved caption' };
const client = () => new InstagramClient({
    accessToken: 'test-token', igUserId: 'test-owner',
    graphBaseUrl: 'https://graph.test', graphVersion: 'v1.0',
});

test('Trial container explicitly requests manual graduation and no feed sharing, without publishing', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ id: 'trial-container' }), { status: 200 });
    };
    await client().createVideoContainer({ ...master, trial: true });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/test-owner\/media\?/);
    assert.deepEqual(requests[0].body, {
        video_url: master.videoUrl, caption: master.caption, media_type: 'REELS',
        share_to_feed: false, trial_params: { graduation_strategy: 'MANUAL' },
    });
});

test('Trial contradictions reject before network and regular Reels retain their payload', async () => {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
        calls += 1;
        assert.deepEqual(JSON.parse(options.body), {
            video_url: master.videoUrl, caption: master.caption, media_type: 'REELS',
            share_to_feed: true,
        });
        return new Response(JSON.stringify({ id: 'regular-container' }), { status: 200 });
    };
    for (const extra of [
        { trial: 'true' }, { trial: true, mediaType: 'STORIES' },
        { trial: true, shareToFeed: true }, { trial: true, shareToFeed: 'false' },
        { trial: true, collaborators: ['examplecreator'] },
    ]) await assert.rejects(client().createVideoContainer({ ...master, ...extra }));
    assert.equal(calls, 0);
    await client().createVideoContainer({ ...master, shareToFeed: true });
    assert.equal(calls, 1);
});

test('API rejection never retries as a regular Reel or publishes', async () => {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
        calls += 1;
        assert.deepEqual(JSON.parse(options.body).trial_params, { graduation_strategy: 'MANUAL' });
        return new Response(JSON.stringify({ error: { message: 'Trial unavailable' } }), { status: 400 });
    };
    await assert.rejects(client().createVideoContainer({ ...master, trial: true }), /Trial unavailable/);
    assert.equal(calls, 1);
});

const root = fileURLToPath(new URL('..', import.meta.url));
function cli(args) {
    const mock = `globalThis.fetch = async (url, options) => {
        if (new URL(url).hostname !== 'graph.test') throw new Error('Unexpected host');
        console.log('MOCK_REQUEST=' + options.body);
        return new Response(JSON.stringify({ id: 'trial-container' }), { status: 200 });
    };`;
    return spawnSync(process.execPath, [
        '--import', 'data:text/javascript,' + encodeURIComponent(mock),
        'src/cli.js', 'video', master.videoUrl, ...args,
    ], { cwd: root, encoding: 'utf8', env: {
        PATH: process.env.PATH, IG_ACCESS_TOKEN: 'test-token', IG_USER_ID: 'test-owner',
        IG_GRAPH_BASE_URL: 'https://graph.test', IG_GRAPH_VERSION: 'v1.0',
    } });
}

test('CLI --trial sends one manual Trial container; conflicting feed flag makes no request', () => {
    const result = cli(['--trial']);
    assert.equal(result.status, 0, result.stderr);
    const requests = result.stdout.split('\n').filter(x => x.startsWith('MOCK_REQUEST='));
    assert.equal(requests.length, 1);
    const body = JSON.parse(requests[0].slice('MOCK_REQUEST='.length));
    assert.deepEqual(body.trial_params, { graduation_strategy: 'MANUAL' });
    assert.equal(body.share_to_feed, false);
    const conflict = cli(['--trial', '--share-to-feed', 'true']);
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /shareToFeed=false/);
    assert.equal(conflict.stdout.includes('MOCK_REQUEST='), false);
});
