#!/usr/bin/env node

import { Command } from 'commander';
import { stdin, stdout } from 'process';
import { createInterface } from 'readline/promises';
import { InstagramClient } from './client.js';
import { getDefaultEnvFilePath, getEnv, loadApiConfig, loadOAuthConfig, loadPrivateApiConfig, requireEnv, writeEnvValues } from './credentials.js';
import { findMyOutliers, rankRows, scoreManualFile } from './finder.js';
import { DEFAULT_SCOPES, buildAuthorizationUrl, exchangeCodeForToken, exchangeForLongLivedToken, parseOAuthCallbackInput, refreshLongLivedToken } from './oauth.js';
import { printResults } from './output.js';
import { collectWithPythonBridge } from './pythonBridge.js';

const program = new Command();

program
    .name('igbot')
    .description('Instagram CLI for auth bootstrap and official content publishing')
    .version('1.0.0');

function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid integer: ${value}`);
    return parsed;
}

function parseFloatOption(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

program
    .command('auth-url')
    .description('Generate an Instagram OAuth authorization URL')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Comma- or space-separated scopes', DEFAULT_SCOPES.join(','))
    .option('--state <value>', 'Explicit OAuth state value')
    .action((options) => {
        try {
            requireEnv(['IG_APP_ID']);
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const scopes = options.scope.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
            const { url, state } = buildAuthorizationUrl({
                appId: oauth.appId,
                redirectUri: oauth.redirectUri,
                scopes,
                state: options.state,
            });

            console.log(`State: ${state}`);
            console.log(`Scopes: ${scopes.join(',')}`);
            console.log(`Redirect URI: ${oauth.redirectUri}`);
            console.log(url);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('oauth-login')
    .description('Run Instagram OAuth setup and optionally save the returned token')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Comma- or space-separated scopes', DEFAULT_SCOPES.join(','))
    .option('--state <value>', 'Explicit OAuth state value')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .option('--no-save', 'Print tokens without updating the env file')
    .option('--short-lived', 'Keep the short-lived token instead of exchanging for a long-lived token')
    .action(async (options) => {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            requireEnv(['IG_APP_ID', 'IG_APP_SECRET']);
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const scopes = options.scope.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
            const auth = buildAuthorizationUrl({
                appId: oauth.appId,
                redirectUri: oauth.redirectUri,
                scopes,
                state: options.state,
            });

            console.log(`Redirect URI: ${oauth.redirectUri}`);
            console.log(`Scopes: ${scopes.join(',')}`);
            console.log(`State: ${auth.state}`);
            console.log('\nOpen this URL and authorize the Instagram account:\n');
            console.log(auth.url);
            const callbackInput = await rl.question('\nPaste the full callback URL or code: ');
            const callback = parseOAuthCallbackInput(callbackInput);
            if (callback.error) {
                throw new Error(`Instagram OAuth callback error: ${callback.errorDescription || callback.error}`);
            }
            if (!callback.code) throw new Error('No authorization code found in callback input');
            if (callback.state && callback.state !== auth.state) {
                throw new Error(`OAuth state mismatch. Expected ${auth.state}, got ${callback.state}`);
            }

            const token = await exchangeCodeForToken({
                appId: oauth.appId,
                appSecret: oauth.appSecret,
                redirectUri: oauth.redirectUri,
                code: callback.code,
            });
            const output = options.shortLived
                ? token
                : await exchangeForLongLivedToken({
                    appSecret: oauth.appSecret,
                    shortLivedAccessToken: token.access_token,
                });

            printTokenSummary(output, { userId: token.user_id, envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveTokenEnv({ token: output, userId: token.user_id, envFile: options.envFile });
                console.log(`\nSaved Instagram token values to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exitCode = 1;
        } finally {
            rl.close();
        }
    });

