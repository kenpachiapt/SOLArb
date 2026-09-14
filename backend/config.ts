import { PublicKey } from '@solana/web3.js';
import fs from 'node:fs';
import path from 'node:path';

const symbols = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'WIF'];
const ranges: Record<string, [number, number]> = { amount: [0.000001, 1000], minProfitPct: [0, 100], slippagePct: [0, 5], priorityFeeSol: [0, 0.01], scanInterval: [1, 3600], maxTokens: [1, 5000], scanBatchSize: [1, 500], minLiquidityUsd: [0, 1e12], minVolume24hUsd: [0, 1e12] };
const booleans = ['autoDiscoverMeme', 'autoSpyWallet'];
function mint(value: string) { try { return new PublicKey(value).toBase58() === value; } catch { return false; } }
export function sanitizeConfig(input: unknown, strict = true): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Geçersiz ayarlar.');
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    const invalid = () => { if (strict) throw new Error('Geçersiz veya izin verilmeyen ayar: ' + key.slice(0, 50)); };
    if (Object.hasOwn(ranges, key)) {
      const [min, max] = ranges[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (['maxTokens', 'scanBatchSize'].includes(key) && !Number.isInteger(value))) { invalid(); continue; }
      result[key] = value;
    } else if (booleans.includes(key)) {
      if (typeof value !== 'boolean') { invalid(); continue; } result[key] = value;
    } else if (key === 'startToken' || key === 'interToken') {
      if (typeof value !== 'string' || !(symbols.includes(value) || (key === 'interToken' && value === 'ALL'))) { invalid(); continue; } result[key] = value;
    } else if (key === 'customMints') {
      if (typeof value !== 'string' || value.length > 225000) { invalid(); continue; }
      const mints = value.split(/[\s,;]+/).filter(Boolean);
      if (mints.length > 5000 || !mints.every(mint)) { invalid(); continue; } result[key] = [...new Set(mints)].join(',');
    } else if (key === 'spyWalletAddress') {
      if (typeof value !== 'string' || (value !== '' && !mint(value))) { invalid(); continue; } result[key] = value;
    } else if (key === 'dryRun' && value === true) { result[key] = true;
    } else if (key === 'useJito' && value === true) { result[key] = true;
    } else { invalid(); }
  }
  return { ...result, dryRun: true, useJito: true };
}
export function writeConfig(directory: string, data: Record<string, any>) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'scanner.json'), temp = path.join(directory, 'scanner.tmp');
  const fd = fs.openSync(temp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(sanitizeConfig(data), null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temp, target);
}
export function readConfig(directory: string) {
  const target = path.join(directory, 'scanner.json');
  return fs.existsSync(target) ? sanitizeConfig(JSON.parse(fs.readFileSync(target, 'utf8')), false) : { dryRun: true, useJito: true };
}
