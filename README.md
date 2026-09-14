# SOLArb

Solana token keşfi, Jupiter teklifleriyle arbitraj adaylarının taranması ve ayrı Linux servisiyle deneysel canlı yürütme.

- Varsayılan 500, en fazla 5000 token; sıralı parti taraması ve API kota kontrolü.
- Sunucu oturumuyla korunan, her zaman dry-run çalışan panel.
- Ana sayfada herkese açık cüzdan adresi; tarayıcıda özel anahtar girişi yoktur.
- Ayrı kullanıcı altında canlı bot, systemd credentials, zorunlu risk limitleri ve belirsiz sonuçta durdurma.

**Kurulum:** [Ubuntu/VPS güvenlik ve kurulum rehberi](SECURITY_SETUP_TR.md). Eski PM2/public port/.env kurulum talimatlarının yerine bu rehberi kullanın. Canlı işlem yalnızca VPS üzerinden ayrıca etkinleştirilir.

**Tarama:** [Tarayıcı ayarları](SCANNER_GUIDE.md).

Node.js >=22.18 gereklidir. Sırayla npm ci --ignore-scripts, npm test, npm run lint ve npm run build çalıştırın. npm start derlenmiş paneli başlatır; önce rehberdeki parola özeti ve ortam ayarları gerekir. .env otomatik yüklenmez. Bot şablonu değiştiğinde npm run generate:bot çalıştırın.

Canlı yürütme gerçek para ile doğrulanmamıştır ve bağımsız güvenlik denetiminden geçmemiştir. Teklif kârı gerçekleşmiş kâr değildir. Anahtarı daha önce eski panele/GitHub'a koyduysanız yeni cüzdana geçin.
