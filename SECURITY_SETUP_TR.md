# SOLArb — Ubuntu / Linux VPS güvenli kurulum

Bu sürüm paneli anahtarsız tarayıcıya dönüştürür. Canlı işlem ayrı Linux kullanıcısı ve systemd servisiyle çalışır. Paneldeki ayarlar canlı servisin ayarlarını değiştirmez. VPS kurulumu ve gerçek para ile işlem bu değişiklik hazırlanırken denenmedi; aşağıdaki doğrulamaları sunucunuzda yapın.

## 1. Eski kurulum ve anahtarlar

Eski botu ve web panelini durdurun. PM2 kullanıyorsanız `pm2 list` ile isimlerini bulun ve ilgili süreçleri `pm2 stop İSİM` ile durdurun; eski otomatik başlangıç kaydını da kaldırın. Eski sürümü internete açık bırakmayın.

Özel anahtar eski panele, sohbetlere veya GitHub'a girildiyse yeni, yalnızca bot için kullanılacak bir cüzdan oluşturun; eski cüzdandaki varlıkları güvenli cüzdana taşıyın. Dosyayı silmek anahtarı geçersiz kılmaz. Eski tarayıcı adresinin site verilerini/localStorage alanını temizleyin. Eski config.json, üretilmiş bot kodu, .env, yedekler ve Git geçmişinde anahtar bulunabilir. Açığa çıkan API/Telegram anahtarlarını da yenileyin. Hiçbir özel anahtarı bu sohbete göndermeyin.

## 2. Ön koşullar ve kodu hazırlama

