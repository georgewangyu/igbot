import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { InstagramClient } from '../src/client.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function client() {
    return new InstagramClient({
        accessToken: 'test-token', igUserId: 'test-owner',
        graphBaseUrl: 'https://graph.test', graphVersion: 'v1.0',
    });
}

const master = { videoUrl: 'https://cdn.test/master.mp4', caption: 'Approved caption' };

test('Reel invitation is included in the container; no publication is performed', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ id: 'container-1' }), { status: 200 });
    };
    await client().createVideoContainer({
        ...master, collaborators: [' @ExampleCreator ', 'examplecreator', 'Example_Partner'],
    });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/test-owner\/media\?/);
    assert.deepEqual(requests[0].body, {
        video_url: master.videoUrl, caption: master.caption, media_type: 'REELS',
        collaborators: ['examplecreator', 'example_partner'],
    });
});

test('ordinary Reel omits collaborators when not selected or an empty list is passed', async () => {
    globalThis.fetch = async (_url, options) => {
        assert.equal(Object.hasOwn(JSON.parse(options.body), 'collaborators'), false);
        return new Response(JSON.stringify({ id: 'container-1' }), { status: 200 });
    };
    await client().createVideoContainer(master);
    await client().createVideoContainer({ ...master, collaborators: [] });
});

test('invalid collaborator input and unsupported video types fail before network access', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('unexpected network'); };
    const invalid = [
        'examplecreator', [123], [''], ['example creator'], ['@@examplecreator'],
        ['https://example.test/profile'], ['a'.repeat(31)], ['a', 'b', 'c', 'd'],
    ];
    for (const collaborators of invalid) {
        await assert.rejects(client().createVideoContainer({ ...master, collaborators }), /[Cc]ollaborator/);
    }
    await assert.rejects(client().createVideoContainer({
        ...master, mediaType: 'STORIES', collaborators: ['examplecreator'],
    }), /REELS only/);
    assert.equal(calls, 0);
});

const root = fileURLToPath(new URL('..', import.meta.url));
function runVideo(args) {
    const mock = `globalThis.fetch = async (url, options) => {
        if (new URL(url).hostname !== 'graph.test') throw new Error('unexpected host');
        console.log('MOCK_REQUEST=' + options.body);
        return new Response(JSON.stringify({id:'container-1'}), {status:200});
    };`;
    return spawnSync(process.execPath, [
        '--import', 'data:text/javascript,' + encodeURIComponent(mock),
        'src/cli.js', 'video', master.videoUrl, '--caption', master.caption, ...args,
    ], {
        cwd: root, encoding: 'utf8',
        env: { PATH: process.env.PATH, IG_ACCESS_TOKEN: 'test-token', IG_USER_ID: 'test-owner',
            IG_GRAPH_BASE_URL: 'https://graph.test', IG_GRAPH_VERSION: 'v1.0' },
    });
}

test('CLI passes explicit collaborator list and keeps the ordinary route unchanged', () => {
    const invited = runVideo(['--collaborators', '@ExampleCreator,example_partner']);
    assert.equal(invited.status, 0, invited.stderr);
    const line = invited.stdout.split('\n').find((value) => value.startsWith('MOCK_REQUEST='));
    assert.deepEqual(JSON.parse(line.slice('MOCK_REQUEST='.length)).collaborators,
        ['examplecreator', 'example_partner']);
    assert.equal(invited.stdout.split('MOCK_REQUEST=').length - 1, 1);
    const plain = runVideo([]);
    assert.equal(plain.status, 0, plain.stderr);
    const payload = plain.stdout.split('\n').find((value) => value.startsWith('MOCK_REQUEST='));
    assert.equal(Object.hasOwn(JSON.parse(payload.slice('MOCK_REQUEST='.length)), 'collaborators'), false);
});

test('CLI rejects malformed list before sending a request', () => {
    const result = runVideo(['--collaborators', 'examplecreator,']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid collaborator username/);
    assert.equal(result.stdout.includes('MOCK_REQUEST='), false);
});
