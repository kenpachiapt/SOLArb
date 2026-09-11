import { writeFileSync } from 'node:fs';
import { generateArbitrageCode } from '../src/arbitrageCode.ts';

writeFileSync(new URL('../SOLArb/bot.ts', import.meta.url), generateArbitrageCode({
  rpcUrl: 'https://api.mainnet-beta.solana.com', startToken: 'SOL', interToken: 'ALL',
  amount: 5, minProfitPct: 0.5, slippagePct: 0.2, useJito: true,
  priorityFeeSol: 0.0001, scanIntervalMs: 5000,
}));
