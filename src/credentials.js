import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return {};

    const loaded = {};
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;

        const [key, ...rest] = line.split('=');
        let value = rest.join('=').trim();
        if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
            value = value.slice(1, -1);
        }
        loaded[key.trim()] = value;
    }
    return loaded;
}

let fileVars = null;

function getFileVars() {
    if (fileVars) return fileVars;

    const dir = fileURLToPath(new URL('.', import.meta.url));
    const localEnv = resolve(dir, '..', '.env');
    const privateEnv = resolve(homedir(), 'Documents/Workspace/georgerepo/.tokens/instagram.env');

    fileVars = { ...loadEnvFile(privateEnv), ...loadEnvFile(localEnv) };
    return fileVars;
}

export function getEnv(key) {
    return process.env[key] || getFileVars()[key] || '';
}

export function requireEnv(keys) {
    const missing = keys.filter((key) => !getEnv(key));
    if (missing.length) {
        throw new Error(`Missing credentials: ${missing.join(', ')}`);
    }
}

export function loadOAuthConfig(overrides = {}) {
    return {
        appId: overrides.appId || getEnv('IG_APP_ID'),
        appSecret: overrides.appSecret || getEnv('IG_APP_SECRET'),
        redirectUri: overrides.redirectUri || getEnv('IG_REDIRECT_URI') || 'http://127.0.0.1:8787/callback',
    };
}

export function loadApiConfig() {
    return {
        accessToken: getEnv('IG_ACCESS_TOKEN'),
        igUserId: getEnv('IG_USER_ID'),
        graphBaseUrl: getEnv('IG_GRAPH_BASE_URL') || 'https://graph.instagram.com',
        graphVersion: getEnv('IG_GRAPH_VERSION') || 'v25.0',
    };
}
