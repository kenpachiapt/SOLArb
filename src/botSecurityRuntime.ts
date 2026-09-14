// Embedded in standalone runner. No browser credential input is accepted.
export const botSecurityRuntime = String.raw`
function readPrivateFile(filename: string): string {
  if (!path.isAbsolute(filename)) throw new Error('Sır dosyası mutlak yol olmalı.');
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('Geçersiz sır dosyası.');
  if (process.platform !== 'win32') {
    const uid = process.getuid?.();
    if ((stat.mode & 0o077) !== 0 || (stat.uid !== uid && stat.uid !== 0)) throw new Error('Sır dosyası izinleri 0600 olmalı.');
  }
  return fs.readFileSync(filename, 'utf8').trim();
}
function walletFromFile(): Keypair {
  if (process.env.SOLANA_PRIVATE_KEY) throw new Error('SOLANA_PRIVATE_KEY kaldırıldı; SOLANA_KEYPAIR_FILE kullanın.');
  const filename = process.env.SOLANA_KEYPAIR_FILE;
  if (!filename) throw new Error('SOLANA_KEYPAIR_FILE gerekli.');
  let text = readPrivateFile(filename);
  let bytes: Uint8Array | undefined;
  try {
    if (text.startsWith('[')) {
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length !== 64 || !data.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error();
      bytes = Uint8Array.from(data);
    } else bytes = bs58.decode(text);
    if (bytes.length !== 64) throw new Error();
    const pair = Keypair.fromSecretKey(Uint8Array.from(bytes));
    if (!process.env.SOLANA_PUBLIC_ADDRESS || pair.publicKey.toBase58() !== process.env.SOLANA_PUBLIC_ADDRESS) throw new Error();
    return pair;
  } catch { throw new Error('Anahtar geçersiz veya SOLANA_PUBLIC_ADDRESS ile eşleşmiyor.'); }
  finally { text = ''; bytes?.fill(0); }
}
function requiredNumber(name: string, min: number, max: number): number {
  const raw = process.env[name], value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < min || value > max) throw new Error('Geçersiz limit: ' + name);
  return value;
}
function initializeLiveRisk() {
  if (process.env.SOLARB_PANEL_SCANNER === 'true' || process.env.ENABLE_LIVE_TRADING !== 'I_UNDERSTAND_THE_RISKS') throw new Error('Canlı işlem yalnızca VPS operatörü tarafından açılabilir.');
  if (process.platform !== 'linux') throw new Error('Canlı mod için ayrı kullanıcılarla Linux kurulumu gerekli.');
  if (CONFIG.START_TOKEN !== 'SOL' || !CONFIG.USE_JITO) throw new Error('Canlı mod yalnızca SOL başlangıcı ve Jito ile desteklenir.');
  if ((CONFIG.JUPITER_API_URL || 'https://api.jup.ag/swap/v1') !== 'https://api.jup.ag/swap/v1' || CONFIG.JITO_BLOCK_ENGINE_URL !== 'https://mainnet.block-engine.jito.wtf/api/v1/bundles') throw new Error('Canlı işlem uç noktası değiştirilemez.');
  const rpc = new URL(CONFIG.RPC_URL);
  if (rpc.protocol !== 'https:') throw new Error('RPC HTTPS olmalı.');
  const maxTrade = requiredNumber('MAX_TRADE_SOL', 0.000001, 100);
  const dailyRisk = requiredNumber('MAX_DAILY_RISK_SOL', 0.000001, 1000);
  const maxTrades = requiredNumber('MAX_TRADES_PER_DAY', 1, 1000);
  const minBalance = requiredNumber('MIN_RESERVE_SOL', 0.001, 100);
  const maxFees = requiredNumber('MAX_FEES_SOL', 0.000015, 0.1);
  const maxSlippage = requiredNumber('MAX_SLIPPAGE_BPS', 0, 100);
  const tip = requiredNumber('JITO_TIP_SOL', 0.000001, 0.01);
  if (!Number.isInteger(maxTrades) || CONFIG.TRADE_AMOUNT > maxTrade || CONFIG.SLIPPAGE_BPS > maxSlippage) throw new Error('İşlem ayarı operatör limitini aşıyor.');
  if (2 * CONFIG.PRIORITY_FEE_SOL + 0.000015 + tip > maxFees) throw new Error('Ücret ayarı limiti aşıyor.');
  const directory = process.env.BOT_STATE_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error('BOT_STATE_DIR gerekli.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error('BOT_STATE_DIR bot kullanıcısına ait ve 0700 olmalı.');
  const lock = path.join(directory, 'runner.lock');
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  process.once('exit', () => { try { fs.unlinkSync(lock); } catch {} });
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => process.exit(0));
  const filename = path.join(directory, 'risk.json');
  const killSwitch = path.join(directory, 'STOP');
  const read = () => {
    if (!fs.existsSync(filename)) return { day: '', spent: 0, trades: 0, pending: false };
    const value = JSON.parse(readPrivateFile(filename));
    if (!value || typeof value.day !== 'string' || !Number.isFinite(value.spent) || value.spent < 0 || !Number.isInteger(value.trades) || value.trades < 0 || typeof value.pending !== 'boolean') throw new Error('Risk kaydı bozuk.');
    return value;
  };
  const write = (value: any) => {
    const temp = filename + '.tmp';
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, filename);
  };
  if (read().pending || fs.existsSync(killSwitch)) throw new Error('Önceki işlem belirsiz veya STOP dosyası var; operatör kontrolü gerekli.');
  return {
    tip, maxFees,
    check: () => { if (fs.existsSync(killSwitch)) throw new Error('STOP dosyası ile durduruldu.'); },
    reserve: async (connection: Connection, wallet: Keypair) => {
      if (fs.existsSync(killSwitch)) throw new Error('STOP dosyası ile durduruldu.');
      let state = read(); if (state.pending) throw new Error('Belirsiz işlem var.');
      const today = new Date().toISOString().slice(0,10);
      if (state.day !== today) state = { day: today, spent: 0, trades: 0, pending: false };
      // Conservatively charge the entire principal + fee ceiling against the daily risk budget.
      // This is a spending envelope, not a claim to measure realized P&L.
      const exposure = CONFIG.TRADE_AMOUNT + maxFees;
      if (state.trades >= maxTrades || state.spent + exposure > dailyRisk) throw new Error('Günlük işlem/risk limiti doldu.');
      const balance = await connection.getBalance(wallet.publicKey, 'confirmed');
      if (balance / 1e9 < exposure + minBalance) throw new Error('İşlem sonrası rezerv yetersiz.');
      write({ day: today, spent: state.spent + exposure, trades: state.trades + 1, pending: true });
    },
    complete: () => { const state = read(); write({ ...state, pending: false }); },
  };
}
`;
