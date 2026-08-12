import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve('dist', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

let shortSha = 'local';
try {
  shortSha = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim() || 'local';
} catch {
  // Build continua utilizável mesmo fora de um checkout Git.
}

const displayVersion = `${manifest.version}+${shortSha}`;
manifest.version_name = displayVersion;
manifest.action = {
  ...manifest.action,
  default_title: `Download de Edições DOE · v${displayVersion}`
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Extensão versionada: v${displayVersion}`);
