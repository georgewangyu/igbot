import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { resolve } from 'path';
import { getEnv, loadApiConfig, loadPrivateApiConfig } from './credentials.js';

export function tokenState(token, expiresAt, { now = Date.now() } = {}) {
    if (!token) return { status: 'missing', expiresAt: null };
    if (!expiresAt) return { status: 'configured-unverified', expiresAt: null };
    const timestamp = Date.parse(expiresAt);
    if (!Number.isFinite(timestamp)) return { status: 'configured-invalid-expiry', expiresAt };
    return { status: timestamp <= now ? 'expired' : 'valid', expiresAt };
}

export function buildHealthReport({
    now = Date.now(),
    api = loadApiConfig(),
    privateApi = loadPrivateApiConfig(),
    accessToken = getEnv('IG_ACCESS_TOKEN'),
    accessTokenExpiresAt = getEnv('IG_ACCESS_TOKEN_EXPIRES_AT'),
    appId = getEnv('IG_APP_ID'),
    appSecret = getEnv('IG_APP_SECRET'),
    sessionFileExists = privateApi.sessionFile ? existsSync(resolveSessionPath(privateApi.sessionFile)) : false,
    pythonInstagrapiInstalled = inspectPythonModule(privateApi.pythonBin, 'instagrapi'),
    live = null,
} = {}) {
    const access = tokenState(accessToken, accessTokenExpiresAt, { now });
    return {
        mutationPolicy: 'local-read-only by default; --live performs one read-only /me GET; no refresh, login, or writes',
        collectionOrder: ['official-owned-account-api', 'direct-public-profile', 'manual-score-file', 'unofficial-instagram-adapter-last-resort'],
        capabilities: {
            manualScoring: { status: 'available', command: 'score-file' },
            directPublicProfile: { status: 'available', command: 'public-profile' },
            officialApi: {
                status: live?.status || access.status,
                accessToken: access,
                hasUserId: Boolean(api.igUserId),
                hasAppId: Boolean(appId),
                hasAppSecret: Boolean(appSecret),
                healthAutoRefresh: false,
                liveProbe: live,
            },
            unofficialAdapter: {
                status: pythonInstagrapiInstalled ? 'available-disabled' : 'unavailable-disabled',
                enabledByDefault: false,
                requiredFlag: '--enable-unofficial-adapter',
                anonymousByDefault: true,
                privateSessionRequiresFlag: '--use-private-session',
                sessionConfigured: Boolean(privateApi.sessionFile),
                sessionFileExists,
                credentialsConfigured: Boolean(privateApi.username && privateApi.password),
                pythonInstagrapiInstalled,
                collectorAutoLogin: false,
                collectorSessionWrites: false,
            },
        },
    };
}

export function summarizeLiveProbeError(error) {
    const code = error?.payload?.error?.code;
    const status = code === 190 || /expired|invalid.*token|token.*invalid/i.test(error?.message || '')
        ? 'expired-or-invalid'
        : 'error';
    return {
        status,
        httpStatus: error?.status || null,
        platformCode: code || null,
    };
}

function resolveSessionPath(value) {
    if (value.startsWith('~/')) return resolve(homedir(), value.slice(2));
    return resolve(value);
}

function inspectPythonModule(pythonBin, moduleName) {
    const result = spawnSync(pythonBin || 'python3', [
        '-c',
        `import importlib.util; raise SystemExit(0 if importlib.util.find_spec(${JSON.stringify(moduleName)}) else 1)`,
    ], { stdio: 'ignore', timeout: 5000 });
    return result.status === 0;
}
