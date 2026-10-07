import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {spawnSync} from 'node:child_process';
if (process.env.ANTIFUND_ENV_FILE) loadEnvFile(process.env.ANTIFUND_ENV_FILE);
else if (existsSync('.env')) loadEnvFile('.env');
if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
  throw new Error('Set explicit project CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN; default Wrangler login is not permitted.');
}
const args=process.argv.slice(2);
if(!args.length)throw new Error('Pass a Wrangler command.');
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
