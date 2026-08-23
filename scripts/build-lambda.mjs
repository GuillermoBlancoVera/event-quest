import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [entryPoint, outfile] = process.argv.slice(2);
if (!entryPoint || !outfile) throw new Error('Usage: build-lambda.mjs <entry-point> <outfile>');

const require = createRequire(resolve(process.cwd(), 'package.json'));
const { build } = require('esbuild');

await build({ entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile });
