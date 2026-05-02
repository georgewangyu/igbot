import { randomBytes } from 'crypto';

const AUTH_BASE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token';
const DEFAULT_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

export function buildAuthorizationUrl({
    appId,
    redirectUri,
    scopes = DEFAULT_SCOPES,
    state = randomBytes(12).toString('hex'),
}) {
    const url = new URL(AUTH_BASE_URL);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('state', state);
    return { url: url.toString(), state };
}

export async function exchangeCodeForToken({
    appId,
    appSecret,
    redirectUri,
    code,
}) {
    const body = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
    });

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        body,
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
        throw new Error(`Instagram token exchange failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    return payload;
}

export async function exchangeForLongLivedToken({
    appSecret,
    shortLivedAccessToken,
}) {
    const url = new URL(LONG_LIVED_TOKEN_URL);
    url.searchParams.set('grant_type', 'ig_exchange_token');
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('access_token', shortLivedAccessToken);

    const response = await fetch(url);
    const payload = await parseResponse(response);
    if (!response.ok) {
        throw new Error(`Instagram long-lived token exchange failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    return payload;
}

export async function refreshLongLivedToken({ accessToken }) {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const payload = await parseResponse(response);
    if (!response.ok) {
        throw new Error(`Instagram token refresh failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    return payload;
}

async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}
