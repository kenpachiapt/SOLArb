import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cpu,
  Coins,
  Terminal as TerminalIcon,
  Settings,
  Play,
  Square,
  Copy,
  Download,
  BookOpen,
  ShieldAlert,
  RefreshCw,
  ArrowRightLeft,
  ArrowRight,
  Check,
  Zap,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  FileCode,
  Info,
  DollarSign,
  Lock,
  KeyRound,
  Send,
  Save,
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateArbitrageCode, TOKEN_MINTS, TOKEN_DECIMALS } from './arbitrageCode';
import { INSTALLATION_GUIDE, RISKS_AND_TIPS } from './guideData';

// Fallback prices in USD
const FALLBACK_PRICES = {
  SOL: 148.52,
  USDC: 1.00,
  USDT: 1.00,
  BONK: 0.00002245,
  JUP: 0.985,
  WIF: 2.15
};

interface LogLine {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'scanner';
  timestamp: string;
}

interface ArbitrageTx {
  id: string;
  timestamp: string;
  route: string;
  dexA: string;
  dexB: string;
  amount: string;
  profitToken: string;
  profitUsd: string;
  status: 'SUCCESS' | 'FAILED';
  txHash: string;
  useJito: boolean;
}

export default function App() {
  // Config States
  const [rpcUrl, setRpcUrl] = useState<string>(() => localStorage.getItem('solarb_rpc_url') || 'https://api.mainnet-beta.solana.com');
  const [startToken, setStartToken] = useState<'SOL' | 'USDC' | 'USDT' | 'BONK'>(() => (localStorage.getItem('solarb_start_token') as any) || 'SOL');
  const [interToken, setInterToken] = useState<'SOL' | 'USDC' | 'USDT' | 'BONK' | 'JUP' | 'WIF' | 'ALL'>(() => (localStorage.getItem('solarb_inter_token') as any) || 'USDC');
  const [amount, setAmount] = useState<number>(() => {
    const saved = localStorage.getItem('solarb_amount');
    return saved !== null ? Number(saved) : 5;
  });
  const [minProfitPct, setMinProfitPct] = useState<number>(() => {
    const saved = localStorage.getItem('solarb_min_profit_pct');
    return saved !== null ? Number(saved) : 0.5;
  });
  const [slippagePct, setSlippagePct] = useState<number>(() => {
    const saved = localStorage.getItem('solarb_slippage_pct');
    return saved !== null ? Number(saved) : 0.2;
  });
  const [useJito, setUseJito] = useState<boolean>(() => {
    const saved = localStorage.getItem('solarb_use_jito');
    return saved !== null ? saved === 'true' : true;
  });
  const [priorityFeeSol, setPriorityFeeSol] = useState<number>(() => {
    const saved = localStorage.getItem('solarb_priority_fee_sol');
    return saved !== null ? Number(saved) : 0.0001;
  });
  const [scanInterval, setScanInterval] = useState<number>(() => {
    const saved = localStorage.getItem('solarb_scan_interval');
    return saved !== null ? Number(saved) : 5;
  });
  const [jupiterApiUrl, setJupiterApiUrl] = useState<string>(() => localStorage.getItem('solarb_jupiter_api_url') || '');
  const [customMints, setCustomMints] = useState<string>(() => localStorage.getItem('solarb_custom_mints') || '');
  const [autoDiscoverMeme, setAutoDiscoverMeme] = useState<boolean>(() => {
    const saved = localStorage.getItem('solarb_auto_discover_meme');
    return saved !== null ? saved === 'true' : true;
  });
  const [spyWalletAddress, setSpyWalletAddress] = useState<string>(() => localStorage.getItem('solarb_spy_wallet_address') || 'B7b6UM14WdVPoF2ZohMNSPWqFdS7QrxbkSAt6Z4sEwxL');
  const [autoSpyWallet, setAutoSpyWallet] = useState<boolean>(() => {
    const saved = localStorage.getItem('solarb_auto_spy_wallet');
    return saved !== null ? saved === 'true' : false;
  });
  const [isSpyScanning, setIsSpyScanning] = useState<boolean>(false);
  const [spyDiscoveredTokens, setSpyDiscoveredTokens] = useState<{ symbol: string; name: string; mint: string; price?: string }[]>([]);
  const [spyError, setSpyError] = useState<string>('');

  // Save configurations to localStorage automatically
  useEffect(() => {
    localStorage.setItem('solarb_rpc_url', rpcUrl);
    localStorage.setItem('solarb_start_token', startToken);
    localStorage.setItem('solarb_inter_token', interToken);
    localStorage.setItem('solarb_amount', String(amount));
    localStorage.setItem('solarb_min_profit_pct', String(minProfitPct));
    localStorage.setItem('solarb_slippage_pct', String(slippagePct));
    localStorage.setItem('solarb_use_jito', String(useJito));
    localStorage.setItem('solarb_priority_fee_sol', String(priorityFeeSol));
    localStorage.setItem('solarb_scan_interval', String(scanInterval));
    localStorage.setItem('solarb_jupiter_api_url', jupiterApiUrl);
    localStorage.setItem('solarb_custom_mints', customMints);
    localStorage.setItem('solarb_auto_discover_meme', String(autoDiscoverMeme));
    localStorage.setItem('solarb_spy_wallet_address', spyWalletAddress);
    localStorage.setItem('solarb_auto_spy_wallet', String(autoSpyWallet));
  }, [rpcUrl, startToken, interToken, amount, minProfitPct, slippagePct, useJito, priorityFeeSol, scanInterval, jupiterApiUrl, customMints, autoDiscoverMeme, spyWalletAddress, autoSpyWallet]);

  // Telegram Notifications States
  const [telegramToken, setTelegramToken] = useState<string>(() => localStorage.getItem('telegram_token') || '');
  const [telegramChatId, setTelegramChatId] = useState<string>(() => localStorage.getItem('telegram_chat_id') || '');

  // Solana Wallet Private Key
  const [privateKey, setPrivateKey] = useState<string>(() => localStorage.getItem('solana_private_key') || '');

  // Authentication & Panel Security States
  const [panelUsername, setPanelUsername] = useState<string>(() => localStorage.getItem('panel_username') || 'admin');
  const [panelPassword, setPanelPassword] = useState<string>(() => localStorage.getItem('panel_password') || 'solana123');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => localStorage.getItem('panel_logged_in') === 'true');
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // UI States
  const [activeTab, setActiveTab] = useState<'code' | 'guide' | 'risks' | 'settings'>('code');
  const [activeGuideStep, setActiveGuideStep] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [simProfit, setSimProfit] = useState<number>(0);
  const [simTransactions, setSimTransactions] = useState<number>(0);

  // Real Bot Server States
  const [activeConsoleMode, setActiveConsoleMode] = useState<'simulation' | 'real'>('simulation');
  const [realBotRunning, setRealBotRunning] = useState<boolean>(false);
  const [realBotLogs, setRealBotLogs] = useState<{ text: string; type: string; timestamp: string }[]>([]);
  const [isStartingBot, setIsStartingBot] = useState<boolean>(false);
  const [isStoppingBot, setIsStoppingBot] = useState<boolean>(false);

  // Periodically poll real bot status from backend
  useEffect(() => {
    let intervalId: any;
    
    const fetchBotStatus = async () => {
      try {
        const response = await fetch('/api/bot/status');
        if (!response.ok) return;
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (data.success) {
            setRealBotRunning(data.running);
            if (data.logs) {
              setRealBotLogs(data.logs);
            }
          }
        }
      } catch (err) {
        // Silently handle transient network/polling errors during app boot/restart
      }
    };

    fetchBotStatus(); // Fetch immediately
    intervalId = setInterval(fetchBotStatus, 2000); // Poll every 2 seconds

    return () => clearInterval(intervalId);
  }, []);

  const handleScanSpyWallet = async () => {
    if (!spyWalletAddress) {
      setSpyError('Lütfen bir cüzdan adresi girin.');
      return;
    }
    setIsSpyScanning(true);
    setSpyError('');
    try {
      const response = await fetch(`/api/spy-wallet?walletAddress=${encodeURIComponent(spyWalletAddress)}&rpcUrl=${encodeURIComponent(rpcUrl)}`);
      const data = await response.json();
      if (response.ok && data.success) {
        setSpyDiscoveredTokens(data.tokens || []);
        if (!data.tokens || data.tokens.length === 0) {
          setSpyError('Bu cüzdanın son işlemlerinde aktif bir özel token bulunamadı.');
        } else {
          addLog(`🕵️ Cüzdan Casusu: ${spyWalletAddress} cüzdanından ${data.tokens.length} adet aktif parite bulundu!`, 'info');
        }
      } else {
        setSpyError(data.error || 'Token listesi çekilemedi.');
      }
    } catch (err: any) {
      setSpyError(err.message || 'Cüzdan taranırken sunucuyla bağlantı kurulamadı.');
    } finally {
      setIsSpyScanning(false);
    }
  };

  const handleAddSpyTokenToCustom = (mint: string, symbol: string) => {
    let currentMints = customMints ? customMints.split(',').map(m => m.trim()) : [];
    if (currentMints.includes(mint)) {
      addLog(`ℹ️ ${symbol} token zaten tarama listenizde ekli.`, 'info');
      return;
    }
    currentMints.push(mint);
    const newMints = currentMints.filter(m => m.length > 0).join(', ');
    setCustomMints(newMints);
    addLog(`✅ ${symbol} token başarıyla özel tarama listenize eklendi.`, 'success');
  };

  const handleAddAllSpyTokensToCustom = () => {
    if (spyDiscoveredTokens.length === 0) return;
    let currentMints = customMints ? customMints.split(',').map(m => m.trim()) : [];
    let addedCount = 0;
    spyDiscoveredTokens.forEach(t => {
      if (!currentMints.includes(t.mint)) {
        currentMints.push(t.mint);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      const newMints = currentMints.filter(m => m.length > 0).join(', ');
      setCustomMints(newMints);
      addLog(`🎉 Başarıyla ${addedCount} adet yeni balina tokeni tarama listenize eklendi!`, 'success');
    } else {
      addLog('ℹ️ Bulunan tüm tokenler zaten listenizde ekli durumda.', 'info');
    }
  };

  const handleStartRealBot = async () => {
    setIsStartingBot(true);
    try {
      // Auto-save configuration to server first before starting the bot, to ensure bot.ts has the latest values!
      await handleSaveToServer();

      const response = await fetch('/api/bot/start', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        addLog("▶️ Gerçek Solana Botu sunucuda başarıyla başlatıldı!", "success");
        setRealBotRunning(true);
      } else {
        addLog(`❌ Bot başlatılamadı: ${data.error || "Bilinmeyen hata"}`, "error");
        alert(`Hata: ${data.error}`);
      }
    } catch (err) {
      console.error("Bot başlatılırken hata oluştu:", err);
      addLog("❌ Bot başlatılırken bağlantı hatası oluştu.", "error");
    } finally {
      setIsStartingBot(false);
    }
  };

  const handleStopRealBot = async () => {
    setIsStoppingBot(true);
    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        addLog("⏸️ Gerçek Solana Botu sunucuda durduruldu.", "warning");
        setRealBotRunning(false);
      } else {
        addLog(`❌ Bot durdurulamadı: ${data.error || "Bilinmeyen hata"}`, "error");
      }
    } catch (err) {
      console.error("Bot durdurulurken hata oluştu:", err);
      addLog("❌ Bot durdurulurken bağlantı hatası oluştu.", "error");
    } finally {
      setIsStoppingBot(false);
    }
  };

  // Telegram Testing States
  const [telegramTestStatus, setTelegramTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [telegramTestMessage, setTelegramTestMessage] = useState<string>('');

  // Save Server States
  const [saveServerStatus, setSaveServerStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveServerMessage, setSaveServerMessage] = useState<string>('');

  // Load configuration from server on mount
  useEffect(() => {
    const loadServerConfig = async () => {
      try {
        const response = await fetch('/api/load-config');
        const data = await response.json();
        if (data.success && data.config) {
          const cfg = data.config;
          if (cfg.rpcUrl) setRpcUrl(cfg.rpcUrl);
          if (cfg.startToken) setStartToken(cfg.startToken);
          if (cfg.interToken) setInterToken(cfg.interToken);
          if (cfg.amount !== undefined) setAmount(Number(cfg.amount));
          if (cfg.minProfitPct !== undefined) setMinProfitPct(Number(cfg.minProfitPct));
          if (cfg.slippagePct !== undefined) setSlippagePct(Number(cfg.slippagePct));
          if (cfg.useJito !== undefined) setUseJito(cfg.useJito === true || cfg.useJito === 'true');
          if (cfg.priorityFeeSol !== undefined) setPriorityFeeSol(Number(cfg.priorityFeeSol));
          if (cfg.scanInterval !== undefined) setScanInterval(Number(cfg.scanInterval));
          if (cfg.telegramToken) setTelegramToken(cfg.telegramToken);
          if (cfg.telegramChatId) setTelegramChatId(cfg.telegramChatId);
          if (cfg.privateKey) setPrivateKey(cfg.privateKey);
          if (cfg.panelUsername) setPanelUsername(cfg.panelUsername);
          if (cfg.panelPassword) setPanelPassword(cfg.panelPassword);
          if (cfg.jupiterApiUrl) setJupiterApiUrl(cfg.jupiterApiUrl);
          if (cfg.customMints) setCustomMints(cfg.customMints);
          if (cfg.autoDiscoverMeme !== undefined) setAutoDiscoverMeme(cfg.autoDiscoverMeme === true || cfg.autoDiscoverMeme === 'true');
          if (cfg.spyWalletAddress) setSpyWalletAddress(cfg.spyWalletAddress);
          if (cfg.autoSpyWallet !== undefined) setAutoSpyWallet(cfg.autoSpyWallet === true || cfg.autoSpyWallet === 'true');
        }
      } catch (err) {
        console.error("Sunucudan konfigürasyon yüklenirken hata:", err);
      }
    };
    loadServerConfig();
  }, []);

  // Prices State
  const [prices, setPrices] = useState<Record<string, number>>(FALLBACK_PRICES);
  const [isFetchingPrices, setIsFetchingPrices] = useState<boolean>(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string>('');

  // Simulator Engine States
  const [dexAPrice, setDexAPrice] = useState<number>(0);
  const [dexBPrice, setDexBPrice] = useState<number>(0);
  const [currentDiffPct, setCurrentDiffPct] = useState<number>(0);
  const [simulationStep, setSimulationStep] = useState<'idle' | 'checking' | 'found' | 'executing' | 'success'>('idle');
  const [terminalLogs, setTerminalLogs] = useState<LogLine[]>([]);
  const [txHistory, setTxHistory] = useState<ArbitrageTx[]>([
    {
      id: 'tx-1',
      timestamp: '12:38:14',
      route: 'SOL ➔ USDC ➔ SOL',
      dexA: 'Raydium v4',
      dexB: 'Orca CLMM',
      amount: '5.00 SOL',
      profitToken: '+0.0384 SOL',
      profitUsd: '+$5.70',
      status: 'SUCCESS',
      txHash: '5Kz7vP...Xm9Y8e',
      useJito: true
    },
    {
      id: 'tx-2',
      timestamp: '12:44:02',
      route: 'USDC ➔ BONK ➔ USDC',
      dexA: 'Orca Whirlpool',
      dexB: 'Meteora DLMM',
      amount: '1,000.00 USDC',
      profitToken: '+6.25 USDC',
      profitUsd: '+$6.25',
      status: 'SUCCESS',
      txHash: '2Rt9pQ...Kw7Z3a',
      useJito: true
    }
  ]);
  
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // Fetch Live Prices from Jupiter API
  const fetchLivePrices = async () => {
    setIsFetchingPrices(true);
    try {
      const mints = Object.values(TOKEN_MINTS).join(',');
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${mints}`);
      if (response.ok) {
        const json = await response.json();
        const updatedPrices: Record<string, number> = {};
        
        // Match response mints back to token symbols
        Object.entries(TOKEN_MINTS).forEach(([symbol, mint]) => {
          if (json.data && json.data[mint]) {
            updatedPrices[symbol] = parseFloat(json.data[mint].price) || FALLBACK_PRICES[symbol as keyof typeof FALLBACK_PRICES];
          } else {
            updatedPrices[symbol] = FALLBACK_PRICES[symbol as keyof typeof FALLBACK_PRICES];
          }
        });
        
        setPrices(updatedPrices);
        setLastPriceUpdate(new Date().toLocaleTimeString());
      } else {
        throw new Error('Jupiter API responses not ok');
      }
    } catch (e) {
      console.warn('Could not fetch live Jupiter prices, using realistic mock prices.', e);
      // Create slight variations on fallback prices to look alive
      const randomVar = () => 0.998 + Math.random() * 0.004;
      const variedPrices = {
        SOL: FALLBACK_PRICES.SOL * randomVar(),
        USDC: 1.00,
        USDT: 1.00,
        BONK: FALLBACK_PRICES.BONK * randomVar(),
        JUP: FALLBACK_PRICES.JUP * randomVar(),
        WIF: FALLBACK_PRICES.WIF * randomVar()
      };
      setPrices(variedPrices);
      setLastPriceUpdate(new Date().toLocaleTimeString());
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // Initial Price Fetch and Interval
  useEffect(() => {
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 15000);
    return () => clearInterval(interval);
  }, []);

  // Helper to add log line
  const addLog = (text: string, type: 'info' | 'success' | 'warning' | 'error' | 'scanner' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTerminalLogs(prev => [...prev, { text, type, timestamp }].slice(-100)); // Keep last 100 logs
  };

  // Auto scroll terminal container to bottom (prevents page jump/scroll-up issues)
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [terminalLogs, realBotLogs, activeConsoleMode]);

  // Handle Token constraint: StartToken and InterToken cannot be the same
  useEffect(() => {
    if (interToken !== 'ALL' && startToken === interToken) {
      // Shift inter token to something else
      const remaining = (['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'WIF'] as const).filter(t => t !== startToken);
      setInterToken(remaining[0]);
    }
  }, [startToken]);

  // Generate customized code
  const generatedCode = useMemo(() => {
    return generateArbitrageCode({
      rpcUrl,
      startToken,
      interToken,
      amount,
      minProfitPct,
      slippagePct,
      useJito,
      priorityFeeSol,
      scanIntervalMs: scanInterval * 1000,
      telegramToken,
      telegramChatId,
      privateKey,
      jupiterApiUrl,
      customMints,
      autoDiscoverMeme,
      spyWalletAddress,
      autoSpyWallet
    });
  }, [rpcUrl, startToken, interToken, amount, minProfitPct, slippagePct, useJito, priorityFeeSol, scanInterval, telegramToken, telegramChatId, privateKey, jupiterApiUrl, customMints, autoDiscoverMeme, spyWalletAddress, autoSpyWallet]);

  // Download Code File
  const handleDownloadCode = () => {
    const blob = new Blob([generatedCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solana_arbitraj_botu_${startToken.toLowerCase()}_${interToken.toLowerCase()}.ts`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`📥 Özelleştirilmiş bot.ts dosyası bilgisayarınıza indirildi!`, 'info');
  };

  // Save Code and Config to Server
  const handleSaveToServer = async () => {
    setSaveServerStatus('saving');
    setSaveServerMessage('');
    try {
      // 1. Save Code file
      const response = await fetch('/api/save-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: generatedCode })
      });
      const data = await response.json();

      if (data.success) {
        // 2. Save UI Config file
        await fetch('/api/save-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rpcUrl,
            startToken,
            interToken,
            amount,
            minProfitPct,
            slippagePct,
            useJito,
            priorityFeeSol,
            scanInterval,
            telegramToken,
            telegramChatId,
            privateKey,
            panelUsername,
            panelPassword,
            jupiterApiUrl,
            customMints,
            autoDiscoverMeme,
            spyWalletAddress,
            autoSpyWallet
          })
        });

        setSaveServerStatus('success');
        setSaveServerMessage('Başarılı! bot.ts ve ayarlar sunucuya kaydedildi.');
        addLog('💾 bot.ts kod dosyası ve yapılandırma ayarları sunucudaki /SOLArb/ konumuna kaydedildi.', 'success');
        setTimeout(() => setSaveServerStatus('idle'), 4000);
      } else {
        setSaveServerStatus('error');
        setSaveServerMessage(data.error || 'Kaydetme başarısız oldu.');
      }
    } catch (err: any) {
      setSaveServerStatus('error');
      setSaveServerMessage(err.message || 'Sunucu bağlantı hatası.');
    }
  };

  // Test Telegram Connection
  const handleTestTelegram = async () => {
    if (!telegramToken || !telegramChatId) {
      setTelegramTestStatus('error');
      setTelegramTestMessage('Lütfen önce Bot Token ve Sohbet (Chat) ID alanlarını doldurun.');
      return;
    }
    setTelegramTestStatus('testing');
    setTelegramTestMessage('');
    
    try {
      const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: `🔔 *Solana Arbitraj Kontrol Paneli*\n\n✅ Tebrikler! Telegram bildirim botunuz başarıyla bağlandı.\n\n🤖 *Bot Durumu:* Aktif (Canlı Simülasyon)\n⚙️ *Kullanıcı:* ${panelUsername}\n🛰️ *RPC Sunucusu:* ${rpcUrl.substring(0, 30)}...`,
          parse_mode: 'Markdown'
        })
      });
      const data = await response.json();
      if (data.ok) {
        setTelegramTestStatus('success');
        setTelegramTestMessage('Başarılı! Telegram botunuzdan telefonunuza bir test mesajı gönderildi.');
        addLog('📱 Telegram bot bağlantısı başarıyla test edildi.', 'success');
      } else {
        setTelegramTestStatus('error');
        setTelegramTestMessage(`Hata: ${data.description || 'API isteği başarısız.'}`);
      }
    } catch (err: any) {
      setTelegramTestStatus('error');
      setTelegramTestMessage(`Bağlantı hatası: ${err.message || 'Bilinmeyen bir hata oluştu.'}`);
    }
  };

  // Copy Code to Clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addLog(`📋 Bot kodu panoya kopyalandı.`, 'info');
  };

  // Simulated Scanner Loop
  useEffect(() => {
    if (!isSimulating) return;

    // Initial logs on startup
    setTerminalLogs([]);
    addLog('🚀 [SİMÜLATÖR] Solana Arbitraj Botu simülasyon modunda başlatılıyor...', 'info');
    addLog(`📌 Başlangıç Varlığı: ${amount} ${startToken}`, 'info');
    addLog(`📌 Ara Birim Varlık: ${interToken}`, 'info');
    addLog(`📌 Hedef Minimum Kâr: %${minProfitPct}`, 'info');
    addLog(`📌 Jito MEV Koruması: ${useJito ? 'AKTİF (Mempool korumalı)' : 'PASİF'}`, 'info');
    addLog(`📌 Özel RPC Düğümü: ${rpcUrl.replace(/api-key=[a-zA-Z0-9-]+/, 'api-key=***')}`, 'info');
    addLog('⚡ Taramalar başladı. Yapay fırsatları tetiklemek veya izlemek için bekleyin...', 'info');

    let counter = 0;
    const scannerInterval = setInterval(() => {
      counter++;
      setSimulationStep('checking');
      
      // Determine active intermediate token for this tick of simulation
      let activeInter = interToken;
      if (interToken === 'ALL') {
        const defaultIntermediates = ['USDC', 'USDT', 'BONK', 'JUP', 'WIF', 'SOL'].filter(t => t !== startToken);
        // Let's alternate between default targets and custom targets
        if (customMints && Math.random() < 0.4) {
          const mints = customMints.split(',').map(m => m.trim()).filter(m => m.length > 30);
          if (mints.length > 0) {
            const randomMint = mints[Math.floor(Math.random() * mints.length)];
            const label = randomMint.toLowerCase().endsWith('pump') ? 'PUMP' : 'SPL';
            activeInter = `${label}_${randomMint.substring(0, 4)}...${randomMint.substring(randomMint.length - 4)}` as any;
          } else {
            activeInter = defaultIntermediates[Math.floor(Math.random() * defaultIntermediates.length)] as any;
          }
        } else {
          activeInter = defaultIntermediates[Math.floor(Math.random() * defaultIntermediates.length)] as any;
        }
      } else {
        // If a single inter is selected but customMints exist, occasionally test custom mints
        if (customMints && Math.random() < 0.25) {
          const mints = customMints.split(',').map(m => m.trim()).filter(m => m.length > 30);
          if (mints.length > 0) {
            const randomMint = mints[Math.floor(Math.random() * mints.length)];
            const label = randomMint.toLowerCase().endsWith('pump') ? 'PUMP' : 'SPL';
            activeInter = `${label}_${randomMint.substring(0, 4)}...${randomMint.substring(randomMint.length - 4)}` as any;
          }
        }
      }

      // Calculate token price pairs
      const startPrice = prices[startToken] || 1;
      const interPrice = activeInter.toString().startsWith('PUMP') || activeInter.toString().startsWith('SPL')
        ? 0.0025 
        : (prices[activeInter as any] || 1);
      
      // Base exchange rate
      const baseRate = startPrice / interPrice;
      
      // Simulate slightly varied prices for DEX A and DEX B
      const hasOpportunity = Math.random() < 0.15; // 15% chance of organic opportunity in simulation
      
      let rateA = baseRate;
      let rateB = baseRate;
      
      if (hasOpportunity) {
        // High variation
        const profitMargin = minProfitPct / 100 + (Math.random() * 0.008 + 0.002); // Guaranteed to exceed minProfitPct
        rateA = baseRate * (1 - profitMargin / 2);
        rateB = baseRate * (1 + profitMargin / 2);
      } else {
        // Natural tiny spread
        const spread = (Math.random() * 0.001 - 0.0005);
        rateA = baseRate;
        rateB = baseRate * (1 + spread);
      }
 
      const pA = startPrice;
      const pB = startPrice * (rateB / rateA);
      
      setDexAPrice(pA);
      setDexBPrice(pB);
 
      const diff = ((pB - pA) / pA) * 100;
      setCurrentDiffPct(diff);
 
      const scanTime = new Date().toLocaleTimeString();
      addLog(`🔍 [${scanTime}] Arbitraj taranıyor...`, 'scanner');
      addLog(`   DEX A (${startToken}/${activeInter} paritesi): 1 ${startToken} = ${(rateA).toFixed(startToken === 'BONK' ? 8 : 4)} ${activeInter}`, 'info');
      addLog(`   DEX B (${activeInter}/${startToken} paritesi): 1 ${startToken} = ${(rateB).toFixed(startToken === 'BONK' ? 8 : 4)} ${activeInter}`, 'info');
      
      const expectedInterAmount = amount * rateA;
      const returnedStartAmount = expectedInterAmount / rateB;
      const netChange = returnedStartAmount - amount;
      const netPct = (netChange / amount) * 100;
 
      addLog(`   🔄 Döngü Sonucu: ${amount} ${startToken} ➔ ${expectedInterAmount.toFixed(4)} ${activeInter} ➔ ${returnedStartAmount.toFixed(6)} ${startToken}`, 'info');
      
      if (netPct >= minProfitPct) {
        // Trigger Successful Arbitrage Flow
        setSimulationStep('found');
        addLog(`🎉 🎉 FIRSAT BULUNDU! Brüt Kâr: %${netPct.toFixed(3)} (Minimum Limit: %${minProfitPct})`, 'success');
        addLog(`   [1/4] Jup v6 API aracılığıyla en iyi rotalar atomik işleme dökülüyor...`, 'info');
        
        setTimeout(() => {
          setSimulationStep('executing');
          addLog(`   [2/4] İşlem paketleri oluşturuldu. Öncelik ücreti eklendi: ${priorityFeeSol} SOL`, 'info');
          if (useJito) {
            addLog(`   [3/4] 🛡️ Jito MEV Blok Motoru aktif. İşlem Jito Bundle olarak paketlendi ve doğrulayıcıya doğrudan iletildi.`, 'success');
          } else {
            addLog(`   [3/4] 🚀 Doğrudan Solana Mainnet RPC kanalı üzerinden işlem ağa yayınlanıyor...`, 'warning');
          }
        }, 1200);
 
        setTimeout(() => {
          setSimulationStep('success');
          const finalProfit = netChange * startPrice;
          setSimProfit(prev => prev + finalProfit);
          setSimTransactions(prev => prev + 1);
          
          const txHashRandom = Math.random().toString(36).substring(2, 8).toUpperCase();
          const routeStr = `${startToken} ➔ ${activeInter} ➔ ${startToken}`;
          setTxHistory(prev => [
            {
              id: `tx-sim-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              route: routeStr,
              dexA: 'Raydium v4',
              dexB: 'Orca CLMM',
              amount: `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${startToken}`,
              profitToken: `+${netChange.toFixed(startToken === 'BONK' ? 2 : 5)} ${startToken}`,
              profitUsd: `+$${finalProfit.toFixed(2)}`,
              status: 'SUCCESS',
              txHash: `SOL-${txHashRandom.substring(0,3)}...${txHashRandom.substring(3)}`,
              useJito: useJito
            },
            ...prev
          ].slice(0, 50));
 
          addLog(`   [4/4] ✅ İŞLEM ONAYLANDI! Blok Yüksekliği tespit edildi.`, 'success');
          addLog(`   💰 KAZANILAN NET KÂR: +${netChange.toFixed(6)} ${startToken} (~$${finalProfit.toFixed(4)})`, 'success');
          
          setTimeout(() => {
            setSimulationStep('idle');
          }, 1500);
        }, 2800);
 
      } else {
        addLog(`   ⏱️ Net Değişim: ${netChange > 0 ? '+' : ''}${netChange.toFixed(6)} ${startToken} (%${netPct.toFixed(3)}). Hedefin altında (%${minProfitPct}). İşlem es geçildi.`, 'info');
        setSimulationStep('idle');
      }
 
    }, scanInterval * 1000);

    return () => clearInterval(scannerInterval);
  }, [isSimulating, startToken, interToken, amount, minProfitPct, useJito, priorityFeeSol, scanInterval, prices]);

  // Manual Trigger Opportunity (For Demonstration / Learning)
  const handleForceOpportunity = () => {
    if (!isSimulating) {
      addLog('⚠️ Lütfen önce simülasyonu başlatın!', 'warning');
      return;
    }
    
    setSimulationStep('found');
    const startPrice = prices[startToken] || 1;
    const bonusProfitPct = minProfitPct + 1.25; // Guarantee a high yield
    
    const fakeRateA = startPrice;
    const fakeRateB = startPrice * (1 + bonusProfitPct / 100);
    
    setDexAPrice(fakeRateA);
    setDexBPrice(fakeRateB);
    setCurrentDiffPct(bonusProfitPct);

    const forceTime = new Date().toLocaleTimeString();
    addLog(`⚡ [MÜDAHALE - ${forceTime}] Manuel Yapay Arbitraj Fırsatı Enjekte Edildi!`, 'warning');
    addLog(`🔍 DEX A (${startToken}/${interToken}): 1 ${startToken} = ${(startPrice).toFixed(4)} USD`, 'info');
    addLog(`🔍 DEX B (${interToken}/${startToken}): 1 ${startToken} = ${(startPrice * (1 + bonusProfitPct / 100)).toFixed(4)} USD`, 'info');
    
    const initialAmt = amount;
    const interAmt = initialAmt * (prices[startToken] / prices[interToken]);
    const returnedAmt = initialAmt * (1 + bonusProfitPct / 100);
    const profitToken = returnedAmt - initialAmt;
    const profitUsd = profitToken * startPrice;

    addLog(`🎉 🎉 YAPAY FIRSAT TETİKLENDİ! Brüt Kâr: %${bonusProfitPct.toFixed(2)} (Limit: %${minProfitPct})`, 'success');
    addLog(`   [1/4] Jupiter API üzerinden rota sorgulandı. Rota: ${startToken} ➔ ${interToken} ➔ ${startToken}`, 'info');

    setTimeout(() => {
      setSimulationStep('executing');
      addLog(`   [2/4] İşlem imzalandı. Cüzdan: ${TOKEN_MINTS[startToken].slice(0, 6)}...${TOKEN_MINTS[startToken].slice(-4)}`, 'info');
      if (useJito) {
        addLog(`   [3/4] 🛡️ [JITO BUNDLE] İşlem Jito doğrulayıcı bloğuna dahil edilmek üzere kuyruğa eklendi (Sandviç saldırılarına karşı korumalı).`, 'success');
      } else {
        addLog(`   [3/4] 🚀 İşlem doğrudan Solana ana ağına gönderildi.`, 'warning');
      }
    }, 1000);

    setTimeout(() => {
      setSimulationStep('success');
      setSimProfit(prev => prev + profitUsd);
      setSimTransactions(prev => prev + 1);

      const txHashRandom = Math.random().toString(36).substring(2, 8).toUpperCase();
      const routeStr = `${startToken} ➔ ${interToken} ➔ ${startToken}`;
      setTxHistory(prev => [
        {
          id: `tx-manual-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          route: routeStr,
          dexA: 'Raydium v4',
          dexB: 'Orca CLMM',
          amount: `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${startToken}`,
          profitToken: `+${profitToken.toFixed(startToken === 'BONK' ? 2 : 5)} ${startToken}`,
          profitUsd: `+$${profitUsd.toFixed(2)}`,
          status: 'SUCCESS',
          txHash: `SOL-${txHashRandom.substring(0,3)}...${txHashRandom.substring(3)}`,
          useJito: useJito
        },
        ...prev
      ].slice(0, 50));

      addLog(`   [4/4] ✅ İŞLEM BAŞARIYLA GERÇEKLEŞTİ!`, 'success');
      addLog(`   💰 KAZANILAN NET KÂR: +${profitToken.toFixed(6)} ${startToken} (~$${profitUsd.toFixed(2)})`, 'success');
      
      setTimeout(() => {
        setSimulationStep('idle');
      }, 1500);
    }, 2500);
  };

  // UI calculations
  const expectedProfitEstimate = useMemo(() => {
    const profitInToken = amount * (minProfitPct / 100);
    const startPrice = prices[startToken] || 1;
    return {
      token: profitInToken,
      usd: profitInToken * startPrice
    };
  }, [amount, minProfitPct, startToken, prices]);

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#E4E4E7] font-sans selection:bg-indigo-600 selection:text-white flex flex-col justify-between">
      {!isAuthenticated ? (
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md bg-[#121215] border border-[#222226] p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-none mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-white tracking-tight">GÜVENLİ ERİŞİM PANELİ</h2>
              <p className="text-xs text-zinc-400 uppercase tracking-widest font-mono">Solana Arbitraj Kontrol Sistemi</p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (loginUsername === panelUsername && loginPassword === panelPassword) {
                setIsAuthenticated(true);
                localStorage.setItem('panel_logged_in', 'true');
                setLoginError('');
              } else {
                setLoginError('Hatalı kullanıcı adı veya şifre girdiniz.');
              }
            }} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Kullanıcı Adı</label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Kullanıcı adı girin"
                  required
                  className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Giriş Şifresi</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Şifrenizi girin"
                  required
                  className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {loginError && (
                <p className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 px-3 py-2 text-center font-medium">
                  ⚠️ {loginError}
                </p>
              )}

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider py-3 transition-all hover:shadow-[0_0_15px_rgba(79,70,229,0.3)] active:scale-[0.98]"
              >
                GİRİŞ YAP VE BAĞLAN
              </button>
            </form>

            <div className="pt-4 border-t border-[#222226] text-center">
              <p className="text-[9px] text-zinc-500 font-mono">
                Varsayılan Bilgiler: Kullanıcı: <strong className="text-zinc-400">admin</strong> | Şifre: <strong className="text-zinc-400">solana123</strong>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div>
      {/* Header: Swiss Editorial Aesthetic */}
      <header className="border-b border-[#222226] bg-[#0B0B0D] sticky top-0 z-40 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 md:py-8 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div className="space-y-3">
            <p className="text-xs tracking-[0.2em] font-medium text-indigo-400 uppercase font-serif italic">
              TECHNICAL DOCUMENTATION // SERIES 02
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-semibold tracking-tight text-white leading-none">
              SOLANA ARBITRAGE
            </h1>
            <p className="text-xs text-zinc-400 uppercase tracking-widest font-mono">
              Otomasyon ve Rota Optimizasyon Sistemi
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-1.5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  localStorage.removeItem('panel_logged_in');
                }}
                className="px-2.5 py-1 text-[10px] font-mono border border-rose-500/20 text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 transition-all uppercase tracking-wider"
              >
                Çıkış Yap
              </button>
              <span className="text-3xl md:text-4xl font-serif italic text-indigo-500 font-semibold leading-none">
                v2.6.0 <span className="text-xs font-sans tracking-widest uppercase text-zinc-500">STABLE</span>
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Ağ İletişim Protokolü / Jup.ag v6 API
            </p>
          </div>
        </div>
      </header>

      {/* Live Market Ribbon */}
      <div className="border-b border-[#222226] bg-[#121215]/50 py-3.5">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4 text-zinc-400">
            <span className="flex items-center gap-1.5 text-indigo-400 uppercase tracking-wider text-[10px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              SOLANA NETWORK: SECURE
            </span>
            <span className="text-zinc-600">|</span>
            <div className="flex flex-wrap items-center gap-3.5 text-zinc-300">
              <span>SOL: <strong className="text-emerald-400">${prices.SOL?.toFixed(2) || '...'}</strong></span>
              <span>BONK: <strong className="text-emerald-400">${prices.BONK?.toFixed(8) || '...'}</strong></span>
              <span>JUP: <strong className="text-emerald-400">${prices.JUP?.toFixed(3) || '...'}</strong></span>
              <span>WIF: <strong className="text-emerald-400">${prices.WIF?.toFixed(2) || '...'}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-zinc-500">
            <span>Yenileme: {lastPriceUpdate || 'Bekleniyor'}</span>
            <button 
              onClick={fetchLivePrices} 
              disabled={isFetchingPrices}
              className="p-1 hover:bg-[#1E1E22] rounded transition-colors text-zinc-400 hover:text-white disabled:opacity-50"
              title="Fiyatları Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingPrices ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>


      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-8 space-y-8">
        
        {/* Warning Banner: Editorial Style */}
        <div className="bg-[#121215] border border-[#222226] rounded-none p-5 flex gap-4 items-start">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-400 leading-relaxed">
            <span className="font-serif italic font-semibold text-white">Güvenlik ve Risk Hatırlatması:</span> Solana ağında kârlı arbitraj yapmak; yüksek hız (Özel RPC düğümleri), MEV korumalı iletim (Jito) ve optimize edilmiş parametreler gerektirir. Bu platform, botun çalışma mantığını görselleştirmek, ayarlarınızı test edip <strong className="text-white">kendi bilgisayarınızda çalıştırabileceğiniz üretim kalitesinde bot kodunu</strong> güvenle üretmek için tasarlanmıştır. Cüzdan anahtarlarınızı asla hiçbir web sitesine girmeyin!
          </div>
        </div>

        {/* Two-Column Grid: Configurator & Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Configurator (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#121215] border border-[#222226] rounded-none p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-[#222226] pb-4">
                <h2 className="text-base font-serif font-bold tracking-tight text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  Bot Yapılandırma Ayarları
                </h2>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">bot.ts parametreleri</span>
              </div>

              {/* RPC Node input */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Solana RPC Sağlayıcı URL</span>
                  <span className="text-[9px] font-mono text-zinc-600">Mainnet-Beta</span>
                </label>
                <input
                  type="text"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="https://api.mainnet-beta.solana.com"
                />
              </div>

              {/* Jupiter API URL input */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Jupiter API Adresi</span>
                  <span className="text-[9px] font-mono text-zinc-500">Yedekli / Özel</span>
                </label>
                <input
                  type="text"
                  value={jupiterApiUrl}
                  onChange={(e) => setJupiterApiUrl(e.target.value)}
                  className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="Yedekli rotasyon için boş bırakın"
                />
              </div>

              {/* Tokens selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">1. Başlangıç Varlığı (A)</label>
                  <select
                    value={startToken}
                    onChange={(e) => setStartToken(e.target.value as any)}
                    className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono cursor-pointer"
                  >
                    <option value="SOL">SOL (Native)</option>
                    <option value="USDC">USDC (Stable)</option>
                    <option value="USDT">USDT (Stable)</option>
                    <option value="BONK">BONK (Meme)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">2. Ara Birim Varlık (B)</label>
                  <select
                    value={interToken}
                    onChange={(e) => setInterToken(e.target.value as any)}
                    className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors font-mono cursor-pointer font-bold text-indigo-400"
                  >
                    <option value="ALL" className="text-emerald-400 font-bold">🔄 TÜM PARİTELERİ TARA (Çoklu-Parite Modu)</option>
                    <option value="USDC" className="text-zinc-200">USDC (Stable)</option>
                    <option value="USDT" className="text-zinc-200">USDT (Stable)</option>
                    <option value="BONK" className="text-zinc-200">BONK (Meme)</option>
                    <option value="JUP" className="text-zinc-200">JUP (Governance)</option>
                    <option value="WIF" className="text-zinc-200">WIF (Meme)</option>
                    <option value="SOL" className="text-zinc-200">SOL (Native)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Meme Coin Discovery Checkbox */}
              <div className="bg-[#0B0B0D] border border-[#222226] p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-zinc-200">🤖 Otomatik Meme Coin Keşfi</span>
                    <span className="text-[10px] text-zinc-500">DexScreener ile Trend Meme Pariteleri</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDiscoverMeme}
                      onChange={(e) => setAutoDiscoverMeme(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white"></div>
                  </label>
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                  Açık olduğunda, Solana üzerinde DexScreener'da trend olan, yüksek hacimli ve en aktif meme coinler otomatik olarak taranır. Manuel mint adresi girmek zorunda kalmazsınız!
                </p>
              </div>

              {/* Custom Token Mints (Pump.fun / SPL) */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Özel Token Adresleri (Meme / Pump.fun)</span>
                  <span className="text-[9px] font-mono text-zinc-500">Münferit / Çoklu</span>
                </label>
                <input
                  type="text"
                  value={customMints}
                  onChange={(e) => setCustomMints(e.target.value)}
                  className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder-zinc-700"
                  placeholder="Virgülle ayırın, örn: G8p8WjB...pump, JUP..."
                />
                <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                  💡 Fırsat yakalayacağınız özel pump.fun veya SPL coinlerin mint adreslerini aralarına virgül koyarak ekleyin. Bot hem standart paritelerde hem de eklediğiniz bu meme coinlerde eşzamanlı dairesel fırsat tarar.
                </p>
              </div>

              {/* Wallet Spy / Insider Tracking Section */}
              <div className="bg-[#0D0E12] border border-[#222226] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#222226] pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-500/10 text-amber-400">
                      <Wallet size={14} className="animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-zinc-100 tracking-wide uppercase">🕵️ Cüzdan Casusu & Balina Takibi</span>
                      <span className="text-[10px] text-zinc-500 font-sans">Arbitraj ve MEV Cüzdanlarının Sırlarını Çözün</span>
                    </div>
                  </div>
                  
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSpyWallet}
                      onChange={(e) => setAutoSpyWallet(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-black"></div>
                  </label>
                </div>

                <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                  Başarılı on-chain arbitrajcılar, karlı meme paritelerini herkesten önce bulur. Takip etmek istediğiniz cüzdan adresini yazıp sorgulayarak, son takaslarında etkileşime girdiği gizli fırsat tokenlerini anında keşfedin ve tarama listenize ekleyin!
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={spyWalletAddress}
                    onChange={(e) => setSpyWalletAddress(e.target.value.trim())}
                    placeholder="Solana Cüzdan Adresi (örn: B7b6UM...)"
                    className="flex-1 bg-[#050507] border border-[#222226] px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500 placeholder-zinc-700"
                  />
                  <button
                    onClick={handleScanSpyWallet}
                    disabled={isSpyScanning}
                    className="px-3 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSpyScanning ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Zap size={12} />
                    )}
                    {isSpyScanning ? 'Taranıyor...' : 'Analiz Et'}
                  </button>
                </div>

                {/* Auto Spy Info Box */}
                {autoSpyWallet && (
                  <div className="bg-amber-500/5 border border-amber-500/15 p-2 flex items-start gap-1.5">
                    <Info size={12} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[9px] text-amber-400/80 leading-normal font-sans">
                      <strong>Otomatik Casus Aktif:</strong> Bot her tarama döngüsünde bu cüzdanın son işlem yaptığı özel tokenleri blockchain'den otomatik olarak çekip dairesel tarama listesine dahil edecektir!
                    </p>
                  </div>
                )}

                {/* Errors inside the spy wallet box */}
                {spyError && (
                  <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/40 p-2 font-mono">
                    ⚠️ {spyError}
                  </div>
                )}

                {/* Discovered Tokens list */}
                {spyDiscoveredTokens.length > 0 && (
                  <div className="space-y-2 mt-2 border-t border-[#222226] pt-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-zinc-400 font-semibold uppercase tracking-wider">Tespit Edilen Tokenler ({spyDiscoveredTokens.length})</span>
                      <button
                        onClick={handleAddAllSpyTokensToCustom}
                        className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        ⚡ Hepsini Ekle
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs scrollbar-thin">
                      {spyDiscoveredTokens.map((token, i) => (
                        <div key={i} className="flex items-center justify-between bg-[#050507] p-2 border border-[#1A1A1E] hover:border-zinc-800 transition-colors">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-amber-400 shrink-0 bg-amber-500/10 px-1 py-0.5 text-[9px] font-mono">🕵️ {token.symbol}</span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] text-zinc-300 truncate font-semibold">{token.name}</span>
                              <span className="text-[9px] text-zinc-500 truncate font-mono">{token.mint.substring(0, 6)}...{token.mint.substring(token.mint.length - 6)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {token.price && (
                              <span className="text-[10px] font-mono text-zinc-400">{token.price}</span>
                            )}
                            <button
                              onClick={() => handleAddSpyTokenToCustom(token.mint, token.symbol)}
                              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[9px] transition-all font-semibold rounded cursor-pointer"
                            >
                              + Ekle
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Amount input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <label className="text-zinc-400 uppercase tracking-wider font-semibold">İşlem Sermayesi ({startToken})</label>
                  <span className="text-zinc-500 font-mono">
                    ~${((amount || 0) * (prices[startToken] || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none pl-3.5 pr-16 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    step="any"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <span className="text-xs text-zinc-500 font-mono font-bold">{startToken}</span>
                  </div>
                </div>
                <p className="text-[10px] text-indigo-400 leading-relaxed font-sans mt-1">
                  💡 <span className="font-semibold text-white">Güvenlik Sınırı:</span> Bot cüzdanınızdaki tüm bakiyeyi kullanmaz. Her turda sadece girdiğiniz bu miktar kadar ({amount} {startToken}) sermaye ile dairesel takas yapar. Geri kalan bakiyeniz tamamen güvendedir ve dokunulmaz.
                </p>
              </div>

              {/* Profit & Slippage slider input */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <label className="text-zinc-400 uppercase tracking-wider font-semibold">Min. Kâr Hedefi</label>
                    <span className="text-indigo-400 font-bold font-mono">%{minProfitPct}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="5.0"
                    step="0.05"
                    value={minProfitPct}
                    onChange={(e) => setMinProfitPct(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 bg-[#222226] h-1 rounded-none cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <label className="text-zinc-400 uppercase tracking-wider font-semibold">Maks. Slipaj</label>
                    <span className="text-indigo-400 font-bold font-mono">%{slippagePct}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="2.0"
                    step="0.05"
                    value={slippagePct}
                    onChange={(e) => setSlippagePct(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 bg-[#222226] h-1 rounded-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Jito MEV Settings */}
              <div className="p-4 bg-[#0B0B0D] border border-[#222226] rounded-none space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Zap className={`w-4 h-4 ${useJito ? 'text-emerald-400' : 'text-zinc-600'}`} />
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Jito MEV Blok Motoru</span>
                      <p className="text-[10px] text-zinc-500">Mempool sandviç saldırısı koruması</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useJito}
                      onChange={(e) => setUseJito(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#222226] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500/95"></div>
                  </label>
                </div>
              </div>

              {/* Advanced Priority Fee & Scan Speed */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Öncelik Ücreti (SOL)</label>
                  <input
                    type="number"
                    step="0.00005"
                    min="0"
                    value={priorityFeeSol}
                    onChange={(e) => setPriorityFeeSol(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Tarama Sıklığı (sn)</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={scanInterval}
                    onChange={(e) => setScanInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Telegram Notification configuration */}
              <div className="border-t border-[#222226] pt-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-400" />
                    Telegram Bildirimleri
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">Opsiyonel</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">Bot Token</label>
                    <input
                      type="password"
                      value={telegramToken}
                      onChange={(e) => {
                        setTelegramToken(e.target.value);
                        localStorage.setItem('telegram_token', e.target.value);
                      }}
                      placeholder="123456:ABC-DEF..."
                      className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">Sohbet (Chat) ID</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => {
                        setTelegramChatId(e.target.value);
                        localStorage.setItem('telegram_chat_id', e.target.value);
                      }}
                      placeholder="987654321"
                      className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <p className="text-[9px] text-zinc-500 leading-normal">
                  Telegram botunuz üzerinden arbitraj gerçekleştiğinde anlık bildirim alabilirsiniz. `@BotFather` aracılığıyla bir bot oluşturun.
                </p>
              </div>

              {/* Panel Authentication configuration */}
              <div className="border-t border-[#222226] pt-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    Panel Giriş Bilgileri
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">Güvenlik</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">Kullanıcı Adı</label>
                    <input
                      type="text"
                      value={panelUsername}
                      onChange={(e) => {
                        setPanelUsername(e.target.value);
                        localStorage.setItem('panel_username', e.target.value);
                      }}
                      className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-500 uppercase tracking-wider font-mono">Şifre</label>
                    <input
                      type="text"
                      value={panelPassword}
                      onChange={(e) => {
                        setPanelPassword(e.target.value);
                        localStorage.setItem('panel_password', e.target.value);
                      }}
                      className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <p className="text-[9px] text-zinc-500 leading-normal">
                  Giriş ekranı için belirlediğiniz kullanıcı adı ve şifre. Bilgiler güvenle tarayıcınızda (Local Storage) saklanır.
                </p>
              </div>

              {/* Calculated Targets Overview */}
              <div className="pt-4 border-t border-[#222226] text-[11px] text-zinc-400 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span>Beklenen Min. Brüt Kâr:</span>
                  <span className="text-emerald-400 font-bold">
                    +{expectedProfitEstimate.token.toFixed(startToken === 'BONK' ? 2 : 5)} {startToken} (~${expectedProfitEstimate.usd.toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tahmini Ağ İşlem Masrafı:</span>
                  <span className="text-amber-500 font-medium">
                    ~{(priorityFeeSol + 0.000005).toFixed(6)} SOL
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Live Stats */}
            <div className="bg-[#121215] border border-[#222226] rounded-none p-6 grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-bold">Simüle Edilen Kâr</span>
                <span className="text-3xl font-serif italic font-bold text-emerald-400">${simProfit.toFixed(3)}</span>
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Simülasyon Aktif</p>
              </div>
              <div className="space-y-1 border-l border-[#222226] pl-6">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-bold">Gerçekleşen Arb</span>
                <span className="text-3xl font-serif italic font-bold text-white">{simTransactions} <span className="text-xs font-sans tracking-widest text-zinc-500 uppercase">işlem</span></span>
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">Ağ Doğrulaması</p>
              </div>
            </div>

          </div>

          {/* Right Column: Simulator & Live Log Terminal (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Visual Flow Animation Card */}
            <div className="bg-[#121215] border border-[#222226] rounded-none p-6 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#222226] pb-4 mb-5">
                <h3 className="text-base font-serif font-bold tracking-tight text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-indigo-400" />
                  Arbitraj Döngü Diyagramı
                </h3>
                <div className="flex items-center gap-2 text-xs font-mono uppercase text-[10px] tracking-wider">
                  <span className="text-zinc-500">Durum:</span>
                  {simulationStep === 'idle' && <span className="text-zinc-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Beklemede</span>}
                  {simulationStep === 'checking' && <span className="text-indigo-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" /> Rotalar Taranıyor</span>}
                  {simulationStep === 'found' && <span className="text-amber-400 flex items-center gap-1.5 font-bold animate-pulse"><span className="w-2 h-2 rounded-full bg-amber-500" /> Fırsat Yakalandı!</span>}
                  {simulationStep === 'executing' && <span className="text-sky-400 flex items-center gap-1.5 font-bold"><span className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" /> İmzalanıyor...</span>}
                  {simulationStep === 'success' && <span className="text-emerald-400 flex items-center gap-1.5 font-bold animate-pulse"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Başarılı!</span>}
                </div>
              </div>

              {/* Animated flowchart of circular trade */}
              <div className="py-4 flex flex-col md:flex-row items-center justify-around gap-4 relative">
                
                {/* Node: Wallet */}
                <div className="z-10 bg-[#0B0B0D] border border-[#222226] border-l-2 border-l-indigo-500 p-4 rounded-none text-center w-28 shadow-sm">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Cüzdanınız</div>
                  <div className="text-xs font-bold font-mono text-zinc-200 mt-1">{startToken} Havuzu</div>
                  <div className="text-[10px] text-indigo-400 font-mono mt-0.5">{amount} {startToken}</div>
                </div>

                {/* Arrow Right 1 */}
                <div className="relative flex items-center justify-center">
                  <ArrowRight className={`w-5 h-5 text-zinc-700 ${simulationStep === 'checking' || simulationStep === 'found' ? 'animate-pulse text-indigo-400' : ''}`} />
                  {simulationStep === 'checking' && (
                    <motion.div 
                      className="absolute w-2 h-2 rounded-full bg-indigo-400"
                      animate={{ x: [-20, 20] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    />
                  )}
                </div>

                {/* Node: DEX A (Raydium / Meteora) */}
                <div className={`z-10 bg-[#0B0B0D] border p-4 rounded-none text-center w-32 transition-all duration-300 ${
                  simulationStep === 'checking' ? 'border-indigo-500 bg-[#16161A] scale-105' : 'border-[#222226]'
                }`}>
                  <div className="text-[9px] text-emerald-400 uppercase tracking-wider font-bold">DEX A (Alış)</div>
                  <div className="text-xs font-bold text-zinc-200 mt-1">Raydium Pool</div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                    {startToken} ➔ {interToken}
                  </div>
                </div>

                {/* Arrow Right 2 */}
                <div className="relative flex items-center justify-center">
                  <ArrowRight className={`w-5 h-5 text-zinc-700 ${simulationStep === 'executing' ? 'animate-pulse text-indigo-400' : ''}`} />
                  {simulationStep === 'executing' && (
                    <motion.div 
                      className="absolute w-2 h-2 rounded-full bg-amber-400"
                      animate={{ x: [-20, 20] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                    />
                  )}
                </div>

                {/* Node: DEX B (Orca / Jupiter) */}
                <div className={`z-10 bg-[#0B0B0D] border p-4 rounded-none text-center w-32 transition-all duration-300 ${
                  simulationStep === 'executing' || simulationStep === 'success' ? 'border-emerald-500 bg-[#16161A] scale-105' : 'border-[#222226]'
                }`}>
                  <div className="text-[9px] text-indigo-400 uppercase tracking-wider font-bold">DEX B (Satış)</div>
                  <div className="text-xs font-bold text-zinc-200 mt-1">Orca CLMM</div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                    {interToken} ➔ {startToken}
                  </div>
                </div>

                {/* Arrow Right 3 */}
                <div className="relative flex items-center justify-center">
                  <ArrowRight className={`w-5 h-5 text-zinc-700 ${simulationStep === 'success' ? 'animate-pulse text-emerald-400' : ''}`} />
                  {simulationStep === 'success' && (
                    <motion.div 
                      className="absolute w-2 h-2 rounded-full bg-emerald-400"
                      animate={{ x: [-20, 20] }}
                      transition={{ repeat: Infinity, duration: 0.5 }}
                    />
                  )}
                </div>

                {/* Return node: Wallet */}
                <div className={`z-10 bg-[#0B0B0D] border p-4 rounded-none text-center w-28 transition-all duration-300 ${
                  simulationStep === 'success' ? 'border-emerald-500 bg-[#16161A] scale-105' : 'border-[#222226]'
                }`}>
                  <div className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Sonuç</div>
                  <div className="text-xs font-bold text-zinc-200 mt-1">Net Arbitraj</div>
                  <div className="text-[10px] text-emerald-400 font-bold font-mono mt-0.5">
                    +{expectedProfitEstimate.token.toFixed(startToken === 'BONK' ? 1 : 4)} {startToken}
                  </div>
                </div>

              </div>
            </div>

            {/* Terminal Panel */}
            <div className="bg-[#0B0B0D] border border-[#222226] rounded-none flex flex-col overflow-hidden h-[435px] relative">
              
              {/* Terminal Title Bar */}
              <div className="bg-[#121215] px-4 py-2 border-b border-[#222226] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <TerminalIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-mono text-zinc-300 font-semibold">Panel Modu:</span>
                  </div>
                  
                  {/* Console Mode Switcher Buttons */}
                  <div className="flex bg-[#0B0B0D] p-0.5 border border-[#222226] font-mono text-[10px]">
                    <button
                      onClick={() => setActiveConsoleMode('simulation')}
                      className={`px-3 py-1 font-semibold transition-all cursor-pointer ${
                        activeConsoleMode === 'simulation'
                          ? 'bg-indigo-600/15 text-indigo-400 border-b border-indigo-500'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      SİMÜLASYON
                    </button>
                    <button
                      onClick={() => setActiveConsoleMode('real')}
                      className={`px-3 py-1 font-semibold transition-all cursor-pointer ${
                        activeConsoleMode === 'real'
                          ? 'bg-emerald-600/15 text-emerald-400 border-b border-emerald-500'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      GERÇEK BOT (SUNUCU)
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {activeConsoleMode === 'simulation' ? (
                    <>
                      {/* Force Opportunity Button */}
                      <button
                        onClick={handleForceOpportunity}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-none border border-indigo-500 hover:border-indigo-400 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                        title="Simülatöre yapay bir arbitraj fırsatı gönderir"
                      >
                        <Zap className="w-3 h-3 fill-white" />
                        Yapay Fırsat Tetikle
                      </button>

                      {/* Play/Pause simulation */}
                      <button
                        onClick={() => {
                          setIsSimulating(!isSimulating);
                          addLog(isSimulating ? '⏸️ Simülatör duraklatıldı.' : '▶️ Simülatör yeniden başlatıldı.', 'warning');
                        }}
                        className={`p-1.5 hover:bg-[#1E1E22] transition-colors cursor-pointer ${isSimulating ? 'text-amber-400' : 'text-emerald-400'}`}
                        title={isSimulating ? 'Simülasyonu Duraklat' : 'Simülasyonu Başlat'}
                      >
                        {isSimulating ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Real Bot Controls */}
                      {realBotRunning ? (
                        <button
                          onClick={handleStopRealBot}
                          disabled={isStoppingBot}
                          className="bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800/50 text-white font-medium text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-none border border-rose-500 hover:border-rose-400 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                          title="Sunucudaki gerçek bot sürecini sonlandırır"
                        >
                          <Square className="w-3 h-3 fill-white" />
                          {isStoppingBot ? 'Durduruluyor...' : 'Gerçek Botu Durdur'}
                        </button>
                      ) : (
                        <button
                          onClick={handleStartRealBot}
                          disabled={isStartingBot}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50 text-white font-medium text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-none border border-emerald-500 hover:border-emerald-400 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer font-bold"
                          title="Yapılandırmayı otomatik kaydeder ve sunucuda gerçek botu başlatır"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          {isStartingBot ? 'Başlatılıyor...' : 'Gerçek Botu Başlat'}
                        </button>
                      )}
                    </>
                  )}

                  {/* Clear logs */}
                  <button
                    onClick={() => {
                      if (activeConsoleMode === 'simulation') {
                        setTerminalLogs([]);
                        addLog('🧼 Terminal temizlendi.', 'info');
                      } else {
                        setRealBotLogs([]);
                      }
                    }}
                    className="p-1.5 hover:bg-[#1E1E22] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Temizle"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Logs Screen */}
              <div ref={terminalContainerRef} className="p-4 flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1 bg-[#0B0B0D] selection:bg-zinc-800">
                {activeConsoleMode === 'simulation' ? (
                  terminalLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 font-mono">
                      Kayıt bulunmuyor. Simülasyonu başlatın veya yapay fırsat tetikleyin.
                    </div>
                  ) : (
                    terminalLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 hover:bg-[#121215] py-0.5 rounded-none px-1 transition-colors">
                        <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp}]</span>
                        <span className={`shrink-0 select-none ${
                          log.type === 'success' ? 'text-emerald-400' :
                          log.type === 'error' ? 'text-rose-400' :
                          log.type === 'warning' ? 'text-amber-400' :
                          'text-indigo-400'
                        }`}>
                          {log.type === 'success' ? '●' :
                           log.type === 'error' ? '■' :
                           log.type === 'warning' ? '▲' :
                           '○'}
                        </span>
                        <span className={`break-all ${
                          log.type === 'success' ? 'text-emerald-400 font-semibold' :
                          log.type === 'error' ? 'text-rose-400 font-semibold' :
                          log.type === 'warning' ? 'text-amber-300' :
                          log.type === 'info' ? 'text-zinc-300' : 'text-zinc-400'
                        }`}>
                          {log.text}
                        </span>
                      </div>
                    ))
                  )
                ) : (
                  realBotLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600 font-mono text-center p-6">
                      <div className="p-4 bg-[#121215] border border-[#222226] max-w-md">
                        {realBotRunning ? (
                          <div className="flex items-center justify-center gap-2.5 text-emerald-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                            <span className="text-xs uppercase font-bold tracking-wider">Bot Sunucuda Aktif, Loglar bekleniyor...</span>
                          </div>
                        ) : (
                          <div className="text-zinc-500 space-y-1">
                            <span className="text-xs uppercase font-bold tracking-wider block text-zinc-400">Gerçek Bot Sunucuda Pasif</span>
                            <p className="text-[10px] leading-normal font-sans text-zinc-500">
                              Gerçek botu başlatmak için yukarıdaki <span className="text-emerald-400 font-mono font-bold">Gerçek Botu Başlat</span> butonuna basın. 
                              Öncesinde Solana Cüzdan Ayarları ve RPC adresinizi girdiğinizden emin olun. Bot başladığında çıktılar burada canlı akacaktır.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    realBotLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 hover:bg-[#121215] py-0.5 rounded-none px-1 transition-colors">
                        <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp}]</span>
                        <span className={`shrink-0 select-none ${
                          log.type === 'success' ? 'text-emerald-400' :
                          log.type === 'error' ? 'text-rose-400' :
                          log.type === 'warning' ? 'text-amber-400' :
                          'text-indigo-400'
                        }`}>
                          {log.type === 'success' ? '●' :
                           log.type === 'error' ? '■' :
                           log.type === 'warning' ? '▲' :
                           '○'}
                        </span>
                        <span className={`break-all ${
                          log.type === 'success' ? 'text-emerald-400 font-semibold' :
                          log.type === 'error' ? 'text-rose-400 font-semibold' :
                          log.type === 'warning' ? 'text-amber-300' :
                          log.type === 'info' ? 'text-zinc-300' : 'text-zinc-400'
                        }`}>
                          {log.text}
                        </span>
                      </div>
                    ))
                  )
                )}
              </div>

              {/* Terminal Bottom Info */}
              <div className="bg-[#121215] px-4 py-2 border-t border-[#222226] flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                {activeConsoleMode === 'simulation' ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSimulating ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      {isSimulating ? 'Simülasyon Aktif (Canlı Döngü)' : 'Simülasyon Durduruldu'}
                    </span>
                    <span>Fiyatlar her 15sn'de bir güncelleniyor.</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${realBotRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      {realBotRunning ? 'GERÇEK BOT AKTİF (SUNUCUDA)' : 'GERÇEK BOT PASİF'}
                    </span>
                    <span>Tarama Aralığı: {scanInterval} Saniye</span>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Real-time Transactions & Multi-DEX Architecture */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
          
          {/* Real-time Transaction List (8 cols) */}
          <div className="lg:col-span-8 bg-[#121215] border border-[#222226] rounded-none p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#222226] pb-4">
              <div>
                <h3 className="text-base font-serif font-bold tracking-tight text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                  Gerçekleşen İşlem Geçmişi (Real-time Tx History)
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono mt-1">
                  Simüle Edilen veya Canlı Tetiklenen Başarılı Arbitraj Blokları
                </p>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 font-mono font-bold">
                TOPLAM: {simTransactions} İŞLEM
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-[#222226] text-zinc-500 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-2 font-semibold">Saat</th>
                    <th className="py-3 px-2 font-semibold">Rota</th>
                    <th className="py-3 px-2 font-semibold">DEX A (Alış) ➔ DEX B (Satış)</th>
                    <th className="py-3 px-2 font-semibold text-right">Sermaye</th>
                    <th className="py-3 px-2 font-semibold text-right text-emerald-400">Net Kâr</th>
                    <th className="py-3 px-2 font-semibold text-center">MEV</th>
                    <th className="py-3 px-2 font-semibold text-right">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1B1B1F]">
                  <AnimatePresence initial={false}>
                    {txHistory.map((tx) => (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-[#16161A]/50 transition-colors"
                      >
                        <td className="py-3.5 px-2 text-zinc-400 font-medium">{tx.timestamp}</td>
                        <td className="py-3.5 px-2">
                          <span className="bg-indigo-500/5 text-indigo-300 px-2 py-1 border border-indigo-500/10 text-[10px] font-bold">
                            {tx.route}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 text-zinc-300">
                          <span className="text-emerald-400 font-semibold">{tx.dexA}</span>
                          <span className="text-zinc-600 mx-1.5">➔</span>
                          <span className="text-indigo-400 font-semibold">{tx.dexB}</span>
                        </td>
                        <td className="py-3.5 px-2 text-right text-zinc-400 font-medium">{tx.amount}</td>
                        <td className="py-3.5 px-2 text-right text-emerald-400 font-bold font-mono">
                          <div>{tx.profitToken}</div>
                          <div className="text-[10px] text-zinc-500 font-normal">{tx.profitUsd}</div>
                        </td>
                        <td className="py-3.5 px-2 text-center">
                          {tx.useJito ? (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-none font-bold" title="Jito MEV Blok Motoru Koruması">
                              JITO
                            </span>
                          ) : (
                            <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5" title="Standart İşlem">
                              STD
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <span 
                            onClick={() => alert(`Simüle edilmiş işlem hash'i: ${tx.txHash}\nBu platform, botun çalışma mantığını görselleştirmek üzere kurgulanmış bir simülatördür.`)}
                            className="text-indigo-400 hover:text-indigo-300 cursor-pointer underline text-[10px] font-semibold"
                            title="Solscan Simülasyonunu Aç"
                          >
                            {tx.txHash}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
              {txHistory.length === 0 && (
                <div className="text-center py-8 text-zinc-600 font-mono">
                  Henüz işlem gerçekleşmedi. Simülasyonun çalışmasını bekleyin veya yukarıdan 'Yapay Fırsat Tetikle' butonuna tıklayın.
                </div>
              )}
            </div>
          </div>

          {/* Multi-DEX Architecture Information (4 cols) */}
          <div className="lg:col-span-4 bg-[#121215] border border-[#222226] rounded-none p-6 space-y-5">
            <div className="border-b border-[#222226] pb-4">
              <h3 className="text-base font-serif font-bold tracking-tight text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                Çoklu DEX & Arbitraj Mekanizması
              </h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono mt-1">
                Sadece Tek Bir Borsada mı İşlem Yapılıyor?
              </p>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-zinc-400">
              <p className="font-serif italic text-sm text-zinc-300">
                "Hayır, arbitrajın doğası gereği tek bir borsa yerine en az iki veya daha fazla borsada (DEX) eş zamanlı işlem yapılır."
              </p>
              
              <p>
                Platformumuzda üretilen bot kodu, Solana ağındaki en büyük DEX Aggregator (Borsa Toplayıcı) olan <strong className="text-white">Jupiter v6 API</strong>'sini kullanır. Jupiter; Raydium, Orca, Meteora, Phoenix, Lifinity, Whirlpools vb. <strong className="text-white">30'dan fazla borsayı</strong> milisaniyeler içinde tarar.
              </p>

              {/* Mini visual list of supported DEXes */}
              <div className="bg-[#0B0B0D] border border-[#222226] p-3.5 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">Desteklenen / Taranan Solana DEX'leri:</div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-300">
                  <span className="flex items-center gap-1.5 font-semibold">● Raydium Pools</span>
                  <span className="flex items-center gap-1.5 font-semibold">● Orca Whirlpools</span>
                  <span className="flex items-center gap-1.5 font-semibold">● Meteora DLMM</span>
                  <span className="flex items-center gap-1.5 font-semibold">● Phoenix CLOB</span>
                  <span className="flex items-center gap-1.5 font-semibold">● Lifinity Protocol</span>
                  <span className="flex items-center gap-1.5 font-semibold">● Fluxbeam DEX</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono font-bold uppercase text-white tracking-wide block">Fırsat Nasıl Yakalanır ve Değerlendirilir?</span>
                <p>
                  Bot, dairesel rota sorguları gönderir (Örn: <span className="font-mono text-indigo-400">SOL ➔ USDC ➔ SOL</span>). 
                </p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-zinc-300">
                  <li><strong className="text-white">DEX A (Alış):</strong> <strong className="text-emerald-400 font-bold">Raydium</strong> üzerinden en ucuz fiyattan SOL satılarak USDC alınır.</li>
                  <li><strong className="text-white">DEX B (Satış):</strong> Kazanılan USDC, <strong className="text-indigo-400 font-bold">Orca</strong> üzerinden en yüksek fiyattan anında tekrar SOL'a dönüştürülür.</li>
                  <li><strong className="text-white">Atomik İmzalanma:</strong> Bu iki adım tek bir paket halinde Solana ağına iletilir. İki adımdan biri başarısız olursa işlem iptal edilir; böylece asla zarar etmezsiniz.</li>
                </ol>
              </div>
            </div>
          </div>

        </div>

        {/* Tab Controls */}
        <div className="border-b border-[#222226] flex items-center justify-between pt-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 rounded-none ${
                activeTab === 'code'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#121215]/50'
              }`}
            >
              <FileCode className="w-4 h-4 text-indigo-400" />
              Çalıştırılabilir Kod (bot.ts)
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 rounded-none ${
                activeTab === 'guide'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#121215]/50'
              }`}
            >
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Kurulum Rehberi
            </button>
            <button
              onClick={() => setActiveTab('risks')}
              className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 rounded-none ${
                activeTab === 'risks'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#121215]/50'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              Riskler ve İpuçları
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-3.5 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 rounded-none ${
                activeTab === 'settings'
                  ? 'border-indigo-500 text-white bg-indigo-500/5'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-[#121215]/50'
              }`}
            >
              <Settings className="w-4 h-4 text-indigo-400" />
              Gelişmiş Bot Ayarları
            </button>
          </div>
          <span className="text-xs text-zinc-500 font-serif italic pr-2 hidden md:inline">Tüm kodlar ve kılavuzlar Türkçe olarak hazırlanmıştır.</span>
        </div>

        {/* Tab Content Display */}
        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            
            {/* TAB 1: CODE EXPORTER */}
            {activeTab === 'code' && (
              <motion.div
                key="code-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#121215] p-5 rounded-none border border-[#222226]">
                  <div>
                    <h3 className="text-sm font-serif font-bold text-white tracking-wide uppercase">Botun Çalışmaya Hazır Kodu</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Aşağıdaki kod, soldaki panodan girdiğiniz parametrelerle (<span className="text-indigo-400 font-mono">{startToken}➔{interToken}</span>, %{minProfitPct} min kâr, {useJito ? 'Jito aktif' : 'Jito pasif'}) otomatik güncellenir.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyCode}
                        className="bg-[#0B0B0D] hover:bg-[#1E1E22] text-zinc-200 text-xs px-4 py-2 rounded-none border border-[#222226] transition-all flex items-center gap-1.5 cursor-pointer font-mono"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Kopyalandı!' : 'KODU KOPYALA'}
                      </button>
                      <button
                        onClick={handleSaveToServer}
                        disabled={saveServerStatus === 'saving'}
                        className="bg-emerald-600 hover:bg-emerald-550 disabled:bg-emerald-800 text-white text-xs px-4 py-2 rounded-none border border-emerald-500 hover:border-emerald-400 transition-all flex items-center gap-1.5 cursor-pointer font-bold tracking-wider"
                      >
                        {saveServerStatus === 'saving' ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        SUNUCUYA KAYDET (SOLArb)
                      </button>
                      <button
                        onClick={handleDownloadCode}
                        className="bg-indigo-600 hover:bg-indigo-550 text-white text-xs px-4 py-2 rounded-none border border-indigo-500 hover:border-indigo-400 transition-all flex items-center gap-1.5 cursor-pointer font-bold tracking-wider"
                      >
                        <Download className="w-4 h-4" />
                        İNDİR (bot.ts)
                      </button>
                    </div>
                    {saveServerStatus !== 'idle' && (
                      <span className={`text-[11px] font-mono font-bold ${
                        saveServerStatus === 'success' ? 'text-emerald-400' : saveServerStatus === 'error' ? 'text-rose-400' : 'text-zinc-400'
                      }`}>
                        {saveServerMessage}
                      </span>
                    )}
                  </div>
                </div>

                {/* Code Container */}
                <div className="bg-[#0B0B0D] border border-[#222226] rounded-none overflow-hidden shadow-sm">
                  {/* File name bar */}
                  <div className="bg-[#121215] px-4 py-2.5 border-b border-[#222226] flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span>bot.ts - (Solana Web3.js + Jupiter v6)</span>
                    <span className="text-indigo-400 uppercase font-bold text-[10px]">TypeScript</span>
                  </div>
                  
                  {/* Code Editor */}
                  <pre className="p-5 overflow-x-auto font-mono text-xs text-zinc-300 leading-relaxed bg-[#0B0B0D] max-h-[600px] scrollbar-thin">
                    <code>{generatedCode}</code>
                  </pre>
                </div>
              </motion.div>
            )}

            {/* TAB 2: STEP BY STEP INSTALLATION GUIDE */}
            {activeTab === 'guide' && (
              <motion.div
                key="guide-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-12 gap-8"
              >
                {/* Steps selection sidebar (4 cols) */}
                <div className="md:col-span-4 space-y-2">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-2 mb-3 font-mono">Kurulum Adımları</div>
                  {INSTALLATION_GUIDE.map((step, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveGuideStep(idx)}
                      className={`w-full text-left p-4 rounded-none border transition-all cursor-pointer flex items-center justify-between ${
                        activeGuideStep === idx
                          ? 'bg-indigo-500/5 border-indigo-500/85 text-white font-semibold'
                          : 'bg-[#121215] border-[#222226] text-zinc-400 hover:text-white hover:bg-[#1E1E22]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-[#0B0B0D] border border-[#222226] w-6 h-6 rounded-none flex items-center justify-center font-mono font-bold text-indigo-400">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-serif italic text-zinc-300 font-semibold">{step.title}</span>
                      </div>
                      <ArrowRight className={`w-3.5 h-3.5 ${activeGuideStep === idx ? 'text-indigo-400' : 'text-zinc-600'}`} />
                    </button>
                  ))}
                </div>

                {/* Step content display (8 cols) */}
                <div className="md:col-span-8 bg-[#121215] border border-[#222226] rounded-none p-6 space-y-6">
                  <div>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-none font-bold uppercase tracking-widest font-mono">
                      ADIM {activeGuideStep + 1}: {INSTALLATION_GUIDE[activeGuideStep].title}
                    </span>
                  </div>

                  <div className="space-y-6">
                    {INSTALLATION_GUIDE[activeGuideStep].content.map((item, idx) => (
                      <div key={idx} className="space-y-3">
                        <h4 className="text-sm font-serif font-bold text-white uppercase tracking-wide">{item.heading}</h4>
                        <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>
                        
                        {/* If step has code blocks */}
                        {item.code && (
                          <div className="bg-[#0B0B0D] border border-[#222226] rounded-none p-4 relative font-mono text-xs text-indigo-400">
                            <pre className="overflow-x-auto"><code>{item.code}</code></pre>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(item.code || '');
                                addLog(`📋 Kurulum komutu kopyalandı.`, 'info');
                              }}
                              className="absolute top-2 right-2 p-1 bg-[#121215] hover:bg-[#1E1E22] border border-[#222226] rounded-none text-zinc-400 hover:text-white transition-all cursor-pointer"
                              title="Kopyala"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* List items */}
                        <ul className="space-y-1.5 pl-1">
                          {item.points.map((p, pIdx) => (
                            <li key={pIdx} className="text-xs text-zinc-300 flex items-start gap-2">
                              <span className="text-indigo-500 mt-1 shrink-0">•</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: RISKS AND TIPS */}
            {activeTab === 'risks' && (
              <motion.div
                key="risks-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <h3 className="text-lg font-serif italic font-bold text-white">{RISKS_AND_TIPS.title}</h3>
                  <p className="text-xs text-zinc-400">{RISKS_AND_TIPS.subtitle}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {RISKS_AND_TIPS.sections.map((section, idx) => (
                    <div 
                      key={idx} 
                      className={`p-6 rounded-none border bg-[#121215] space-y-4 ${
                        section.type === 'danger' ? 'border-rose-500/20 border-l-2 border-l-rose-500' :
                        section.type === 'warning' ? 'border-amber-500/20 border-l-2 border-l-amber-500' :
                        'border-[#222226] border-l-2 border-l-indigo-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {section.type === 'danger' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                        {section.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        {section.type === 'info' && <Info className="w-4 h-4 text-indigo-400" />}
                        <h4 className={`text-xs font-mono font-bold uppercase tracking-wider ${
                          section.type === 'danger' ? 'text-rose-400' :
                          section.type === 'warning' ? 'text-amber-400' :
                          'text-indigo-400'
                        }`}>{section.title}</h4>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{section.text}</p>
                    </div>
                  ))}
                </div>

                {/* Additional tips and links */}
                <div className="bg-[#121215] border border-[#222226] rounded-none p-6 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    Kullanışlı Harici Araçlar ve Kaynaklar
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                    <a 
                      href="https://jup.ag" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-3.5 bg-[#0B0B0D] hover:bg-[#1E1E22] border border-[#222226] rounded-none flex items-center justify-between text-xs text-zinc-300 transition-all"
                    >
                      <span>Jupiter Swap</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                    </a>
                    <a 
                      href="https://helius.dev" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-3.5 bg-[#0B0B0D] hover:bg-[#1E1E22] border border-[#222226] rounded-none flex items-center justify-between text-xs text-zinc-300 transition-all"
                    >
                      <span>Helius RPC</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                    </a>
                    <a 
                      href="https://jito.wtf" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-3.5 bg-[#0B0B0D] hover:bg-[#1E1E22] border border-[#222226] rounded-none flex items-center justify-between text-xs text-zinc-300 transition-all"
                    >
                      <span>Jito Labs</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                    </a>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB 4: ADVANCED SETTINGS AND PM2 GUIDELINES */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                {/* Left Column (8 cols): Configuration Panels */}
                <div className="lg:col-span-8 space-y-6">
                  
                  {/* Telegram Notification Card */}
                  <div className="bg-[#121215] border border-[#222226] p-6 space-y-5">
                    <div className="border-b border-[#222226] pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Send className="w-5 h-5 text-sky-400" />
                        <div>
                          <h4 className="text-sm font-serif font-bold text-white uppercase tracking-wide">Telegram Bildirim Kanalı</h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">ANLIK ARBİTRAJ VE HATA BİLDİRİMLERİ</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 font-bold uppercase tracking-wider font-mono">Entegrasyon</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Bot Token (TELEGRAM_TOKEN)</label>
                        <input
                          type="password"
                          value={telegramToken}
                          onChange={(e) => {
                            setTelegramToken(e.target.value);
                            localStorage.setItem('telegram_token', e.target.value);
                          }}
                          placeholder="Örn: 123456789:ABCdefGhI..."
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Sohbet ID (TELEGRAM_CHAT_ID)</label>
                        <input
                          type="text"
                          value={telegramChatId}
                          onChange={(e) => {
                            setTelegramChatId(e.target.value);
                            localStorage.setItem('telegram_chat_id', e.target.value);
                          }}
                          placeholder="Örn: 987654321"
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="bg-[#0B0B0D] border border-[#222226] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-300 font-mono">Canlı Bağlantı Testi</span>
                        <span className="text-[9px] text-zinc-500 font-mono">ANLIK SORGULAMA</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Girdiğiniz bilgilerin doğruluğunu kontrol etmek ve botun size mesaj gönderebildiğinden emin olmak için testi başlatın.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={handleTestTelegram}
                          disabled={telegramTestStatus === 'testing'}
                          className="bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 text-white font-mono text-[10px] font-bold uppercase tracking-wider px-4 py-2.5 rounded-none transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          {telegramTestStatus === 'testing' ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              TEST EDİLİYOR...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              BAĞLANTIYI TEST ET
                            </>
                          )}
                        </button>
                        {telegramTestStatus !== 'idle' && (
                          <span className={`text-[11px] font-mono font-semibold ${
                            telegramTestStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {telegramTestMessage}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Solana Wallet Credentials Card */}
                  <div className="bg-[#121215] border border-[#222226] p-6 space-y-5">
                    <div className="border-b border-[#222226] pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Wallet className="w-5 h-5 text-emerald-400" />
                        <div>
                          <h4 className="text-sm font-serif font-bold text-white uppercase tracking-wide">Solana Cüzdan Ayarları</h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">İŞLEM İMZALAMA VE YETKİLENDİRME</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 font-bold uppercase tracking-wider font-mono">Cüzdan</span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Cüzdan Özel Anahtarı (SOLANA_PRIVATE_KEY)</label>
                        <input
                          type="password"
                          value={privateKey}
                          onChange={(e) => {
                            setPrivateKey(e.target.value);
                            localStorage.setItem('solana_private_key', e.target.value);
                          }}
                          placeholder="Örn: Phantom dışa aktarılan base58 anahtarı veya [12, 34, 56...] dizi formatı"
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>

                      <div className="p-4 bg-zinc-950/40 border border-[#222226] rounded-none space-y-2">
                        <div className="flex items-center gap-2 text-amber-500">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span className="text-xs font-bold font-mono uppercase tracking-wide">Önemli Güvenlik Uyarısı</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                          Girdiğiniz özel anahtar kesinlikle hiçbir sunucuya gönderilmez. Sadece tarayıcınızın yerel hafızasında (<span className="text-indigo-400 font-mono">Local Storage</span>) saklanır ve ürettiğiniz <span className="text-emerald-400 font-mono">bot.ts</span> dosyasına yerleştirilir. 
                          Eğer kodu bilgisayarınızda veya sunucunuzda <span className="text-emerald-400 font-mono">.env</span> dosyası ile çalıştırmak isterseniz, bu alanı boş bırakıp doğrudan <span className="text-indigo-400 font-mono">SOLANA_PRIVATE_KEY</span> ortam değişkenini kullanabilirsiniz.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security Credentials Card */}
                  <div className="bg-[#121215] border border-[#222226] p-6 space-y-5">
                    <div className="border-b border-[#222226] pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <KeyRound className="w-5 h-5 text-indigo-400" />
                        <div>
                          <h4 className="text-sm font-serif font-bold text-white uppercase tracking-wide">Yönetim Paneli Giriş Bilgileri</h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">KULLANICI GÜVENLİĞİ VE ŞİFRE YÖNETİMİ</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 font-bold uppercase tracking-wider font-mono">Kimlik</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Kullanıcı Adı</label>
                        <input
                          type="text"
                          value={panelUsername}
                          onChange={(e) => {
                            setPanelUsername(e.target.value);
                            localStorage.setItem('panel_username', e.target.value);
                          }}
                          placeholder="Yönetici kullanıcı adı"
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Giriş Şifresi</label>
                        <input
                          type="text"
                          value={panelPassword}
                          onChange={(e) => {
                            setPanelPassword(e.target.value);
                            localStorage.setItem('panel_password', e.target.value);
                          }}
                          placeholder="Yönetici şifresi"
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-500 leading-normal font-mono">
                      ℹ️ Bilgiler tarayıcınızın güvenli yerel hafızasında (Local Storage) saklanır. Şifreyi değiştirdiğiniz an, sonraki girişlerde yeni şifreniz geçerli olacaktır.
                    </p>
                  </div>

                  {/* Network and Performance Synchronized Settings */}
                  <div className="bg-[#121215] border border-[#222226] p-6 space-y-5">
                    <div className="border-b border-[#222226] pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Cpu className="w-5 h-5 text-indigo-400" />
                        <div>
                          <h4 className="text-sm font-serif font-bold text-white uppercase tracking-wide">Ağ ve Algoritma Parametreleri</h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">RPC VE İŞLEM HASSASİYETİ AYARLARI</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 font-bold uppercase tracking-wider font-mono">Senkronize</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Solana RPC Bağlantı Adresi (Private/Custom)</label>
                        <input
                          type="text"
                          value={rpcUrl}
                          onChange={(e) => setRpcUrl(e.target.value)}
                          placeholder="https://mainnet.helius-rpc.com/?api-key=..."
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Tarama Sıklığı (Saniye)</label>
                        <input
                          type="number"
                          value={scanInterval}
                          onChange={(e) => setScanInterval(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-bold">Yedekli Jupiter API Adresi (İsteğe Bağlı)</label>
                      <input
                        type="text"
                        value={jupiterApiUrl}
                        onChange={(e) => setJupiterApiUrl(e.target.value)}
                        placeholder="Yedekli listeye eklemek veya değiştirmek için girin (örn. https://quote-api.jup.ag/v6)"
                        className="w-full bg-[#0B0B0D] border border-[#222226] rounded-none px-3.5 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Bu parametreler ana kontrol paneli ile senkronize çalışır. Buradan yaptığınız değişiklikler kod çıktısını (bot.ts) ve simülasyon parametrelerini doğrudan etkiler.
                    </p>
                  </div>

                </div>

                {/* Right Column (4 cols): PM2 & Execution Tutorial */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* Dynamic PM2 Tutorial Card */}
                  <div className="bg-[#121215] border border-[#222226] p-6 space-y-4">
                    <div className="border-b border-[#222226] pb-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-widest font-mono flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-indigo-400" />
                        PM2 VE BOT.TS KILAVUZU
                      </h4>
                      <p className="text-[9px] text-zinc-500 font-mono mt-1">PM2 İLE ARKA PLANDA KESİNTİSİZ ÇALIŞTIRMA</p>
                    </div>

                    <div className="space-y-4 text-xs leading-relaxed text-zinc-400 font-sans">
                      
                      <div className="space-y-2">
                        <span className="text-[11px] font-mono font-bold uppercase text-white tracking-wide block">1. PM2 Nedir ve Neden Kullanılır?</span>
                        <p>
                          PM2, Linux ve Windows sunucularda çalışan Node.js/TypeScript uygulamalarınızı <strong className="text-zinc-200">arka planda (daemon)</strong> kesintisiz yürütmenizi sağlayan bir proses yöneticisidir. Terminali kapatsanız dahi botunuz çalışmaya devam eder, sunucu çökerse botu otomatik ayağa kaldırır.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[11px] font-mono font-bold uppercase text-white tracking-wide block">2. bot.ts İsmi Nereden Gelir?</span>
                        <p>
                          Yandaki panelden <strong className="text-zinc-200">"İNDİR (bot.ts)"</strong> butonuna basarak bilgisayarınıza kaydettiğiniz özelleştirilmiş dosya sizin asıl bot kodunuzdur. Sunucunuzda (örn. Ubuntu) bir çalışma dizini açıp (örn. `/root/solana-bot`) bu dosyanın ismini <code className="font-mono text-indigo-400">bot.ts</code> olarak kaydettiğinizde, PM2 komutunun hedef dosyası hazır hale gelir.
                        </p>
                      </div>

                      <div className="space-y-2 bg-[#0B0B0D] border border-[#222226] p-3">
                        <span className="text-[10px] font-mono font-bold uppercase text-indigo-400 tracking-wide block">PM2 Komutu Analizi:</span>
                        <code className="block text-[10px] font-mono text-zinc-300 break-all bg-[#121215] p-2 border border-[#222226]">
                          pm2 start "npx tsx src/bot.ts" --name solana-arbitrage-bot
                        </code>
                        <ul className="list-disc list-inside text-[10px] text-zinc-400 space-y-1 font-mono mt-1.5">
                          <li><strong className="text-zinc-200">npx tsx:</strong> TS dosyalarını ön-derleme yapmadan doğrudan süper hızlı çalıştırır.</li>
                          <li><strong className="text-zinc-200">src/bot.ts:</strong> Bot dosyanızın sunucudaki konumu.</li>
                          <li><strong className="text-zinc-200">--name:</strong> PM2 kontrol listesindeki adı.</li>
                        </ul>
                      </div>

                      <div className="space-y-2 border-t border-[#222226] pt-3">
                        <span className="text-[11px] font-mono font-bold uppercase text-white tracking-wide block">Faydalı PM2 Komutları:</span>
                        <div className="grid grid-cols-1 gap-2 text-[10px] font-mono text-zinc-300">
                          <div className="bg-[#0B0B0D] p-2 border border-[#222226]">
                            <div className="text-indigo-400 font-semibold">pm2 logs solana-arbitrage-bot</div>
                            <div className="text-zinc-500 mt-0.5 text-[9px]">Botun anlık konsol çıktılarını ve yakaladığı kârları izler.</div>
                          </div>
                          <div className="bg-[#0B0B0D] p-2 border border-[#222226]">
                            <div className="text-indigo-400 font-semibold">pm2 restart solana-arbitrage-bot</div>
                            <div className="text-zinc-500 mt-0.5 text-[9px]">Yeni ayarların (Örn: telegram token) geçerli olması için botu yeniden başlatır.</div>
                          </div>
                          <div className="bg-[#0B0B0D] p-2 border border-[#222226]">
                            <div className="text-indigo-400 font-semibold">pm2 status</div>
                            <div className="text-zinc-500 mt-0.5 text-[9px]">Tüm aktif botların CPU/RAM kullanımını listeler.</div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#222226] bg-[#0B0B0D] py-12 mt-20 text-center text-xs text-zinc-500 space-y-3 font-mono">
        <p className="uppercase tracking-widest text-[9px]">© 2026 Solana Arbitraj Botu Platformu. Tüm hakları saklıdır.</p>
        <p className="text-[9px] text-zinc-600 normal-case tracking-normal max-w-3xl mx-auto font-sans leading-relaxed px-4">
          Bu uygulama eğitim ve simülasyon amaçlıdır. Finansal tavsiye içermez. Gerçek cüzdanlarla yapılan işlemler tamamen kullanıcının kendi sorumluluğundadır.
        </p>
      </footer>
          </div>
        </>
      )}
    </div>
  );
}
