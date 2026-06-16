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

test('createCarouselMediaContainer creates image and video child containers', async () => {
    const requests = [];
    const ids = ['image-child', 'video-child', 'parent-1'];
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

    const result = await client.createCarouselMediaContainer({
        mediaItems: [
            { type: 'image', url: 'https://cdn.test/one.png' },
            { type: 'video', url: 'https://cdn.test/two.mp4' },
        ],
        caption: 'caption here',
        altTexts: ['first alt', ''],
        waitForChildren: false,
    });

    assert.equal(result.children.length, 2);
    assert.equal(result.container.id, 'parent-1');
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0].body, {
        image_url: 'https://cdn.test/one.png',
        is_carousel_item: true,
        alt_text: 'first alt',
    });
    assert.deepEqual(requests[1].body, {
        media_type: 'VIDEO',
        video_url: 'https://cdn.test/two.mp4',
        is_carousel_item: true,
    });
    assert.deepEqual(requests[2].body, {
        media_type: 'CAROUSEL',
        children: 'image-child,video-child',
        caption: 'caption here',
    });
});

test('waitForContainer backs off through transient status rate limits', async () => {
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push({
            url: String(url),
            method: options.method,
        });

        if (requests.length === 1) {
            return new Response(JSON.stringify({
                error: {
                    message: 'Application request limit reached',
                    type: 'OAuthException',
                    is_transient: true,
                    code: 4,
                    error_subcode: 1349210,
                },
            }), {
                status: 403,
                headers: { 'content-type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({
            id: 'container-1',
            status_code: 'FINISHED',
            status: 'FINISHED',
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    const client = new InstagramClient({
        accessToken: 'test-token',
        igUserId: 'ig-user-1',
        graphBaseUrl: 'https://graph.test',
        graphVersion: 'v1.0',
        minTransientStatusDelayMs: 1,
    });

    const result = await client.waitForContainer({
        creationId: 'container-1',
        pollIntervalMs: 1,
        timeoutMs: 200,
    });

    assert.equal(result.status_code, 'FINISHED');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://graph.test/v1.0/container-1?access_token=test-token&fields=id%2Cstatus_code%2Cstatus');
});
