import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { InstagramClient } from '../src/client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('createCarouselImageContainer creates child containers and parent carousel payload', async () => {
    const requests = [];
    const ids = ['child-1', 'child-2', 'parent-1'];
    globalThis.fetch = async (url, options) => {
        requests.push({
            url: String(url),
            method: options.method,
            body: JSON.parse(options.body),
        });
        return new Response(JSON.stringify({ id: ids[requests.length - 1] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    const client = new InstagramClient({
        accessToken: 'test-token',
        igUserId: 'ig-user-1',
        graphBaseUrl: 'https://graph.test',
        graphVersion: 'v1.0',
    });

    const result = await client.createCarouselImageContainer({
        imageUrls: ['https://cdn.test/one.png', 'https://cdn.test/two.png'],
        caption: 'caption here',
        altTexts: ['first alt', 'second alt'],
        waitForChildren: false,
    });

    assert.equal(result.children.length, 2);
    assert.equal(result.container.id, 'parent-1');
    assert.equal(requests.length, 3);
    assert.equal(requests[0].url, 'https://graph.test/v1.0/ig-user-1/media?access_token=test-token');
    assert.deepEqual(requests[0].body, {
        image_url: 'https://cdn.test/one.png',
        is_carousel_item: true,
        alt_text: 'first alt',
    });
    assert.deepEqual(requests[1].body, {
        image_url: 'https://cdn.test/two.png',
        is_carousel_item: true,
        alt_text: 'second alt',
    });
    assert.deepEqual(requests[2].body, {
        media_type: 'CAROUSEL',
        children: 'child-1,child-2',
        caption: 'caption here',
    });
});

test('createCarouselImageContainer requires 2-10 images', async () => {
    const client = new InstagramClient({
        accessToken: 'test-token',
        igUserId: 'ig-user-1',
        graphBaseUrl: 'https://graph.test',
        graphVersion: 'v1.0',
    });

    await assert.rejects(
        () => client.createCarouselImageContainer({
            imageUrls: ['https://cdn.test/one.png'],
            waitForChildren: false,
        }),
        /2-10 images/
    );
});
