# Solana Arbitraj Botu (Solana Arbitrage Bot) 🚀

Solana ağında yüksek hızda dairesel (circular) arbitraj fırsatlarını tespit eden ve Jito MEV korumasıyla otomatik olarak gerçekleştiren profesyonel, üretim kalitesinde bir arbitraj botu ve yapılandırma platformudur.

Bu uygulama, Jupiter v6 API'si aracılığıyla Solana ağındaki en büyük DEX'leri (Raydium, Orca, Meteora vb.) milisaniyeler içinde tarayarak fiyat farklılıklarından kâr elde edilmesini simüle eder ve üretim sunucularınızda çalıştırabileceğiniz kaynak kodunu üretir.

---

## 🌟 Önemli Güvenlik ve Mimari Detayları

* **Güvenli Sermaye Yönetimi (Cüzdan Sınırı):** Bot, cüzdanınızdaki tüm bakiyeyi asla riske atmaz. Arayüzden girdiğiniz **"İşlem Sermayesi"** (Örn: 1 SOL) her bir dairesel döngü için kullanılacak maksimum miktardır. Geri kalan bakiyeniz tamamen güvendedir ve dokunulmaz.
* **Çoklu DEX (Multi-DEX) Altyapısı:** Arbitrajın doğası gereği tek bir borsa yerine en az iki borsa arasında eş zamanlı işlem yapılır. Bot, Jupiter API'yi kullanarak Raydium, Orca, Meteora, Phoenix, Lifinity gibi 30'dan fazla borsayı tarayarak en ucuz borsadan alır (DEX A) ve en pahalı borsada satar (DEX B).
* **Jito MEV Blok Motoru Koruması:** Solana ağında sıklıkla görülen önden çalıştırma (front-running) ve sandviç (sandwich) saldırılarından korunmak için işlemler doğrudan mempool yerine Jito'nun özel validatör ağına "Bundle" (Paket) olarak gönderilir.
* **Atomik İşlemler (Zarar Etmeme Garantisi):** Solana'nın akıllı sözleşmeleri ve talimat yapısı sayesinde, alım ve satım adımları tek bir işlem (transaction) içinde birleştirilir. Eğer borsa fiyatı saniyeler içinde değişir ve hedeflenen kârın altına düşerse, işlem ağda başarısız olur ve sadece minik bir ağ ücreti (priority fee) ödenir. Asla sermaye kaybı yaşanmaz.

---

## 🛠 Ubuntu 22.04 Kurulum Kılavuzu (Adım Adım)

Uygulamanın ve bot mekanizmasının kendi sunucunuzda veya yerel bilgisayarınızda sürekli ve kesintisiz çalışması için aşağıdaki adımları uygulayın.

### 1. Sistemi Güncelleyin
Öncelikle sunucunuzun paket listesini güncelleyin ve mevcut yazılımları yükseltin:
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Node.js ve npm Kurulumu
Botun çalışması için gerekli olan Node.js (v20 veya üzeri) kurulumunu yapın:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
Kurulumun başarılı olduğunu doğrulamak için:
```bash
node -v
npm -v
```

### 3. Projeyi Sunucunuza Çekin / İndirin
ZIP olarak indirdiğiniz veya GitHub repomuzdan kopyaladığınız dosyaları sunucuya aktarın. Git ile çekmek isterseniz:
```bash
git clone <buraya-olusturdugunuz-repo-linkini-yazın>
cd solana-arbitrage-bot
```

### 4. Bağımlılıkları Yükleyin
Solana Web3 kütüphaneleri, Jupiter SDK ve gerekli diğer tüm modülleri yükleyin:
```bash
npm install
```

### 5. Web Arayüzünü Derleyin (Build)
Uygulamanın web tabanlı simülatör panelini ve izleyicisini hazır hale getirmek için projeyi derleyin:
```bash
npm run build
```

### 6. PM2 Kurulumu (Sürekli ve Arka Planda Çalışması İçin)
Terminali kapatsanız bile botun sunucuda 7/24 çalışmaya devam etmesi için PM2 yöneticisini küresel olarak yükleyin:
```bash
sudo npm install -g pm2
```

### 7. Botu PM2 ile Başlatın
Arayüzden indirdiğiniz veya yapılandırdığınız `bot.ts` dosyasını PM2 ile arka planda çalıştırın:
```bash
pm2 start "npx tsx src/bot.ts" --name solana-arbitrage-bot
```

### 8. Sunucu Yeniden Başlatma Koruması
Sunucu çökerse veya yeniden başlatılırsa botun otomatik olarak kaldığı yerden açılması için PM2 servisini sisteme entegre edin:
```bash
pm2 startup
```
*(Yukarıdaki komutu yazdıktan sonra terminal ekranında beliren `sudo env PATH=...` ile başlayan komutu kopyalayıp terminale yapıştırın ve çalıştırın.)*

Yapılandırmayı kaydedin:
```bash
pm2 save
```

---

## ⚙️ Yapılandırma ve Parametre Ayarları

Botunuzu en yüksek verimle çalıştırmak için platform panelinde bulunan ayarları optimize edin:

1. **Solana RPC Sağlayıcı URL:** Mainnet işlemlerinde yüksek hız için Helius, QuickNode veya Triton gibi özel bir RPC düğümü (Private RPC) kullanılması şiddetle tavsiye edilir.
2. **Başlangıç Varlığı (A) & Ara Varlık (B):** İşlem sermayenizin olduğu ana birimi (SOL veya USDC) ve rotada takas edilerek fırsat aranacak ara birimi (USDT, BONK vb.) seçin.
3. **İşlem Sermayesi:** Her arbitraj turunda kullanılacak maksimum bakiye limiti. *Güvenli sınır kuralı gereğince cüzdanın tamamı değil, sadece bu kadarı işleme sokulur.*
4. **Minimum Kâr Hedefi:** İşlemin gerçekleşmesi için net olarak kalması gereken yüzde oran (Örn: %0.15).
5. **Maksimum Slipaj (Slippage):** Fiyat kayma toleransı. Milisaniyeler içindeki fiyat oynamalarında işlemin iptal olmaması için ideal oran %0.1 - %0.5 arasıdır.
6. **Öncelik Ücreti (Priority Fee):** Solana ağında işlemlerinizin blok zincirine diğerlerinden hızlı yazılması için ödeyeceğiniz ekstra SOL miktarı.
7. **Tarama Sıklığı:** Botun yeni fiyatları ve rotaları sorgulama aralığı (saniye bazında).

---

## ⚠️ Önemli Risk ve Yatırım Uyarısı

* Bu proje **eğitim, simülasyon ve kod üretimi** amacıyla tasarlanmıştır.
* Gerçek Solana ana ağında (Mainnet-Beta) işlem yapmak finansal riskler içerir.
* Kodları kendi bilgisayarınızda çalıştırmadan önce lütfen test ağlarında (Devnet) deneyin.
* **CÜZDAN GÜVENLİĞİ:** Özel anahtarlarınızı (Private Key / Seed Phrase) asla internet üzerindeki üçüncü taraf web sitelerine, tarayıcılara veya güvenmediğiniz bot panellerine girmeyin. Sunucu tarafında çalışan `bot.ts` dosyasını kendi güvenli makinenizde izole olarak çalıştırın.

---

## 📄 Lisans

Bu proje MIT Lisansı altında sunulmaktadır. Eğitim amacıyla serbestçe geliştirilebilir ve paylaşılabilir.
