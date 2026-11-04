// Local operator tool. Outputs private draft plans only; never calls MailerLite.
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSundayDelivery } from './delivery-plan.mjs';

const root = await realpath(fileURLToPath(new URL('./private-content/', import.meta.url)));
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg || process.argv.length !== 4) throw new Error('Usage: node premium/prepare-delivery.mjs PRIVATE_INPUT.json PRIVATE_OUTPUT.json');
const inputPath = await realpath(resolve(inputArg));
const outputPath = resolve(outputArg);
const requested = relative(root, outputPath);
if (requested === '..' || requested.startsWith('../') || isAbsolute(requested)) throw new Error('Output must stay in ignored premium/private-content');
const outputParent = await realpath(dirname(outputPath));
const inside = path => { const value = relative(root, path); return value !== '..' && !value.startsWith('../') && !isAbsolute(value); };
if (!inside(inputPath) || !inside(outputParent)) throw new Error('Input and output must stay in ignored premium/private-content');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const result = prepareSundayDelivery({ ...input, now: input.now ? new Date(input.now) : new Date() });
// Exclusive create: never follow an existing output symlink or overwrite a receipt.
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(`Prepared ${result.batches.length} cohorts; ${result.held.length} held. Nothing scheduled or sent.`);
