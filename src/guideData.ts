/**
 * Solana Arbitraj Botu - Rehber ve Dokümantasyon Verileri
 * Türkçe adım adım kurulum, MEV rehberi ve güvenlik yönergelerini içerir.
 */

export interface GuideStep {
  title: string;
  icon: string;
  content: {
    heading: string;
    description: string;
    code?: string;
    points: string[];
  }[];
}

export const INSTALLATION_GUIDE: GuideStep[] = [
  {
    title: "Gereksinimler",
    icon: "Cpu",
    content: [
      {
        heading: "1. Node.js ve NPM Kurulumu",
        description: "Botun çalışması için bilgisayarınızda Node.js (v18 veya üzeri sürüm) kurulu olmalıdır.",
        points: [
          "Node.js resmi web sitesinden LTS sürümünü indirin ve kurun.",
          "Terminal veya komut satırında 'node -v' komutunu yazarak başarılı kurulup kurulmadığını kontrol edin."
        ]
      },
      {
        heading: "2. Geliştirici Ortamı (IDE)",
        description: "Kodları düzenlemek için bir kod düzenleyici kullanmanız önerilir.",
        points: [
          "Visual Studio Code (VS Code) kurulumu yapın.",
          "TypeScript desteği için gerekli eklentilerin yüklü olduğundan emin olun."
        ]
      }
    ]
  },
  {
    title: "Proje Kurulumu",
    icon: "FolderGit",
    content: [
      {
        heading: "1. Yeni Proje Klasörü Oluşturma",
        description: "Bilgisayarınızda bot dosyaları için yeni bir boş klasör oluşturun ve içine girin.",
        code: "mkdir solana-arb-bot\ncd solana-arb-bot",
        points: [
          "Klasörü oluşturduktan sonra VS Code ile açın (terminalde 'code .' yazarak açabilirsiniz)."
        ]
      },
      {
        heading: "2. Projeyi Başlatma ve Paketlerin Yüklenmesi",
        description: "Gerekli Solana kütüphanelerini ve yardımcı paketleri kurun.",
        code: "npm init -y\nnpm install @solana/web3.js node-fetch dotenv bs58\nnpm install --save-dev typescript @types/node ts-node",
        points: [
          "@solana/web3.js: Solana ağı ile etkileşim kurmanızı sağlar.",
          "node-fetch: Jupiter API'sinden fiyat teklifi ve işlem detaylarını çekmeye yarar.",
          "dotenv: Özel cüzdan anahtarınızı ve RPC URL'nizi güvende tutacak .env dosyası desteğidir.",
          "ts-node: Yazdığınız TypeScript kodunu derlemeden doğrudan çalıştırmanızı sağlar."
        ]
      },
      {
        heading: "3. TypeScript Yapılandırması",
        description: "Klasörün kök dizininde bir 'tsconfig.json' dosyası oluşturun ve aşağıdaki komutla başlatın:",
        code: "npx tsc --init",
        points: [
          "Oluşan tsconfig.json dosyasında 'moduleResolution' ayarını 'node' olarak güncelleyin."
        ]
      }
    ]
  },
  {
    title: "Cüzdan ve .env",
    icon: "KeyRound",
    content: [
      {
        heading: "1. Çevre Değişkenleri (.env) Oluşturma",
        description: "Anahtarınızı ve ayarlarınızı güvenle saklamak için projenizin ana dizininde '.env' isimli bir dosya oluşturun.",
        code: "SOLANA_RPC_URL=\"https://your-private-rpc.helius-rpc.com?api-key=xxxx\"\nSOLANA_PRIVATE_KEY=\"5gY...Kendi_Ozel_Anahtariniz...\"\nJITO_BLOCK_ENGINE_URL=\"https://mainnet.block-engine.jito.wtf/api/v1/bundles\"",
        points: [
          "ÖNEMLİ: Özel anahtarınızı tırnak içinde, tek bir satırda base58 formatında (Phantom'dan dışa aktardığınız gibi) veya JSON dizi formatında [12,45,21...] yapıştırın.",
          "⚠️ GÜVENLİK UYARISI: .env dosyanızı asla GitHub gibi halka açık ortamlarda paylaşmayın! Projenize '.gitignore' ekleyip içine '.env' yazarak bu dosyanın yanlışlıkla yüklenmesini engelleyin."
        ]
      },
      {
        heading: "2. Arbitraj Sermayesi",
        description: "Botun çalışması için cüzdanınızda yeterli miktarda bakiye bulunmalıdır.",
        points: [
          "Kurguladığınız işlem tutarı kadar başlangıç token'ı (Örn: 1 SOL veya 100 USDC).",
          "İşlem (gas/priority) ücretleri ve hesap açılış maliyetleri (kira/rent) için cüzdanda fazladan en az 0.05 SOL bulundurulması şarttır."
        ]
      }
    ]
  },
  {
    title: "RPC ve Jito MEV",
    icon: "Network",
    content: [
      {
        heading: "1. Neden Özel RPC Kullanmalıyım?",
        description: "Solana'nın varsayılan halka açık RPC düğümü (https://api.mainnet-beta.solana.com) saniyede çok az isteğe izin verir ve arbitraj işlemleri için aşırı yavaştır.",
        points: [
          "Helius, QuickNode, Triton veya Sybil gibi platformlardan ücretsiz veya düşük ücretli bir özel RPC hesabı açın.",
          "Hızlı RPC düğümleri sayesinde piyasa verilerini milisaniyeler içinde alır ve diğer botların önüne geçersiniz."
        ]
      },
      {
        heading: "2. Jito Block Engine Nedir ve Neden Önemlidir?",
        description: "Geleneksel olarak gönderilen Solana işlemleri, madenciler (validatorlar) tarafından sıraya sokulurken önünüzdeki işlemler yüzünden arbitraj fırsatını kaçırabilir. Daha da kötüsü, takas başarısız olsa bile ağ ücreti ödersiniz.",
        points: [
          "Jito, işlemleri 'Bundle' (paket) haline getirerek doğrudan doğrulayıcı blok motoruna iletir.",
          "MEV Koruması: Jito bundle'ları eğer arbitraj başarısız olacaksa (fiyat değiştiyse) hiç zincire yazılmaz, böylece sıfır gas ücreti kaybedersiniz.",
          "Sandwich (Sandviç) saldırılarına karşı korunursunuz, işlemleriniz mempool'da bekletilip önünüze başka işlemler eklenemez."
        ]
      }
    ]
  },
  {
    title: "Telegram Ayarları",
    icon: "Send",
    content: [
      {
        heading: "1. Telegram Botu Oluşturma",
        description: "Arbitraj işlemleri başarıyla tamamlandığında anlık olarak telefonunuza bildirim gelmesi için bir Telegram Botu kurabilirsiniz.",
        points: [
          "Telegram'da `@BotFather` kullanıcısını aratın ve `/newbot` komutunu gönderin.",
          "Botunuza bir isim ve kullanıcı adı vererek size sağlanan benzersiz `HTTP API Token` değerini kopyalayın.",
          "Token bilgisini paneldeki 'Telegram Bot Token' alanına veya botun `.env` dosyasındaki `TELEGRAM_TOKEN` alanına girin."
        ]
      },
      {
        heading: "2. Sohbet (Chat) ID Bulma",
        description: "Botun mesajları sadece size iletebilmesi için kendi Telegram hesap numaranızı (Chat ID) bulmanız gerekir.",
        points: [
          "Telegram'da `@userinfobot` botunu aratın ve `/start` komutunu gönderin.",
          "Bot size sayısal bir kimlik numarası (Örn: `593817420`) dönecektir.",
          "Bu kimlik numarasını 'Telegram Chat ID' alanına veya .env dosyasındaki `TELEGRAM_CHAT_ID` alanına girin."
        ]
      }
    ]
  },
  {
    title: "Botu Çalıştırma",
    icon: "Play",
    content: [
      {
        heading: "1. Dosyayı Oluşturma",
        description: "Proje klasörünüzde 'bot.ts' adlı bir dosya oluşturun ve panodaki özelleştirilmiş kodu kopyalayıp bu dosyaya yapıştırın.",
        points: [
          "Kodu yapıştırdıktan sonra kaydetmeyi (Ctrl + S) unutmayın."
        ]
      },
      {
        heading: "2. Botu Yayına Alma (7/24 Kesintisiz Linux)",
        description: "Terminalinizi açın ve botu başlatmak için aşağıdaki komutları yazın:",
        code: "npx ts-node bot.ts",
        points: [
          "Bot başladığında cüzdan adresinizi, bakiye tipinizi ve tarama periyodunu terminalde göreceksiniz.",
          "Sunucuda (Ubuntu vb.) 7/24 kesintisiz çalışması için PM2 yöneticisini kurun: `npm install -g pm2`",
          "PM2 ile arka planda başlatın: `pm2 start npx --name solana-bot -- ts-node bot.ts`",
          "Sunucu yeniden başlasa bile botun otomatik açılması için: `pm2 startup` ve ardından `pm2 save` komutlarını çalıştırın."
        ]
      }
    ]
  }
];

