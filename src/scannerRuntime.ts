// Embedded into the downloadable bot so it remains a standalone TypeScript file.
export const scannerRuntime = String.raw`
type ScanTarget = { symbol: string; mint: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function setting(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(n)
    ? fallback : Math.min(max, Math.max(min, n));
}
const SCANNER = {
  maxTokens: Math.floor(setting(process.env.SOLANA_MAX_TOKENS ?? CONFIG.MAX_TOKENS, 500, 1, 5000)),
  batchSize: Math.floor(setting(process.env.SOLANA_SCAN_BATCH_SIZE ?? CONFIG.SCAN_BATCH_SIZE, 25, 1, 500)),
  minLiquidity: setting(process.env.SOLANA_MIN_LIQUIDITY_USD ?? CONFIG.MIN_LIQUIDITY_USD, 50000, 0, 1e12),
  minVolume: setting(process.env.SOLANA_MIN_VOLUME_24H_USD ?? CONFIG.MIN_VOLUME_24H_USD, 10000, 0, 1e12),
  refreshMs: setting(process.env.SOLANA_DISCOVERY_REFRESH_MS, 300000, 60000, 86400000),
  requestMs: setting(process.env.JUPITER_REQUEST_INTERVAL_MS, 1100, 50, 60000),
  timeoutMs: setting(process.env.HTTP_TIMEOUT_MS, 10000, 100, 60000),
  maxQuoteAgeMs: setting(process.env.MAX_QUOTE_AGE_MS, 10000, 100, 60000),
  maxImpactPct: setting(process.env.MAX_PRICE_IMPACT_PCT, 1, 0, 100),
  dryRun: process.env.SOLARB_PANEL_SCANNER === 'true' || process.env.SOLANA_DRY_RUN !== 'false',
};
const jupiterKey = process.env.JUPITER_API_KEY || '';
let nextJupiterRequest = 0;
let nextDexRequest = 0;
async function requestJson(url: string, init: RequestInit = {}, jupiter = false): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // All scanner requests are sequential. Quotes and discovery share the same budget.
    const next = jupiter ? nextJupiterRequest : nextDexRequest;
    await sleep(Math.max(0, next - Date.now()));
    if (jupiter) nextJupiterRequest = Date.now() + SCANNER.requestMs;
    else nextDexRequest = Date.now() + 1100;
    const headers = new Headers(init.headers);
    // Never forward the official API key to a custom endpoint.
    if (jupiter && jupiterKey && new URL(url).origin === 'https://api.jup.ag') headers.set('x-api-key', jupiterKey);
    try {
      const response = await fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(SCANNER.timeoutMs) });
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers.get('retry-after');
        const seconds = Number(retry);
        const retryMs = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 0;
        const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
        if (jupiter) nextJupiterRequest = Math.max(nextJupiterRequest, Date.now() + delay);
        else nextDexRequest = Math.max(nextDexRequest, Date.now() + delay);
        if (attempt < 2) continue;
      }
      if (!response.ok) throw new Error('HTTP ' + response.status + ' (' + new URL(url).pathname + ')');
      return await response.json();
    } catch (error: any) {
      if (attempt < 2 && (error.name === 'TimeoutError' || error instanceof TypeError)) continue;
      throw error;
    }
  }
}
function validMint(mint: unknown): mint is string {
  if (typeof mint !== 'string') return false;
  try { return new PublicKey(mint).toBase58() === mint; } catch { return false; }
}
function uniqueTargets(targets: ScanTarget[], exclude: string, limit: number): ScanTarget[] {
  const result = new Map<string, ScanTarget>();
  for (const target of targets) {
    if (target.mint !== exclude && validMint(target.mint) && !result.has(target.mint)) result.set(target.mint, target);
    if (result.size >= limit) break;
  }
  return [...result.values()];
}
function selectJupiterTokens(data: any): ScanTarget[] {
  if (!Array.isArray(data)) throw new Error('Invalid Jupiter token list');
  return data.filter(t => validMint(t.id) && Number.isFinite(Number(t.liquidity)) && t.liquidity >= SCANNER.minLiquidity
    && Number.isFinite(Number(t.stats24h?.buyVolume)) && Number.isFinite(Number(t.stats24h?.sellVolume))
    && Number(t.stats24h.buyVolume) + Number(t.stats24h.sellVolume) >= SCANNER.minVolume
    && t.isBanned !== true)
    .sort((a, b) => Number(b.liquidity) - Number(a.liquidity))
    .map(t => ({ mint: t.id, symbol: String(t.symbol || t.id.slice(0, 6)).slice(0, 24) }));
}
const discoveryCache = new Map<string, { at: number; tokens: ScanTarget[] }>();
let lastDiscoveryAttempt = -Infinity;
let cachedMemeTokens: ScanTarget[] = [];
async function fetchTrendingMemeTokens(): Promise<ScanTarget[]> {
  const now = Date.now();
  if (now - lastDiscoveryAttempt < SCANNER.refreshMs) return cachedMemeTokens;
  lastDiscoveryAttempt = now; // Cache failures too, including an empty initial result.
  const sources = [
    'https://api.jup.ag/tokens/v2/tag?query=verified',
    'https://api.jup.ag/tokens/v2/toptraded/24h?limit=100',
    'https://api.jup.ag/tokens/v2/toptrending/1h?limit=100',
  ];
  for (const url of sources) {
    try { discoveryCache.set(url, { at: now, tokens: selectJupiterTokens(await requestJson(url, {}, true)) }); }
    catch (error: any) { console.warn('[Keşif] ' + error.message + '; geçerli önbellek korunuyor.'); }
  }
  const dexSource = 'dexscreener';
  try {
    const profiles = await requestJson('https://api.dexscreener.com/token-profiles/latest/v1');
    if (!Array.isArray(profiles)) throw new Error('Invalid DexScreener profiles');
    const mints = [...new Set<string>(profiles.filter(t => t.chainId === 'solana' && validMint(t.tokenAddress)).map(t => t.tokenAddress))];
    const tokens: ScanTarget[] = [];
    for (let i = 0; i < mints.length; i += 30) {
      const batch = mints.slice(i, i + 30);
      const pairs = await requestJson('https://api.dexscreener.com/tokens/v1/solana/' + batch.join(','));
      if (!Array.isArray(pairs)) throw new Error('Invalid DexScreener pairs');
      for (const pair of pairs) {
        if (pair.chainId === 'solana' && batch.includes(pair.baseToken?.address)
          && Number(pair.liquidity?.usd) >= SCANNER.minLiquidity && Number(pair.volume?.h24) >= SCANNER.minVolume) {
          tokens.push({ mint: pair.baseToken.address, symbol: String(pair.baseToken.symbol || 'SPL').slice(0, 24) });
        }
      }
    }
    discoveryCache.set(dexSource, { at: now, tokens });
  } catch (error: any) { console.warn('[Keşif] DexScreener: ' + error.message); }
  // Failed sources keep their own previous tokens for at most one hour.
  cachedMemeTokens = uniqueTargets([...discoveryCache.values()].filter(c => now - c.at < 3600000).flatMap(c => c.tokens), CONFIG.START_MINT, SCANNER.maxTokens);
  console.log('[Keşif] ' + cachedMemeTokens.length + ' filtrelenmiş token / hedef ' + SCANNER.maxTokens);
  if (!jupiterKey && cachedMemeTokens.length === 0) console.warn('[Keşif] Token listesi boş. Jupiter erişimi için sunucuda JUPITER_API_KEY ayarlayın.');
  return cachedMemeTokens;
}
const scanTargets: ScanTarget[] = [];
let scanCursor = 0;
function updateScanTargets(discovered: ScanTarget[] = []) {
  const defaults = [
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
    { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  ];
  const manual = CONFIG.CUSTOM_MINTS.split(/[\s,;]+/).filter(Boolean).map(mint => ({ mint, symbol: 'SPL_' + mint.slice(0, 6) }));
  const base = CONFIG.INTER_TOKEN === 'ALL' ? defaults : [{ symbol: CONFIG.INTER_TOKEN, mint: CONFIG.INTER_MINT }];
  const nextMint = scanTargets[scanCursor % Math.max(1, scanTargets.length)]?.mint;
  const next = uniqueTargets([...base, ...manual, ...discovered], CONFIG.START_MINT, SCANNER.maxTokens);
  scanTargets.splice(0, scanTargets.length, ...next);
  const preservedIndex = scanTargets.findIndex(t => t.mint === nextMint);
  scanCursor = preservedIndex < 0 ? 0 : preservedIndex;
}
function nextScanBatch(): ScanTarget[] {
  const batch: ScanTarget[] = [];
  const count = Math.min(SCANNER.batchSize, scanTargets.length);
  for (let i = 0; i < count; i++) batch.push(scanTargets[(scanCursor + i) % scanTargets.length]);
  scanCursor = scanTargets.length ? (scanCursor + count) % scanTargets.length : 0;
  return batch;
}
function quoteIsValid(q: any, inputMint: string, outputMint: string, amount: number | string) {
  return q && q.inputMint === inputMint && q.outputMint === outputMint && q.inAmount === String(amount)
    && /^\d+$/.test(q.outAmount) && BigInt(q.outAmount) > 0n
    && /^\d+$/.test(q.otherAmountThreshold) && BigInt(q.otherAmountThreshold) > 0n
    && BigInt(q.otherAmountThreshold) <= BigInt(q.outAmount)
    && Array.isArray(q.routePlan) && q.routePlan.length > 0
    && Number.isFinite(Number(q.priceImpactPct)) && Math.abs(Number(q.priceImpactPct)) <= SCANNER.maxImpactPct;
}
`;
