const INSTAGRAM_ORIGIN = 'https://www.instagram.com';

export function normalizeInstagramTarget(target) {
    const value = String(target || '').trim();
    if (!value) throw new Error('Instagram target is required');
    if (/^https?:\/\//i.test(value)) {
        const url = new URL(value);
        if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error('Instagram target URL must use instagram.com');
        if (url.username || url.password) throw new Error('Instagram target URL must not contain credentials');
        url.protocol = 'https:';
        url.hash = '';
        return url.toString();
    }
    const username = value.replace(/^@/, '');
    if (!/^[A-Za-z0-9._]+$/.test(username)) throw new Error(`Invalid Instagram username: ${target}`);
    return `${INSTAGRAM_ORIGIN}/${username}/`;
}

export async function probeInstagramTarget(target, { fetchImpl = fetch } = {}) {
    const url = normalizeInstagramTarget(target);
    const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'igbot-public-profile/1.0 (+direct-read-only-probe)',
        },
    });
    const html = await response.text();
    return {
        target: String(target),
        url,
        responseUrl: response.url || url,
        httpStatus: response.status,
        reachable: response.ok,
        title: extractMeta(html, 'og:title') || extractTitle(html) || null,
        description: extractMeta(html, 'og:description') || null,
        collector: 'direct-public-http',
        authenticated: false,
    };
}

export function extractMeta(html, property) {
    for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
        const attrs = Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gi)]
            .map((match) => [match[1].toLowerCase(), decodeHtml(match[3])]));
        if (attrs.property === property || attrs.name === property) return attrs.content || '';
    }
    return '';
}

function extractTitle(html) {
    const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? decodeHtml(match[1].trim()) : '';
}

function decodeHtml(value) {
    return String(value || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