export const RISKS_AND_TIPS = {
  title: "Solana Arbitrajında Dikkat Edilmesi Gereken Kritik Noktalar",
  subtitle: "Sermayenizi korumak ve kârlı işlemler gerçekleştirmek için bu kuralları mutlaka uygulayın.",
  sections: [
    {
      title: "1. Fiyat Kayması (Slippage) ve Likidite Etkisi",
      text: "Yüksek miktarda bir ticaret yaptığınızda havuzdaki likidite yetersiz ise fiyatta kayma (price impact) yaşanır. Örneğin, 100 SOL satmaya çalışırken fiyatı %1 aşağı çekebilirsiniz. Bu sebeple işlem miktarınızı (Trade Amount) havuzun büyüklüğüne göre optimize edin. Küçük havuzlarda yüksek miktarla arbitraj kâr yerine zarar getirir.",
      type: "danger"
    },
    {
      title: "2. Öncelik Ücretleri (Priority Fees) & Ağ Yoğunluğu",
      text: "Solana ağında binlerce arbitraj botu aynı anda yarışır. Sizin işleminizin bloğa dahil edilmesi için validatorlere ek ücret (Priority Fee) ödemeniz gerekir. Ücret çok düşük olursa işleminiz sıraya giremez ve zaman aşımına uğrar. Ücret çok yüksek olursa da kazandığınız arbitraj kârını gas ücreti olarak harcamış olursunuz. Dinamik priority fee mekanizmaları kullanmak kilit önem taşır.",
      type: "warning"
    },
    {
      title: "3. Jito Ucu ve Rüşvetleri (Jito Tips)",
      text: "Jito kullanarak bundle gönderirken, validatorun işlemi onaylaması için cüzdanınızdan ufak bir Jito tip (bahşiş) ödemesi kesilir (Örn: 0.0001 - 0.001 SOL). Bu bahşiş, işlemin başarıyla yürütülmesini garanti altına alan en etkili yoldur. Yazdığınız kodda Jito tipping akışını eklemek başarınızı büyük oranda artırır.",
      type: "info"
    },
    {
      title: "4. Sahte Token Dolandırıcılığı (Honeypot)",
      text: "Botunuzun dairesel taramalarında bazen %50, %100 gibi gerçekçi olmayan devasa arbitraj fırsatları çıkabilir. Bu durum genellikle yeni çıkmış, satışı engellenmiş veya transfer izni kısıtlanmış sahte token'lardan kaynaklanır (Honeypot). Botunuzun yalnızca güvenilir ve likiditesi doğrulanmış token listelerini (Coingecko/Jupiter onaylı) taramasını sağlayın.",
      type: "danger"
    }
  ]
};
