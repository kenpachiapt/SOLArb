import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { scannerRuntime } from '../src/scannerRuntime.ts';
import { generateArbitrageCode } from '../src/arbitrageCode.ts';

const SOL = 'So11111111111111111111111111111111111111112';
const mint = (n: number) => { const b = Buffer.alloc(32); b.writeUInt32LE(n + 1); return new PublicKey(b).toBase58(); };
const defaults = { rpcUrl: '', startToken: 'SOL', interToken: 'ALL', amount: 5, minProfitPct: 0.5, slippagePct: 0.2, useJito: true, priorityFeeSol: 0.0001, scanIntervalMs: 5000 };
function runtime(config: any = {}, env: any = {}, fetcher: any = async () => Response.json([])) {
  let now = 100000;
  const context = vm.createContext({
    CONFIG: { START_MINT: SOL, INTER_TOKEN: 'ALL', CUSTOM_MINTS: '', ...config },
    process: { env }, PublicKey, Headers, URL, AbortSignal, fetch: fetcher,
    console: { log() {}, warn() {} },
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn: () => void, ms: number) => { now += ms; fn(); },
  });
  vm.runInContext(ts.transpileModule(scannerRuntime, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { run: (code: string) => vm.runInContext(code, context), context, advance: (ms: number) => { now += ms; } };
}

test('600 valid mints are deduplicated, capped at 500 and fully covered by rotating batches', () => {
  const r = runtime();
  r.context.tokens = Array.from({ length: 600 }, (_, i) => ({ mint: mint(i), symbol: 'T' + i }));
  r.run('updateScanTargets([...tokens, ...tokens, {mint: "invalid", symbol: "BAD"}, {mint: CONFIG.START_MINT, symbol: "SOL"}])');
  assert.equal(r.run('scanTargets.length'), 500);
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) for (const t of r.run('nextScanBatch()')) seen.add(t.mint);
  assert.equal(seen.size, 500);
  assert(!seen.has(SOL));
  assert(!seen.has('invalid'));
});
test('refresh preserves next target and handles shrinking/empty lists', () => {
  const r = runtime({ INTER_TOKEN: 'ONE', INTER_MINT: mint(0) });
  r.context.tokens = Array.from({ length: 50 }, (_, i) => ({ mint: mint(i), symbol: 'T' }));
  r.run('updateScanTargets(tokens); nextScanBatch(); updateScanTargets(tokens)');
  assert.equal(r.run('nextScanBatch()[0].mint'), mint(25));
  r.run('CONFIG.INTER_MINT = "bad"; updateScanTargets([])');
  assert.equal(r.run('nextScanBatch().length'), 0);
});
test('liquidity/volume filters reject missing stats and sort eligible tokens', () => {
  const r = runtime();
  r.context.data = [
    { id: mint(1), liquidity: 60000, stats24h: { buyVolume: 6000, sellVolume: 6000 } },
    { id: mint(2), liquidity: 1000, stats24h: { buyVolume: 6000, sellVolume: 6000 } },
    { id: mint(3), liquidity: 90000 },
    { id: mint(4), liquidity: 90000, stats24h: { buyVolume: 8000, sellVolume: 8000 } },
  ];
  assert.deepEqual(Array.from(r.run('selectJupiterTokens(data)'), (t: any) => t.mint), [mint(4), mint(1)]);
});
test('discovery requests verified universe plus <=100 categories; caches failures and expires stale sources', async () => {
  const calls: string[] = [];
  let fail = false;
  const r = runtime({}, { JUPITER_API_KEY: 'test' }, async (url: string) => {
    calls.push(url);
    if (fail) return new Response('', { status: 503 });
    return Response.json(url.includes('/tag?') ? Array.from({ length: 620 }, (_, i) => ({ id: mint(i), liquidity: 100000, stats24h: { buyVolume: 10000, sellVolume: 10000 } })) : []);
  });
  assert.equal((await r.run('fetchTrendingMemeTokens()')).length, 500);
  assert(calls.includes('https://api.jup.ag/tokens/v2/tag?query=verified'));
  assert.equal(calls.filter(u => u.includes('limit=100')).length, 2);
  const count = calls.length;
  await r.run('fetchTrendingMemeTokens()');
  assert.equal(calls.length, count);
  fail = true;
  r.advance(300001);
  assert.equal((await r.run('fetchTrendingMemeTokens()')).length, 500);
  r.advance(3600001);
  assert.equal((await r.run('fetchTrendingMemeTokens()')).length, 0);
});
test('DexScreener enrichment batches 65 mints as 30/30/5', async () => {
  const sizes: number[] = [];
  const r = runtime({}, {}, async (url: string) => {
    if (url.includes('api.jup.ag')) return Response.json([]);
    if (url.includes('profiles')) return Response.json(Array.from({length: 65}, (_, i) => ({chainId:'solana',tokenAddress:mint(i)})));
    const batch = url.split('/').at(-1)!.split(','); sizes.push(batch.length);
    return Response.json(batch.map(address => ({chainId:'solana',baseToken:{address,symbol:'T'},liquidity:{usd:100000},volume:{h24:20000}})));
  });
  assert.equal((await r.run('fetchTrendingMemeTokens()')).length, 65);
  assert.deepEqual(sizes, [30,30,5]);
});
test('429 respects Retry-After and API key never reaches custom host', async () => {
  const headers: Headers[] = [];
  const r = runtime({}, { JUPITER_API_KEY: 'secret' }, async (_: string, init: any) => {
    headers.push(init.headers);
    return headers.length === 1 ? new Response('', {status:429,headers:{'retry-after':'2'}}) : Response.json({ok:true});
  });
  await r.run("requestJson('https://api.jup.ag/test', {}, true)");
  assert(r.run('Date.now()') >= 102000);
  assert.equal(headers[1].get('x-api-key'), 'secret');
  await r.run("requestJson('https://custom.example/quote', {}, true)");
  assert.equal(headers[2].get('x-api-key'), null);
});
test('bad quote amounts, missing routes and high price impact are rejected', () => {
  const r = runtime();
  r.context.q = {inputMint:SOL,outputMint:mint(1),inAmount:'100',outAmount:'110',otherAmountThreshold:'109',routePlan:[{}],priceImpactPct:'0.1'};
  assert.equal(r.run('quoteIsValid(q, q.inputMint, q.outputMint, 100)'), true);
  for (const change of ["q.outAmount = 'NaN'", "q.inAmount = '99'", "q.routePlan = []", "q.priceImpactPct = '2'"]) {
    r.run(change); assert.equal(r.run('!!quoteIsValid(q, q.inputMint, q.outputMint, 100)'), false);
  }
});
test('standalone bot is generated from the same template and parses with escaped input', () => {
  const code = generateArbitrageCode({...defaults, rpcUrl: 'https://api.mainnet-beta.solana.com'});
  assert.equal(readFileSync(new URL('../SOLArb/bot.ts', import.meta.url), 'utf8'), code);
  const custom = generateArbitrageCode({...defaults, customMints:'"\\\n', privateKey:'"\\\n'});
  const source = ts.createSourceFile('bot.ts',custom,ts.ScriptTarget.Latest,true);
  assert.equal((source as any).parseDiagnostics.length, 0);
  assert(custom.includes('while (true)'));
  assert(!custom.includes('setInterval(async'));
  assert(custom.includes('DRY_RUN: true'));
});

