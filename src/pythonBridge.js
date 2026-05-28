import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { getEnv, loadPrivateApiConfig } from './credentials.js';

const BRIDGE_PATH = fileURLToPath(new URL('../python/instagrapi_bridge.py', import.meta.url));

export async function collectWithPythonBridge({
    command,
    query = '',
    username = '',
    maxResults = 30,
    pythonBin,
    sessionFile,
} = {}) {
    const config = loadPrivateApiConfig({ pythonBin, sessionFile });
    const python = config.pythonBin || getEnv('IG_PYTHON_BIN') || 'python3';
    const args = [
        BRIDGE_PATH,
        command,
        '--max-results',
        String(maxResults),
    ];
    if (query) args.push('--query', query);
    if (username) args.push('--username', username.replace(/^@/, ''));
    if (config.sessionFile) args.push('--session-file', config.sessionFile);

    const { stdout, stderr } = await runProcess(python, args, {
        ...process.env,
        IG_PRIVATE_USERNAME: config.username || process.env.IG_PRIVATE_USERNAME || '',
        IG_PRIVATE_PASSWORD: config.password || process.env.IG_PRIVATE_PASSWORD || '',
        IG_PRIVATE_SESSION_FILE: config.sessionFile || process.env.IG_PRIVATE_SESSION_FILE || '',
    }, Number.parseInt(process.env.IG_PRIVATE_BRIDGE_TIMEOUT_MS || '90000', 10));

    try {
        return JSON.parse(stdout || '[]');
    } catch (error) {
        throw new Error(`Python Instagram bridge returned non-JSON: ${error.message}${stderr ? `\n${stderr}` : ''}`);
    }
}

function runProcess(command, args, env, timeoutMs) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            settled = true;
            child.kill('SIGTERM');
            reject(new Error(`Python Instagram bridge timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Failed to run Python Instagram bridge with ${command}: ${error.message}`));
        });
        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (code === 0) {
                resolvePromise({ stdout, stderr });
                return;
            }
            reject(new Error(`Python Instagram bridge failed with exit code ${code}${stderr ? `\n${stderr.trim()}` : ''}`));
        });
    });
}