program
    .command('exchange-code <code>')
    .description('Exchange an Instagram OAuth authorization code for a short-lived access token')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--long-lived', 'Immediately exchange the short-lived token for a long-lived token')
    .option('--save', 'Save returned token values to an env file')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .action(async (code, options) => {
        try {
            requireEnv(['IG_APP_ID', 'IG_APP_SECRET']);
            const callback = parseOAuthCallbackInput(code);
            if (callback.error) {
                throw new Error(`Instagram OAuth callback error: ${callback.errorDescription || callback.error}`);
            }
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const token = await exchangeCodeForToken({
                appId: oauth.appId,
                appSecret: oauth.appSecret,
                redirectUri: oauth.redirectUri,
                code: callback.code,
            });

            let output = token;
            if (options.longLived) {
                output = await exchangeForLongLivedToken({
                    appSecret: oauth.appSecret,
                    shortLivedAccessToken: token.access_token,
                });
            }

            printTokenSummary(output, { userId: token.user_id, envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveTokenEnv({ token: output, userId: token.user_id, envFile: options.envFile });
                console.log(`\nSaved Instagram token values to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('refresh-token')
    .description('Refresh a long-lived Instagram access token')
    .option('--save', 'Save returned token values to an env file')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .action(async (options) => {
        try {
            requireEnv(['IG_ACCESS_TOKEN']);
            const token = await refreshLongLivedToken({ accessToken: getEnv('IG_ACCESS_TOKEN') });
            printTokenSummary(token, { envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveTokenEnv({ token, envFile: options.envFile });
                console.log(`\nSaved Instagram token values to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('account')
    .description('Inspect the authenticated Instagram professional account')
    .action(async () => {
        try {
            const client = new InstagramClient();
            const account = await client.getAccount();
            console.log(JSON.stringify(account, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('my-media')
    .description('Fetch recent media for the authenticated Instagram account')
    .option('--max-results <number>', 'Maximum media items to fetch', parseInteger, 60)
    .option('--include-insights', 'Fetch per-media insights when permissions allow')
    .option('--insight-metrics <metrics>', 'Comma-separated media insight metrics')
    .option('--format <format>', 'Output format: table, json, jsonl', 'json')
    .action(async (options) => {
        try {
            const client = new InstagramClient();
            const media = await client.listMedia({
                maxResults: options.maxResults,
                includeInsights: options.includeInsights,
                insightMetrics: options.insightMetrics,
            });
            printResults(media, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('my-outliers')
    .description('Rank recent Instagram media for the authenticated account against its own baseline')
    .option('--max-results <number>', 'Maximum media items to fetch', parseInteger, 60)
    .option('--baseline-media <number>', 'Recent media count to use for baseline', parseInteger, 12)
    .option('--min-baseline-media <number>', 'Minimum baseline media needed for per-item baseline', parseInteger, 3)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-outlier <number>', 'Minimum creator-baseline multiplier', parseFloatOption)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--sort <sort>', 'Sort: outlier, score, views, views-per-follower, engagement, velocity, date', 'outlier')
    .option('--no-insights', 'Skip per-media insights and rank by public media counters only')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (options) => {
        try {
            const results = await findMyOutliers({
                maxResults: options.maxResults,
                baselineMedia: options.baselineMedia,
                minBaselineMedia: options.minBaselineMedia,
                minViews: options.minViews,
                minOutlierScore: options.minOutlier,
                limit: options.limit,
                sort: options.sort,
                includeInsights: options.insights,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('score-file <path>')
    .description('Score a manually collected CSV, JSON, or JSONL worksheet of public Instagram rows')
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--min-outlier <number>', 'Minimum creator-baseline multiplier', parseFloatOption)
    .option('--sort <sort>', 'Sort: outlier, score, views, views-per-follower, engagement, velocity, date', 'score')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action((path, options) => {
        try {
            const results = scoreManualFile(path, {
                limit: options.limit,
                maxFollowers: options.maxFollowers,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower,
                minOutlierScore: options.minOutlier,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('private-login')
    .description('Create or refresh the experimental instagrapi private session file')
    .option('--format <format>', 'Output format: json or table', 'table')
    .action(async (options) => {
        try {
            if (!(getEnv('IG_PRIVATE_USERNAME') || getEnv('IG_USERNAME')) || !(getEnv('IG_PRIVATE_PASSWORD') || getEnv('IG_PASSWORD'))) {
                throw new Error('Missing credentials: IG_PRIVATE_USERNAME/IG_PRIVATE_PASSWORD');
            }
            const rows = await collectWithPythonBridge({ command: 'login', maxResults: 1 });
            if (options.format === 'json') {
                console.log(JSON.stringify(rows, null, 2));
                return;
            }
            const row = rows[0] || {};
            console.log(`Logged in as @${row.username || 'unknown'}`);
            if (row.sessionFile) console.log(`Session file: ${row.sessionFile}`);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('private-profile <username>')
    .description('Experimentally fetch public/recent Instagram media for a creator through the instagrapi bridge')
    .option('--max-results <number>', 'Maximum media items to inspect', parseInteger, 30)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: outlier, score, views, views-per-follower, engagement, velocity, date', 'views-per-follower')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (username, options) => {
        try {
            const rows = await collectWithPythonBridge({
                command: 'profile',
                username,
                maxResults: options.maxResults,
            });
            const results = scoreRows(rows, options);
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('private-search <query>')
    .description('Experimentally search public Instagram Reels through the instagrapi private API bridge')
    .option('--max-results <number>', 'Maximum media items to inspect', parseInteger, 30)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: outlier, score, views, views-per-follower, engagement, velocity, date', 'views-per-follower')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (query, options) => {
        try {
            const rows = await collectWithPythonBridge({
                command: 'search',
                query,
                maxResults: options.maxResults,
            });
            const results = scoreRows(rows, options);
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('private-hashtag <hashtag>')
    .description('Experimentally fetch Instagram hashtag Reels through the instagrapi private API bridge')
    .option('--max-results <number>', 'Maximum media items to inspect', parseInteger, 30)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: outlier, score, views, views-per-follower, engagement, velocity, date', 'views-per-follower')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (hashtag, options) => {
        try {
            const rows = await collectWithPythonBridge({
                command: 'hashtag',
                query: hashtag.replace(/^#/, ''),
                maxResults: options.maxResults,
            });
            const results = scoreRows(rows, options);
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('check')
    .description('Show authenticated account status and recent media above an outlier threshold')
    .option('--max-results <number>', 'Maximum recent media items to fetch', parseInteger, 60)
    .option('--baseline-media <number>', 'Recent media count to use for baseline', parseInteger, 12)
    .option('--min-baseline-media <number>', 'Minimum baseline media needed for per-item baseline', parseInteger, 3)
    .option('--min-views <number>', 'Minimum target media views', parseInteger)
    .option('--min-outlier <number>', 'Minimum creator-baseline multiplier', parseFloatOption, 2)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 10)
    .option('--no-insights', 'Skip per-media insights and rank by public media counters only')
    .option('--format <format>', 'Output format: table or json', 'table')
    .action(async (options) => {
        try {
            const client = new InstagramClient();
            const [account, results] = await Promise.all([
                client.getAccount(),
                findMyOutliers({
                    client,
                    maxResults: options.maxResults,
                    baselineMedia: options.baselineMedia,
                    minBaselineMedia: options.minBaselineMedia,
                    minViews: options.minViews,
                    minOutlierScore: options.minOutlier,
                    limit: options.limit,
                    sort: 'outlier',
                    includeInsights: options.insights,
                }),
            ]);

            if (options.format === 'json') {
                console.log(JSON.stringify({ account, outliers: results }, null, 2));
                return;
            }

            const handle = account.username ? `@${account.username}` : 'authorized account';
            const followerText = account.followers === null ? '-' : account.followers.toLocaleString();
            console.log(`${handle}: ${followerText} followers, ${account.mediaCount.toLocaleString()} media, ${account.accountType || 'professional'} account`);
            console.log(`Recent media above ${options.minOutlier}x creator baseline:`);
            printResults(results, 'table');
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('me')
    .description('Inspect the authenticated Instagram account')
    .action(async () => {
        try {
            const client = new InstagramClient();
            const me = await client.getMe();
            console.log(JSON.stringify(me, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('image <image_url>')
    .description('Publish an image post from a public image URL')
    .option('-c, --caption <text>', 'Caption text')
    .option('--alt-text <text>', 'Accessibility alt text')
    .option('--ig-user-id <id>', 'Override IG user ID')
    .action(async (imageUrl, options) => {
        try {
            const client = new InstagramClient();
            const result = await client.createAndPublishImage({
                igUserId: options.igUserId,
                imageUrl,
                caption: options.caption,
                altText: options.altText,
            });
            console.log('Image published successfully.');
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('video <video_url>')
    .description('Create a video/Reel container from a public video URL')
    .option('-c, --caption <text>', 'Caption text')
    .option('--media-type <type>', 'Instagram media_type, usually REELS for short-form video', 'REELS')
    .option('--cover-url <url>', 'Optional public cover image URL')
    .option('--share-to-feed <value>', 'true or false')
    .option('--thumb-offset <seconds>', 'Video thumbnail frame offset in seconds')
    .option('--ig-user-id <id>', 'Override IG user ID')
    .option('--publish', 'Publish immediately after creating the container')
    .action(async (videoUrl, options) => {
        try {
            const client = new InstagramClient();
            const container = await client.createVideoContainer({
                igUserId: options.igUserId,
                videoUrl,
                caption: options.caption,
                mediaType: options.mediaType,
                coverUrl: options.coverUrl,
                shareToFeed: parseOptionalBoolean(options.shareToFeed),
                thumbOffset: options.thumbOffset,
            });

            if (options.publish) {
                const published = await client.publishContainer({
                    igUserId: options.igUserId,
                    creationId: container.id,
                });
                console.log('Video published successfully.');
                console.log(JSON.stringify({ container, published }, null, 2));
            } else {
                console.log('Video container created.');
                console.log(JSON.stringify(container, null, 2));
                console.log('\nPublish after processing completes with:');
                console.log(`node src/cli.js publish ${container.id}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('story-image <image_url>')
    .description('Create an Instagram Story image container from a public image URL')
    .option('--ig-user-id <id>', 'Override IG user ID')
    .option('--publish', 'Publish immediately after creating the container')
    .action(async (imageUrl, options) => {
        try {
            const client = new InstagramClient();
            const container = await client.createStoryImageContainer({
                igUserId: options.igUserId,
                imageUrl,
            });
            await printContainerResult({
                client,
                container,
                igUserId: options.igUserId,
                publish: options.publish,
                label: 'Story image',
            });
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('story-video <video_url>')
    .description('Create an Instagram Story video container from a public video URL')
    .option('--ig-user-id <id>', 'Override IG user ID')
    .option('--publish', 'Publish immediately after creating the container')
    .action(async (videoUrl, options) => {
        try {
            const client = new InstagramClient();
            const container = await client.createStoryVideoContainer({
                igUserId: options.igUserId,
                videoUrl,
            });
            await printContainerResult({
                client,
                container,
                igUserId: options.igUserId,
                publish: options.publish,
                label: 'Story video',
            });
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('publish <creation_id>')
    .description('Publish a previously created Instagram media container')
    .option('--ig-user-id <id>', 'Override IG user ID')
    .action(async (creationId, options) => {
        try {
            const client = new InstagramClient();
            const result = await client.publishContainer({
                igUserId: options.igUserId,
                creationId,
            });
            console.log('Published successfully.');
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('status <creation_id>')
    .description('Check an Instagram media container processing status')
    .action(async (creationId) => {
        try {
            const client = new InstagramClient();
            const result = await client.getContainerStatus({ creationId });
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('env')
    .description('Show the currently resolved non-secret configuration')
    .action(() => {
        const api = loadApiConfig();
        console.log(JSON.stringify({
            graphBaseUrl: api.graphBaseUrl,
            graphVersion: api.graphVersion,
            igUserId: api.igUserId || null,
            redirectUri: getEnv('IG_REDIRECT_URI') || 'http://127.0.0.1:8787/callback',
            hasAppId: Boolean(getEnv('IG_APP_ID')),
            hasAppSecret: Boolean(getEnv('IG_APP_SECRET')),
            hasAccessToken: Boolean(getEnv('IG_ACCESS_TOKEN')),
            hasPrivateUsername: Boolean(getEnv('IG_PRIVATE_USERNAME') || getEnv('IG_USERNAME')),
            hasPrivatePassword: Boolean(getEnv('IG_PRIVATE_PASSWORD') || getEnv('IG_PASSWORD')),
            privateSessionFile: loadPrivateApiConfig().sessionFile || null,
            pythonBin: getEnv('IG_PYTHON_BIN') || 'python3',
            envFiles: [
                getDefaultEnvFilePath(),
                'igbot/.env',
            ],
        }, null, 2));
    });

program.parse();

function printTokenSummary(token, { userId, envFile = '' } = {}) {
    console.log(JSON.stringify({
        token_type: token.token_type,
        expires_in: token.expires_in,
        user_id: userId || token.user_id,
        has_access_token: Boolean(token.access_token),
    }, null, 2));
    console.log(envFile ? `\nEnv values for ${envFile}:` : '\nSuggested env additions:');
    if (token.access_token) console.log(`IG_ACCESS_TOKEN=${token.access_token}`);
    if (userId || token.user_id) console.log(`IG_USER_ID=${userId || token.user_id}`);
}

function saveTokenEnv({ token, userId, envFile }) {
    return writeEnvValues(envFile, {
        IG_ACCESS_TOKEN: token.access_token,
        IG_USER_ID: userId || token.user_id,
    });
}

function scoreRows(rows, options) {
    return rankRows(rows, {
        maxFollowers: options.maxFollowers,
        minViews: options.minViews,
        minViewsPerFollower: options.minViewsPerFollower,
        limit: options.limit,
        sort: options.sort,
    });
}

async function printContainerResult({ client, container, igUserId, publish, label }) {
    if (!container.id) {
        throw new Error(`${label} container response did not include id: ${JSON.stringify(container)}`);
    }

    if (publish) {
        const published = await client.publishContainer({
            igUserId,
            creationId: container.id,
        });
        console.log(`${label} published successfully.`);
        console.log(JSON.stringify({ container, published }, null, 2));
        return;
    }

    console.log(`${label} container created.`);
    console.log(JSON.stringify(container, null, 2));
    console.log('\nPublish after processing completes with:');
    console.log(`node src/cli.js publish ${container.id}`);
}

function parseOptionalBoolean(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === false) return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    throw new Error(`Expected boolean value, got: ${value}`);
}