Ubuntu 22.04/24.04, sudo erişimli normal kullanıcı, Git ve npm gerekir. Node.js en az 22.18 olmalı. [Resmî Node.js indirme sayfasından](https://nodejs.org/en/download) desteklenen sürümü kurun. Servisler `/usr/bin/node` kullanır; kurulumunuz farklıysa iki servis dosyasının ExecStart satırını gerçek mutlak yola uyarlayın. Kullanıcıya özel nvm dizini ProtectHome nedeniyle uygun değildir.

```bash
node --version
npm --version
command -v node
sudo apt update
sudo apt install -y git
git clone --branch codex/security-hardening https://github.com/kenpachiapt/SOLArb.git solarb-secure
cd solarb-secure
npm ci --ignore-scripts
npm test
npm run lint
npm run build
npm audit
```

Komutlar başarısızsa devam etmeyin. Bağımlılıkları ve derlemeyi normal kullanıcıyla çalıştırın. Aşağıdaki hedef yeni/boş kurulum içindir; mevcut `/opt/solarb` üzerine eski dosyaları bırakarak kopyalamayın.

```bash
sudo install -d -m 755 /opt/solarb
sudo cp -a . /opt/solarb/
sudo chown -R root:root /opt/solarb
sudo chmod -R go-w /opt/solarb
```

## 3. Kullanıcıları ve kapalı dizinleri oluşturma

```bash
sudo adduser --system --group --no-create-home --home /nonexistent solarb-panel
sudo adduser --system --group --no-create-home --home /nonexistent solarb-bot
sudo install -d -o root -g root -m 700 /etc/solarb
sudo install -d -o solarb-panel -g solarb-panel -m 700 /var/lib/solarb-panel
sudo install -d -o solarb-bot -g solarb-bot -m 700 /var/lib/solarb-bot
cd /opt/solarb
sudo install -m 600 deploy/panel.env.example /etc/solarb/panel.env
sudo install -m 600 deploy/bot.env.example /etc/solarb/bot.env
sudo install -m 600 deploy/bot.config.example.json /etc/solarb/bot.json
```

İki durum dizini de oluşturulmalıdır; servislerin erişim engelleri bu dizinlere başvurur. Kaynak kod root'a aittir; panel ve bot kodu değiştiremez.

## 4. Panel şifresi ve cüzdan

SSH terminalinde aşağıdaki yardımcıyı çalıştırın. Şifre/anahtar ekranda görünmez, komut argümanına ve shell geçmişine yazılmaz. Mevcut dosyaların üzerine yazılmaz.

```bash
sudo /usr/bin/node scripts/setup-secret.ts password /etc/solarb/panel-password
```

En az 16 karakterlik benzersiz panel şifresi seçin. Diskte scrypt özeti tutulur. Yalnızca panelde fırsat taramak için cüzdan anahtarı gerekmez. Ayrı bot servisini kullanacaksanız:

```bash
sudo /usr/bin/node scripts/setup-secret.ts wallet /etc/solarb/wallet-key
```

Gizli isteme cüzdanın **64 baytlık Solana secret key'inin Base58 biçimini** veya 64 elemanlı JSON anahtar dizisini girin. Seed phrase/12–24 kelime ve 32 baytlık seed kabul edilmez. Yardımcı yalnızca türetilen herkese açık cüzdan adresini gösterir. Bu adresi aşağıdaki iki dosyadaki SOLANA_PUBLIC_ADDRESS alanına yazın:

```bash
sudoedit /etc/solarb/panel.env
sudoedit /etc/solarb/bot.env
sudoedit /etc/solarb/bot.json
```

Panel için PANEL_ORIGIN=http://127.0.0.1:3000 bırakın. İhtiyaç varsa ayrı SCANNER_JUPITER_API_KEY girin. Bot dosyasına RPC ve Jupiter API bilgilerinizi girin. SOLANA_DRY_RUN=true ve ENABLE_LIVE_TRADING boş kalsın. Özel anahtarı env dosyasına koymayın. SOLANA_PRIVATE_KEY ortam değişkeni reddedilir. Anahtar düz dosyada root erişimiyle saklanır; systemd onu yalnızca bot hizmetine credential olarak verir. Bu disk şifreleme değildir; root/VPS sağlayıcısı erişimine karşı koruma sağlamaz. Şifreli disk/yedek ve güvenilir VPS hesabı gerekir.

## 5. Servis ve SSH tüneli

```bash
sudo install -m 644 deploy/solarb-panel.service /etc/systemd/system/solarb-panel.service
sudo install -m 644 deploy/solarb-bot.service /etc/systemd/system/solarb-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now solarb-panel
sudo systemctl status solarb-panel --no-pager
```

Panel sadece VPS'in 127.0.0.1:3000 adresini dinler. VPS güvenlik grubunda/firewall'da 3000 portunu açmayın; eski kural varsa kaldırın. SSH portunu kapatmayın. Kendi bilgisayarınızın terminalinde:

```bash
ssh -N -L 3000:127.0.0.1:3000 KULLANICI@VPS_IP
```

Tarayıcıda `http://127.0.0.1:3000` açıp panel şifrenizle giriş yapın. Tüneli açık tutun. Public IP:3000 kullanmayın. HTTPS proxy tercih ederseniz TLS sonlandırma ve PANEL_ORIGIN değerini tam HTTPS alan adına göre ayrıca yapılandırmanız gerekir; bu rehber SSH tüneli kullanır.

## 6. Erişim ve tarama doğrulaması

VPS'te:

```bash
curl -i http://127.0.0.1:3000/api/load-config
sudo -u solarb-panel test ! -r /etc/solarb/wallet-key && echo 'Anahtar panele kapalı'
sudo -u solarb-panel test ! -r /var/lib/solarb-bot && echo 'Bot durumu panele kapalı'
sudo -u solarb-panel test ! -w /opt/solarb/server.ts && echo 'Kod salt okunur'
sudo journalctl -u solarb-panel -n 50 --no-pager
```

Curl yanıtı oturum olmadan 401 olmalıdır. Panelde gösterilen adresi kendi cüzdanınızla karşılaştırın. Panelde taramayı başlatın; bu işlem her zaman dry-run çalışır. 500 token ve 25'lik partiyle başlayın; 5000'e kadar artırabilirsiniz. API kotası büyümedikçe token sayısının artması tarama turunu uzatır.

## 7. Ayrı botu önce dry-run çalıştırma

Anahtar credential dosyası hazırsa ve bot.env hâlâ dry-run ise:

```bash
sudo systemctl start solarb-bot
sudo journalctl -u solarb-bot -f
# Takip ekranından Ctrl+C ile çıktıktan sonra:
sudo systemctl stop solarb-bot
```

Panel başlat/durdur düğmesi bu servisi yönetmez. Canlı servisin token ve işlem ayarları `/etc/solarb/bot.json` içindedir. Panelde kaydetmek canlı ayarları değiştirmez.

## 8. Canlı işlemi bilinçli açma

Canlı yürütme deneyseldir. Yalnızca SOL başlangıçlı Jito bundle yolu vardır; ayrı RPC al/sat yolu kaldırılmıştır. Bazı token/program/rota türleri sıkı doğrulama nedeniyle reddedilir. Kod ücret, imzacı ve üst seviye talimat kontrolleri yapar fakat Jupiter iç rota/CPI semantiğini bütünüyle çözümlemez; resmî Jupiter, RPC ve Jito'ya güven varsayımı sürer. Zincir üzerinde nihai kârı zorunlu kılan özel bir arbitraj programı yoktur. Jito'nun uncled block/rebroadcast riskleri nedeniyle her koşulda atomiklik/kâr garantisi verilmez. Önce küçük, kaybını karşılayabileceğiniz bakiyeli ayrı cüzdan kullanın.

`sudoedit /etc/solarb/bot.env` ile limitleri gözden geçirin:

| Ayar | Anlamı |
|---|---|
| MAX_TRADE_SOL | Tek denemenin ana para üst sınırı |
| MAX_DAILY_RISK_SOL | UTC günündeki denemelerin ana para + ücret tavanı toplamı |
| MAX_TRADES_PER_DAY | Günlük deneme sayısı |
| MIN_RESERVE_SOL | Gönderim öncesi bakiye kontrolündeki rezerv |
| MAX_FEES_SOL | Ağ ücretleri ve tip için tavan kontrolü |
| MAX_SLIPPAGE_BPS | İzin verilen slippage; 30 = %0,30 |
| JITO_TIP_SOL | Jito tip tutarı |

Günlük risk **gerçekleşmiş net zarar** değildir: başarılı işlemde de ayrılan ana para/ücret bütçesi geri eklenmez. Bakiye kontrolü son bakiye garantisi değildir; hesap oluşturma/rent ve dış işlemler etkileyebilir. Bot.json içindeki amount, slippagePct ve priorityFeeSol değerlerini de limitlerle uyumlu tutun.

Canlı işlem için birlikte ayarlayın:

```ini
SOLANA_DRY_RUN=false
ENABLE_LIVE_TRADING=I_UNDERSTAND_THE_RISKS
```

Ardından `sudo systemctl start solarb-bot`. Her işlem için elle onay gerekmez; anahtar bot belleğine yüklenir ve limitler dahilinde otomatik imza atılır. Servis hata/belirsiz sonuç sonrası otomatik yeniden başlamaz. Başlangıçta otomatik açılması için enable kullanmayın; önce gözlemleyin.

## 9. Acil durdurma ve belirsiz işlem

```bash
sudo -u solarb-bot touch /var/lib/solarb-bot/STOP
sudo systemctl stop solarb-bot
```

Durdurmak daha önce gönderilmiş işlemi geri almaz. Bot göndermeden önce iki işlem imzasını günlüğe yazar. İki imza da confirmed/finalized olmadan günlük risk kaydındaki pending temizlenmez. Hata veya zaman aşımında bot durur; yeniden başlatma belirsiz işlemi tekrar göndermez.

`sudo journalctl -u solarb-bot` içindeki imzaları kendi RPC'niz veya Solana explorer üzerinden kontrol edin. Sürecin tamamen durduğunu ve önceki işlemin sonucunu/sona erdiğini doğrulamadan kilit veya pending kaydını temizlemeyin. Gönderim öncesi hatalarda da konservatif olarak pending kalabilir. Sonuç çözümlendikten sonra `sudoedit /var/lib/solarb-bot/risk.json` ile yalnızca pending alanını false yapın; spent/trades bütçesini azaltmayın, dosyayı silmeyin. Zorla kapanıştan kalan runner.lock dosyası varsa ancak bu incelemeden sonra kaldırın. Yeniden başlamaya hazır olduğunuzda STOP dosyasını kaldırıp servisi elle başlatın. İmzalar/loglar eksikse inceleme tamamlanmadan devam etmeyin.

## 10. Bakım ve doğrulama kapsamı

SSH anahtarı, VPS hesabında MFA, güvenlik güncellemeleri ve root erişim kontrolü kullanın. Credential yedeklerini şifreleyin; kaynak ZIP/Git deposuna katmayın. Yeni sürümü normal kullanıcıyla temiz dizinde kurup test edin; servisleri durdurarak root'a ait kodu değiştirin. Secret dosyalarını örneklerle tekrar ezmeyin. Şifre değişiminden sonra panel servisini yeniden başlatmak mevcut oturumları sonlandırır.

Bu değişiklikte 22 otomatik test, TypeScript kontrolü ve üretim derlemesi geçti. Bağımlılık taraması hazırlandığı tarihte 0 bilinen açık bildirdi. Bu sonuç bağımsız güvenlik denetimi, Linux systemd uçtan uca testi veya gerçek işlem testi değildir. Büyük bakiyeyle kullanım öncesi bağımsız kod ve dağıtım incelemesi gerekir.

Referanslar: [systemd credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials), [OWASP oturum yönetimi](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Jito işlem gönderimi ve uncled blocks](https://docs.jito.wtf/lowlatencytxnsend/).
