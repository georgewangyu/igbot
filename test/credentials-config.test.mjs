import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const product = 'igbot';
const key = 'IG_ACCESS_TOKEN';
const overrideKey = product.toUpperCase() + '_ENV_FILE';

test('external config selects the private file; explicit override isolates default and ambient credentials', async () => {
    const root = mkdtempSync(join(tmpdir(), 'credential-config-'));
    const oldHome = process.env.HOME;
    const oldOverride = process.env[overrideKey];
    const oldValue = process.env[key];
    try {
        process.env.HOME = root;
        delete process.env[overrideKey];
        delete process.env[key];
        const configDir = join(root, '.config', product);
        mkdirSync(configDir, { recursive: true });
        const source = join(root, 'default.env');
        const override = join(root, 'override.env');
        writeFileSync(source, key + '=FAKE_DEFAULT_FOR_TESTING_ONLY\n');
        writeFileSync(override, key + '=FAKE_OVERRIDE_FOR_TESTING_ONLY\n');
        writeFileSync(join(configDir, 'config.json'), JSON.stringify({ envFile: source }));
        mkdirSync(join(root, 'src'));
        writeFileSync(join(root, '.env'), key + '=FAKE_LOCAL_FOR_TESTING_ONLY\n');
        const modulePath = join(root, 'src', 'credentials.mjs');
        copyFileSync(new URL('../src/credentials.js', import.meta.url), modulePath);
        const normal = await import(pathToFileURL(modulePath).href + '?normal');
        assert.equal(normal.getEnv(key), 'FAKE_DEFAULT_FOR_TESTING_ONLY');
        process.env[overrideKey] = override;
        process.env[key] = 'FAKE_AMBIENT_FOR_TESTING_ONLY';
        writeFileSync(join(configDir, 'config.json'), '{malformed default config');
        const selected = await import(pathToFileURL(modulePath).href + '?override');
        assert.equal(selected.getEnv(key), 'FAKE_OVERRIDE_FOR_TESTING_ONLY');
        assert.equal(selected.getEnv('UNSET_CREDENTIAL'), '');
    } finally {
        if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
        if (oldOverride === undefined) delete process.env[overrideKey]; else process.env[overrideKey] = oldOverride;
        if (oldValue === undefined) delete process.env[key]; else process.env[key] = oldValue;
        rmSync(root, { recursive: true, force: true });
    }
});
