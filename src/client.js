import { loadApiConfig } from './credentials.js';

export class InstagramClient {
    constructor(config = {}) {
        const defaults = loadApiConfig();
        this.accessToken = config.accessToken || defaults.accessToken;
        this.igUserId = config.igUserId || defaults.igUserId;
        this.graphBaseUrlValue = config.graphBaseUrl || defaults.graphBaseUrl || 'https://graph.instagram.com';
        this.graphVersion = config.graphVersion || defaults.graphVersion || 'v25.0';
    }

    get graphBaseUrl() {
        return `${this.graphBaseUrlValue.replace(/\/$/, '')}/${this.graphVersion}`;
    }

    async request(method, path, { query = {}, body, raw = false } = {}) {
        if (!this.accessToken) {
            throw new Error('Missing credentials: IG_ACCESS_TOKEN');
        }

        const url = new URL(`${this.graphBaseUrl}${path}`);
        url.searchParams.set('access_token', this.accessToken);
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        }

        const response = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });

        const text = await response.text();
        let payload = null;
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = text;
            }
        }

        if (!response.ok) {
            throw new Error(`Instagram API ${method} ${path} failed (${response.status}): ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
        }

        if (raw) {
            return { headers: response.headers, body: payload };
        }

        return payload;
    }

    requireIgUserId(explicitIgUserId) {
        const id = explicitIgUserId || this.igUserId;
        if (!id) {
            throw new Error('Missing credentials: IG_USER_ID');
        }
        return id;
    }

    async getMe() {
        return this.request('GET', '/me', {
            query: {
                fields: 'id,username,account_type,media_count',
            },
        });
    }

    async createImageContainer({
        igUserId,
        imageUrl,
        caption,
        altText,
        locationId,
        userTags,
    }) {
        return this.createMediaContainer({
            igUserId,
            payload: {
                image_url: imageUrl,
                caption,
                alt_text: altText,
                location_id: locationId,
                user_tags: userTags,
            },
        });
    }

    async createVideoContainer({
        igUserId,
        videoUrl,
        caption,
        mediaType = 'REELS',
        coverUrl,
        shareToFeed,
        thumbOffset,
    }) {
        return this.createMediaContainer({
            igUserId,
            payload: {
                video_url: videoUrl,
                caption,
                media_type: mediaType,
                cover_url: coverUrl,
                share_to_feed: shareToFeed,
                thumb_offset: thumbOffset,
            },
        });
    }

    async createMediaContainer({ igUserId, payload }) {
        const targetId = this.requireIgUserId(igUserId);
        const body = withoutEmptyValues(payload);
        return this.request('POST', `/${targetId}/media`, { body });
    }

    async publishContainer({ igUserId, creationId }) {
        const targetId = this.requireIgUserId(igUserId);
        return this.request('POST', `/${targetId}/media_publish`, {
            body: {
                creation_id: creationId,
            },
        });
    }

    async getContainerStatus({ creationId }) {
        return this.request('GET', `/${creationId}`, {
            query: {
                fields: 'id,status_code,status',
            },
        });
    }

    async createAndPublishImage(options) {
        const container = await this.createImageContainer(options);
        const creationId = container.id;
        if (!creationId) {
            throw new Error(`Image container response did not include id: ${JSON.stringify(container)}`);
        }
        const published = await this.publishContainer({
            igUserId: options.igUserId,
            creationId,
        });
        return { container, published };
    }
}

function withoutEmptyValues(input) {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null || value === '') continue;
        output[key] = value;
    }
    return output;
}
