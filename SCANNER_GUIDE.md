# Geniş token tarayıcısı

Takip üst sınırı varsayılan **500**, panelden veya `SOLANA_MAX_TOKENS` ile **1–5000** arasında ayarlanabilir. Bu bir hedef üst sınırdır; gerçek sayı API verisine ve filtrelere bağlıdır. Tüm Solana tokenlarının kapsandığı iddia edilmez.

## Çalıştırma

Node.js 22.18+ kurun. Proje kökünde `npm ci` çalıştırın, `.env.example` dosyasını `.env` olarak kopyalayın ve Jupiter anahtarınızı `JUPITER_API_KEY` alanına yazın. Anahtar yalnızca sunucuda tutulur; resmi Jupiter dışındaki özel URL'lere gönderilmez.

```sh
node SOLArb/bot.ts
```

Varsayılan `SOLANA_DRY_RUN=true` modunda cüzdan özel anahtarı gerekmez; gerçek fiyat teklifleri çekilir, işlem imzalanmaz veya yayınlanmaz. Panelde **Geniş Token Keşfi**, **Maksimum takip edilen token** ve **Sadece tara** ayarlarını kullanıp **Sunucuya Kaydet** ile botu güncelleyin. Ayar değişikliklerinden sonra çalışan botu yeniden başlatın. `.env` değerleri panelden kaydedilen değerlerin önüne geçer; panel ayarlarını kullanmak için ilgili `.env` satırlarını kaldırın.

Örnek:

```dotenv
JUPITER_API_KEY=your_key
SOLANA_DRY_RUN=true
SOLANA_MAX_TOKENS=500
SOLANA_SCAN_BATCH_SIZE=25
SOLANA_MIN_LIQUIDITY_USD=50000
SOLANA_MIN_VOLUME_24H_USD=10000
JUPITER_REQUEST_INTERVAL_MS=1100
```

## Kaynaklar ve tarama

- Jupiter `tokens/v2/tag?query=verified` geniş listeyi sağlar. `toptraded/24h` ve `toptrending/1h` kaynaklarının her biri belgelenen en fazla 100 kayıtla kullanılır. DexScreener son Solana profilleri ek kaynak olarak alınır ve havuzları 30 mintlik gruplarla sorgulanır.
- Otomatik listeler likidite ve 24 saatlik hacimden süzülür. Eksik istatistikler elenir. Manuel ve cüzdandan alınan tokenlar bu piyasa filtrelerinden muaftır; tüm adresler biçim kontrolünden ve tüm rotalar teklif doğrulamasından geçer. Adres biçimi kontrolü tokenın güvenilirliğini garanti etmez.
- Sabit, şüpheli mint listesi kaldırıldı. SOL/USDC/USDT başlangıç listesine manuel tokenlar ve keşif sonuçları eklenir, tekrarlar ve başlangıç minti çıkarılır. JUP, BONK ve WIF seçimlerinin mint adresleri düzeltildi.
- Her tur varsayılan 25 token taranır; sonraki tur kaldığı yerden devam eder. Liste yenilenince sıradaki mint korunur. Turlar üst üste binmez. API hataları görünürdür; 429/5xx için sınırlı yeniden deneme ve Retry-After desteği vardır.
- Keşif beş dakikada bir yenilenir. Başarısız bir kaynağın önceki listesi en fazla bir saat saklanır; hatalı/boş ilk sonuçlar da tekrar istek yağmurunu önlemek için bekletilir.

500 tokenın tam taraması, tüm rotalar bulunursa **en az 1000 teklif** gerektirir. 1100 ms istek aralığıyla yalnızca istek bekleme süresi yaklaşık **18,3 dakika**, tur araları ayrıca yaklaşık 100 saniyedir. Gecikmeler ve yeniden denemeler buna eklenir. Daha hızlı tarama için hesabınızın izin verdiği kotaya uygun aralık kullanın; token sayısını artırmak saniyelik fırsatların yakalanmasını garanti etmez. Jupiter kotası diğer istemcilerinizle de paylaşılabilir.

## Fırsatların anlamı

İkinci alım/satım teklifi, ilk teklifin slipaj sonrası minimum çıktısıyla sorgulanır. Kâr adayı, ikinci teklifin minimum çıktısından başlangıç miktarı ve tahmini ağ ücretleri düşülerek hesaplanır. DEX ücretleri teklifin içinde bulunduğundan tekrar düşülmez. İki bacağı aynı havuzu kullanan rotalar, ilk işlemin havuz fiyatına etkisini bağımsız tekliflerin hesaba katmaması nedeniyle elenir. Eski, eksik ve yüksek fiyat etkili teklifler reddedilir.

SOL dışında başlangıç varlığı için `SOL_PRICE_IN_START_TOKEN` ile 1 SOL'un başlangıç varlığındaki tahmini karşılığını ayarlayın. Bu değer güncel tutulmalıdır; eksikse yalnızca brüt fark yazılır, fırsat adayı/işlem tetiklenmez. Hesap tahminidir; hesap açma/rent giderleri ve işlem sonrası gerçek bakiye değişimi ölçülmez.

**Canlı yürütme mevcut deneysel yoldur.** Bu çalışma yürütme motorunu üretim düzeyinde atomik arbitraj motoruna dönüştürmez. Jito yolunda tip işlemi ve zincire dahil olma doğrulaması eksiktir; bundle kabulü başarı veya gerçekleşmiş kâr sayılmaz. Jito dışındaki iki işlem atomik değildir. Canlı işlem testi yapılmadı. Geniş tarama için `SOLANA_DRY_RUN=true` kullanın. Paneldeki simülasyon tablosu gerçek tarama değildir; gerçek sonuçları bot loglarından okuyun.

## Doğrulama ve bakım

```sh
npm test
npm run lint
npm run generate:bot
npm run build
```

`src/scannerRuntime.ts` panelin oluşturduğu tek dosyalık bota gömülür. `SOLArb/bot.ts`, `scripts/generate-bot.ts` ile aynı üreticiden oluşturulur; test, iki çıktının eşitliğini kontrol eder. Değişiklikten sonra botu yeniden üretin.

11 Eylül 2026 denemesi: 9 otomatik test geçti. TypeScript kontrolü ve Vite üretim derlemesi geçti. İşlem göndermeyen kısa canlı denemede 407 token listelendi ve SOL–USDC–SOL teklifleri alındı; devamındaki USDT isteği yeniden denemelerden sonra HTTP 429 verdi. Bu nedenle gerçek kullanım kotanızla tarama hızını ayarlamanız gerekir. Tam liste üzerinde canlı fırsat/kârlılık doğrulaması yapılmadı.

Kaynaklar: [Jupiter token bilgileri](https://developers.jup.ag/docs/tokens/token-information), [kategori sınırı](https://developers.jup.ag/docs/api-reference/tokens/category), [quote API](https://developers.jup.ag/docs/swap/v1/get-quote), [DexScreener API](https://docs.dexscreener.com/api/reference). Mevcut quote/swap uyumluluğu için belgelenen `/swap/v1` kullanılır; Jupiter bu API'nin yerine V2'yi öneriyor, V2 geçişi bu değişikliğin kapsamı dışındadır.
