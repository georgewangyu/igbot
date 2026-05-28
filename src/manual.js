import { readFileSync } from 'fs';
import { basename } from 'path';
import { toNumber } from './scoring.js';

export function loadManualRows(filePath) {
    const text = readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.jsonl')) return parseJsonl(text);
    if (filePath.endsWith('.json')) return parseJson(text);
    return parseCsv(text);
}

function parseJson(text) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.data || parsed.items || [parsed];
    return rows.map(normalizeManualRow);
}

function parseJsonl(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => normalizeManualRow(JSON.parse(line)));
}

function parseCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];
    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1)
        .filter((row) => row.some((value) => value.trim()))
        .map((row) => {
            const object = {};
            for (let i = 0; i < headers.length; i += 1) {
                object[headers[i]] = row[i] ?? '';
            }
            return normalizeManualRow(object);
        });
}

function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];
        if (quoted) {
            if (char === '"' && next === '"') {
                value += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                value += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(value);
            value = '';
        } else if (char === '\n') {
            row.push(value);
            rows.push(row);
            row = [];
            value = '';
        } else if (char !== '\r') {
            value += char;
        }
    }
    row.push(value);
    rows.push(row);
    return rows;
}

export function normalizeManualRow(row) {
    const creator = pick(row, ['creator', 'creator_handle', 'username', 'handle', 'ownerUsername', 'owner_username']).replace(/^@/, '');
    const id = pick(row, ['id', 'media_id', 'shortcode']);
    const url = pick(row, ['url', 'post_url', 'reel_url', 'permalink']) || inferInstagramUrl(id);
    const postedAt = pick(row, ['posted_at', 'postedAt', 'timestamp', 'date', 'taken_at']);
    const views = toNumber(pick(row, ['views', 'view_count', 'video_view_count', 'play_count', 'plays']));

    return {
        platform: 'instagram',
        id,
        url,
        creator,
        caption: pick(row, ['caption', 'hook_text', 'description', 'text', 'concept_summary']),
        views,
        followers: toNumber(pick(row, ['followers', 'creator_followers', 'creator_follower_count', 'follower_count', 'followers_count'])),
        likes: toNumber(pick(row, ['likes', 'like_count', 'likes_count'])),
        comments: toNumber(pick(row, ['comments', 'comment_count', 'comments_count'])),
        shares: toNumber(pick(row, ['shares', 'share_count', 'shares_count'])),
        saved: toNumber(pick(row, ['saved', 'save_count', 'saves'])),
        postedAt,
        postAgeDays: toNumber(pick(row, ['post_age_days', 'age_days']), null),
        durationSeconds: toNumber(pick(row, ['duration_seconds', 'video_duration', 'duration']), null),
        conceptSummary: pick(row, ['concept_summary']),
        hookText: pick(row, ['hook_text']),
        source: pick(row, ['source']) || `manual:${basename(url || id || creator || 'row')}`,
    };
}

function pick(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]).trim();
    }
    return '';
}

function inferInstagramUrl(id) {
    if (!id || id.length > 20) return '';
    return `https://www.instagram.com/reel/${id}/`;
}
