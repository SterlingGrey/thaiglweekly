import { existsSync, readFileSync } from 'node:fs';

export function readBeaconToken(path) {
  if (!existsSync(path)) return '';
  const token = readFileSync(path, 'utf8').split(/\r?\n/)
    .map(line => line.trim()).find(line => line && !line.startsWith('#')) || '';
  if (token && !/^[a-f0-9]{32}$/i.test(token)) throw new Error('Invalid Cloudflare beacon token');
  return token;
}
