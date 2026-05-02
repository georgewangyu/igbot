#!/usr/bin/env node

import { Command } from 'commander';
import { InstagramClient } from './client.js';
import { getEnv, loadApiConfig, loadOAuthConfig, requireEnv } from './credentials.js';
import { buildAuthorizationUrl, exchangeCodeForToken, exchangeForLongLivedToken, refreshLongLivedToken } from './oauth.js';

const program = new Command();

program
    .name('igbot')
    .description('Instagram CLI for auth bootstrap and official content publishing')
    .version('1.0.0');

program
    .command('auth-url')
    .description('Generate an Instagram OAuth authorization URL')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Comma- or space-separated scopes', 'instagram_business_basic,instagram_business_content_publish')
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
            console.log(url);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('exchange-code <code>')
    .description('Exchange an Instagram OAuth authorization code for a short-lived access token')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--long-lived', 'Immediately exchange the short-lived token for a long-lived token')
    .action(async (code, options) => {
        try {
            requireEnv(['IG_APP_ID', 'IG_APP_SECRET']);
            const oauth = loadOAuthConfig({ redirectUri: options.redirectUri });
            const token = await exchangeCodeForToken({
                appId: oauth.appId,
                appSecret: oauth.appSecret,
                redirectUri: oauth.redirectUri,
                code,
            });

            let output = token;
            if (options.longLived) {
                output = await exchangeForLongLivedToken({
                    appSecret: oauth.appSecret,
                    shortLivedAccessToken: token.access_token,
                });
            }

            console.log(JSON.stringify(output, null, 2));
            if (output.access_token) {
                console.log('\nSuggested env additions:');
                console.log(`IG_ACCESS_TOKEN=${output.access_token}`);
            }
            if (token.user_id) {
                console.log(`IG_USER_ID=${token.user_id}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('refresh-token')
    .description('Refresh a long-lived Instagram access token')
    .action(async () => {
        try {
            requireEnv(['IG_ACCESS_TOKEN']);
            const token = await refreshLongLivedToken({ accessToken: getEnv('IG_ACCESS_TOKEN') });
            console.log(JSON.stringify(token, null, 2));
            if (token.access_token) {
                console.log('\nSuggested env addition:');
                console.log(`IG_ACCESS_TOKEN=${token.access_token}`);
            }
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
        }, null, 2));
    });

program.parse();

function parseOptionalBoolean(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === false) return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    throw new Error(`Expected boolean value, got: ${value}`);
}
