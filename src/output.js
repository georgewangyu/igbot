function valueOrDash(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
}

function truncate(value, width) {
    const text = valueOrDash(value);
    if (text.length <= width) return text;
    return `${text.slice(0, Math.max(0, width - 3))}...`;
}

export function printResults(results, format = 'table') {
    if (format === 'json') {
        console.log(JSON.stringify(results, null, 2));
        return;
    }
    if (format === 'jsonl') {
        for (const result of results) {
            console.log(JSON.stringify(result));
        }
        return;
    }
    printTable(results);
}

function printTable(results) {
    if (results.length === 0) {
        console.log('No matching Instagram outliers found.');
        return;
    }

    const rows = results.map((result, index) => ({
        '#': index + 1,
        score: result.score,
        outlier: result.outlierScore ?? '-',
        vpf: result.viewsPerFollower ?? '-',
        views: result.views,
        likes: result.likes,
        comments: result.comments,
        caption: result.caption,
        url: result.url,
    }));

    const columns = [
        ['#', 3],
        ['score', 8],
        ['outlier', 8],
        ['vpf', 8],
        ['views', 11],
        ['likes', 9],
        ['comments', 9],
        ['caption', 52],
        ['url', 48],
    ];

    console.log(columns.map(([key, width]) => truncate(key, width).padEnd(width)).join('  '));
    console.log(columns.map(([, width]) => '-'.repeat(width)).join('  '));

    for (const row of rows) {
        console.log(columns.map(([key, width]) => truncate(row[key], width).padEnd(width)).join('  '));
    }
}