test('dry-run roundtrip uses first-leg minimum, reports candidate, never signs or broadcasts', async () => {
  const logs: string[] = [];
  const amounts: string[] = [];
  const code = generateArbitrageCode({...defaults, interToken:'USDC', autoDiscoverMeme:false});
  const executable = code.replace(/^import .*;$/gm, '')
    .replace('const __filename = fileURLToPath(import.meta.url);', "const __filename = '/bot.ts';")
    .slice(0, code.replace(/^import .*;$/gm, '').replace('const __filename = fileURLToPath(import.meta.url);', "const __filename = '/bot.ts';").lastIndexOf('main().catch'));
  const context = vm.createContext({ process:{env:{}}, PublicKey, Headers, URL, URLSearchParams, AbortSignal, Buffer,
    dns:{}, dotenv:{config(){}}, path:{dirname:()=> '/',join:()=>'/missing'}, fs:{existsSync:()=>false},
    Keypair:{generate:()=>({})}, Connection:class {},
    console:{log:(...x:any[])=>logs.push(x.join(' ')),warn(){},error(){}},
    setTimeout:(fn:()=>void)=>fn(),
    fetch:async (url:string) => {
      const p=new URL(url).searchParams; amounts.push(p.get('amount')!);
      const first=amounts.length===1;
      return Response.json({inputMint:p.get('inputMint'),outputMint:p.get('outputMint'),inAmount:p.get('amount'),
        outAmount:first?'1000000000':'5100000000',otherAmountThreshold:first?'990000000':'5090000000',
        priceImpactPct:'0.1',routePlan:[{swapInfo:{ammKey:first?'pool-a':'pool-b'}}]});
    },
  });
  vm.runInContext(ts.transpileModule(executable,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await vm.runInContext('checkArbitrage()',context);
  assert.deepEqual(amounts,['5000000000','990000000']);
  assert(logs.some(l=>l.includes('FIRSAT ADAYI / TARAMA')));
  assert(logs.some(l=>l.includes('işlem gönderilmedi')));
});
