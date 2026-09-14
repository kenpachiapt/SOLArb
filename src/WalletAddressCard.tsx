import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Wallet } from 'lucide-react';
import { publicAddress } from './walletAddress';
import { apiFetch } from './api';

export function WalletAddressCard() {
  const [manual, setManual] = useState(() => localStorage.getItem('solarb_public_address') || '');
  const [copyMessage, setCopyMessage] = useState('');
  const [configured, setConfigured] = useState<string | null>(null);
  const manualAddress = publicAddress(manual);
  const address = configured || manualAddress;
  useEffect(() => {
    apiFetch('/api/wallet').then(r => r.ok ? r.json() : null).then(d => setConfigured(d?.address ? publicAddress(d.address) : null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (manualAddress) localStorage.setItem('solarb_public_address', manualAddress);
    else localStorage.removeItem('solarb_public_address');
  }, [manualAddress]);
  useEffect(() => { setCopyMessage(''); }, [address]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyMessage('Adres kopyalandı.');
    } catch {
      setCopyMessage('Kopyalanamadı. Aşağıdaki adresi seçip elle kopyalayabilirsiniz.');
    }
  }

  return <section aria-label="Cüzdan adresim" className="bg-[#121215] border border-[#222226] p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><Wallet className="w-4 h-4 text-indigo-400" />Cüzdan adresim <span className="text-xs text-zinc-500">Solana Mainnet</span></h2>
      {address && <div className="flex items-center gap-4 text-xs text-indigo-300">
        <button type="button" onClick={copyAddress} className="flex items-center gap-1"><Copy className="w-4 h-4" />Adresi kopyala</button>
        <a href={'https://solscan.io/account/' + address} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">Solscan'de görüntüle<ExternalLink className="w-4 h-4" /></a>
      </div>}
    </div>
    {address ? <p className="font-mono text-sm text-emerald-300 break-all select-all">{address}</p>
      : <p className="text-sm text-zinc-400">Henüz bir cüzdan adresi belirtilmedi.</p>}
    <p className="text-xs text-zinc-400">{configured
      ? 'VPS operatörünün belirlediği herkese açık adres. Panel özel anahtara erişmez; canlı botun çalıştığını göstermez.'
      : 'Phantom veya Solflare içinde Al / Receive bölümündeki Solana adresinizi aşağıya yapıştırın. Bu alan yalnızca adresi gösterir; botun işlem cüzdanını değiştirmez.'}</p>
    {!configured && <label className="block text-xs text-zinc-400">Herkese açık Solana adresi
      <input value={manual} onChange={e => setManual(e.target.value.trim())} autoComplete="off" spellCheck={false}
        placeholder="Cüzdan adresinizi yapıştırın — özel anahtar değil"
        aria-invalid={Boolean(manual && !manualAddress)}
        className="mt-2 w-full bg-[#0B0B0D] border border-[#222226] px-3 py-2 font-mono text-zinc-200" />
      {manual && !manualAddress && <span className="block mt-1 text-amber-400">Geçerli bir Solana adresi girin.</span>}
    </label>}
    <p className="text-[11px] text-amber-300">Adresinizi paylaşabilirsiniz. Private Key veya kurtarma kelimelerinizi paylaşmayın. Sadece tarama için özel anahtar gerekmez.</p>
    <p role="status" className="text-xs text-zinc-400">{copyMessage}</p>
  </section>;
}
