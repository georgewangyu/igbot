import { loadApiConfig } from './credentials.js';
import { toNumber } from './scoring.js';

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

    async getAccount({ fields = 'id,username,account_type,media_count,followers_count,follows_count,profile_picture_url,biography,website' } = {}) {
        try {
            return mapAccount(await this.request('GET', '/me', { query: { fields } }));
        } catch (error) {
            const basic = await this.getMe();
            return { ...mapAccount(basic), fieldWarning: error.message };
        }
    }

    async listMedia({
        igUserId,
        maxResults = 60,
        fields = 'id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,username,like_count,comments_count',
        includeInsights = false,
        insightMetrics = 'reach,likes,comments,shares,saved,total_interactions',
    } = {}) {
        const targetId = igUserId || 'me';
        const media = [];
        let path = `/${targetId}/media`;
        let query = {
            fields,
            limit: Math.min(100, maxResults),
        };

        while (media.length < maxResults && path) {
            let page;
            try {
                page = await this.request('GET', path, { query });
            } catch (error) {
                if (media.length > 0) throw error;
                page = await this.request('GET', path, {
                    query: {
                        fields: 'id,caption,media_type,media_url,permalink,timestamp,username',
                        limit: Math.min(100, maxResults),
                    },
                });
            }
            media.push(...(page.data || []).map(mapMedia));
            const next = page?.paging?.next;
            if (!next) break;

            const nextUrl = new URL(next);
            path = nextUrl.pathname.replace(`/${this.graphVersion}`, '');
            query = Object.fromEntries(nextUrl.searchParams.entries());
            query.access_token = undefined;
        }

        const limited = media.slice(0, maxResults);
        if (!includeInsights) return limited;

        return Promise.all(limited.map(async (item) => {
            try {
                const insights = await this.getMediaInsights({ mediaId: item.id, metrics: insightMetrics });
                return applyInsights(item, insights);
            } catch (error) {
                return { ...item, insightError: error.message };
            }
        }));
    }

    async getMediaInsights({ mediaId, metrics = 'reach,likes,comments,shares,saved,total_interactions' }) {
        const metricList = Array.isArray(metrics) ? metrics.join(',') : metrics;
        const result = await this.request('GET', `/${mediaId}/insights`, {
            query: { metric: metricList },
        });
        return result.data || [];
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

    async createStoryImageContainer({
        igUserId,
        imageUrl,
    }) {
        return this.createMediaContainer({
            igUserId,
            payload: {
                image_url: imageUrl,
                media_type: 'STORIES',
            },
        });
    }

    async createStoryVideoContainer({
        igUserId,
        videoUrl,
    }) {
        return this.createMediaContainer({
            igUserId,
            payload: {
                video_url: videoUrl,
                media_type: 'STORIES',
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

function mapAccount(item) {
    return {
        id: item.id || '',
        username: item.username || '',
        accountType: item.account_type || '',
        mediaCount: toNumber(item.media_count),
        followers: toNumber(item.followers_count, null),
        following: toNumber(item.follows_count, null),
        profilePictureUrl: item.profile_picture_url || '',
        bio: item.biography || '',
        website: item.website || '',
    };
}

function mapMedia(item) {
    const likes = toNumber(item.like_count);
    const comments = toNumber(item.comments_count);
    return {
        platform: 'instagram',
        id: item.id || '',
        url: item.permalink || '',
        creator: item.username || '',
        caption: item.caption || '',
        mediaType: item.media_type || '',
        mediaProductType: item.media_product_type || '',
        thumbnailUrl: item.thumbnail_url || '',
        postedAt: item.timestamp || '',
        views: toNumber(item.views ?? item.view_count ?? item.plays, likes + comments),
        likes,
        comments,
        shares: toNumber(item.shares),
        saved: toNumber(item.saved),
        source: 'instagram_api',
    };
}

function applyInsights(item, insights) {
    const values = {};
    for (const insight of insights || []) {
        const value = Array.isArray(insight.values) && insight.values.length > 0
            ? insight.values[0]?.value
            : insight.value;
        values[insight.name] = toNumber(value, null);
    }

    return {
        ...item,
        views: firstNumber(values.views, values.plays, item.views),
        reach: firstNumber(values.reach),
        likes: firstNumber(values.likes, item.likes),
        comments: firstNumber(values.comments, item.comments),
        shares: firstNumber(values.shares, item.shares),
        saved: firstNumber(values.saved, item.saved),
        totalInteractions: firstNumber(values.total_interactions),
        insights: values,
    };
}

function firstNumber(...values) {
    for (const value of values) {
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function withoutEmptyValues(input) {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null || value === '') continue;
        output[key] = value;
    }
    return output;
}
