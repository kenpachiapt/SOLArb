# Token taraması

Önce [Ubuntu güvenli kurulumunu](SECURITY_SETUP_TR.md) tamamlayın. Panelin tarayıcısı anahtarsızdır ve işlem imzalamaz. Canlı botun ayarları yalnızca VPS'teki ayrı dosyadan okunur.

Varsayılan 500 token izlenir; maxTokens üst sınırı 5000'dir. scanBatchSize her turda işlenen aday sayısıdır. 500 token/25 parti ile başlayın; likidite ve hacim filtrelerini koruyarak kapasiteyi artırın. Sabit tokenler, keşfedilen tokenler ve doğrulanmış özel mint adresleri birleştirilir. Aynı token yinelenmez.

Jupiter teklifleri ve keşif istekleri kota aralığını paylaşır. Daha fazla token, aynı API kotasında daha uzun tam tarama turu demektir; bütün tokenler eşzamanlı izlenmez. Panel için SCANNER_JUPITER_API_KEY, ayrı bot için JUPITER_API_KEY kullanılır. API anahtarını tarayıcıya veya VITE_ değişkenine koymayın.

Panel kaydı yalnızca izin verilen tarama alanlarını kabul eder. Özel anahtar, keyfi RPC URL'si, kod ve canlı işlem ayarı kabul edilmez. /api/save-bot kaldırılmıştır. Eski config.json ve otomatik .env yükleme kullanılmaz.

Tekliflerde slippage, fiyat etkisi, eskime ve tahmini ücret kontrolleri vardır. Bulunan aday kazanç garantisi değildir; likidite, gecikme, ücretler ve rakipler sonucu değiştirebilir. Canlı modun SOL/Jito sınırları ve güven varsayımları kurulum rehberindedir.
