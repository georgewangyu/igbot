import { InstagramClient } from './client.js';
import { loadManualRows } from './manual.js';
import { computeBaseline, formatNumber, scoreMedia } from './scoring.js';

export async function findMyOutliers(options = {}) {
    const client = options.client || new InstagramClient();
    const [account, media] = await Promise.all([
        client.getAccount(),
        client.listMedia({
            maxResults: options.maxResults ?? 60,
            includeInsights: options.includeInsights ?? true,
            insightMetrics: options.insightMetrics,
        }),
    ]);

    const baselineViews = computeBaseline(media.slice(0, options.baselineMedia ?? 12), options.baselineMethod);
    const rows = media.map((item) => ({
        ...item,
        creator: item.creator || account.username,
        followers: account.followers,
    }));

    const baselineByRow = new Map(rows.map((row) => {
        const others = rows
            .filter((item) => item.id !== row.id && item.views > 0)
            .slice(0, options.baselineMedia ?? 12);
        return [row, others.length >= (options.minBaselineMedia ?? 3) ? computeBaseline(others, options.baselineMethod) : baselineViews];
    }));

    return rankRows(rows, {
        account,
        baselineByRow,
        minViews: options.minViews,
        minOutlierScore: options.minOutlierScore,
        limit: options.limit ?? 20,
        sort: options.sort ?? 'outlier',
    });
}

export function scoreManualFile(filePath, options = {}) {
    return scoreManualRows(loadManualRows(filePath), options);
}

export function scoreManualRows(rows, options = {}) {
    const grouped = new Map();
    for (const row of rows) {
        const key = row.creator || '';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }

    const baselineByRow = new Map();
    const minBaselineMedia = options.minBaselineMedia ?? 3;
    const baselineMedia = options.baselineMedia ?? 12;
    for (const media of grouped.values()) {
        for (const row of media) {
            const others = media
                .filter((item) => item !== row && item.views > 0)
                .slice(0, baselineMedia);
            if (others.length >= minBaselineMedia) {
                baselineByRow.set(row, computeBaseline(others, options.baselineMethod));
            }
        }
    }

    return rankRows(rows, {
        baselineByRow,
        maxFollowers: options.maxFollowers,
        minViews: options.minViews,
        minViewsPerFollower: options.minViewsPerFollower,
        minOutlierScore: options.minOutlierScore,
        limit: options.limit ?? 20,
        sort: options.sort ?? 'score',
    });
}

export function rankRows(rows, options = {}) {
    const results = [];
    for (const row of rows) {
        const followers = row.followers || options.account?.followers || 0;
        if (options.maxFollowers !== undefined && followers > options.maxFollowers) continue;
        if (options.minViews !== undefined && row.views < options.minViews) continue;
        const score = scoreMedia({
            media: row,
            creator: { followers },
            baselineViews: options.baselineByRow?.get(row) || null,
        });
        if (
            options.minViewsPerFollower !== undefined &&
            (score.viewsPerFollower || 0) < options.minViewsPerFollower
        ) continue;
        if (
            options.minOutlierScore !== undefined &&
            (score.outlierScore || 0) < options.minOutlierScore
        ) continue;

        results.push({
            platform: 'instagram',
            id: row.id,
            url: row.url,
            creator: row.creator,
            followers,
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            shares: row.shares,
            saved: row.saved,
            caption: row.caption,
            postedAt: row.postedAt,
            mediaType: row.mediaType,
            mediaProductType: row.mediaProductType,
            baselineViews: formatNumber(score.baselineViews, 0),
            outlierScore: formatNumber(score.outlierScore),
            viewsPerFollower: formatNumber(score.viewsPerFollower),
            engagementProxy: formatNumber(score.engagementProxy, 4),
            viewsPerDay: formatNumber(score.viewsPerDay, 0),
            score: formatNumber(score.score),
            breakoutScore: formatNumber(score.breakoutScore),
            signalStrength: score.signalStrength,
            whyFlagged: buildWhyFlagged({ row, score }),
            source: row.source,
            insightError: row.insightError,
        });
    }
    return sortResults(results, options.sort).slice(0, options.limit);
}

function sortResults(results, sort) {
    const key = sort || 'outlier';
    return results.sort((a, b) => {
        if (key === 'views') return b.views - a.views;
        if (key === 'date') return new Date(b.postedAt || 0) - new Date(a.postedAt || 0);
        if (key === 'velocity') return (b.viewsPerDay || 0) - (a.viewsPerDay || 0);
        if (key === 'views-per-follower') return (b.viewsPerFollower || 0) - (a.viewsPerFollower || 0);
        if (key === 'engagement') return (b.engagementProxy || 0) - (a.engagementProxy || 0);
        if (key === 'score') return (b.breakoutScore || b.score || 0) - (a.breakoutScore || a.score || 0);
        return (b.outlierScore || 0) - (a.outlierScore || 0);
    });
}

function buildWhyFlagged({ row, score }) {
    const parts = [];
    if (score.outlierScore) parts.push(`${score.outlierScore.toFixed(1)}x creator baseline`);
    if (score.viewsPerFollower) parts.push(`${score.viewsPerFollower.toFixed(1)}x followers`);
    if (score.viewsPerDay) parts.push(`${Math.round(score.viewsPerDay).toLocaleString()} views/day`);
    parts.push(`${row.views.toLocaleString()} views`);
    return parts.join('; ');
}
