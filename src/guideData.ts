export const INSTALLATION_GUIDE: {title: string; icon: string; content: {heading: string; description: string; points: string[]; code?: string}[]}[] = [
 {title:'Güvenli Ubuntu kurulumu',icon:'Lock',content:[{heading:'Panel ve botu ayırın',description:'Depodaki SECURITY_SETUP_TR.md rehberini izleyin. Node.js 22.18+ ve systemd gereklidir.',points:['Kodlar root sahibi olmalı; servisler kodu değiştirememeli.','Panel solarb-panel, canlı bot solarb-bot kullanıcısıyla çalışır.','3000 portunu internete açmayın; SSH tüneli kullanın.']}]},
 {title:'Anahtar ve giriş',icon:'KeyRound',content:[{heading:'Sırları yalnızca VPS üzerinde kurun',description:'Özel anahtar tarayıcıya veya GitHub’a girilmez. Kurulum aracı girişleri ekranda göstermez.',points:['Panel parolası scrypt özetiyle doğrulanır.','Bot anahtarı 0600 izinli dosyadan systemd LoadCredential ile aktarılır.','Cüzdan adresi ana sayfada gösterilebilir; bu bilgi gizli değildir.']}]},
 {title:'Tarama ve canlı işlem',icon:'Cpu',content:[{heading:'Önce anahtarsız tarama',description:'Panel yalnızca tarayıcıyı başlatır. Canlı mod VPS üzerinden açıkça etkinleştirilir.',points:['Bot varsayılan olarak işlem göndermez.','Canlı mod SOL başlangıcı ve Jito gerektirir; işlem/risk limitleri zorunludur.','Belirsiz zincir sonucunda risk kaydını incelemeden yeniden başlatmayın.']}]}
];
export const RISKS_AND_TIPS = {title:'Güvenlik sınırları',subtitle:'Uygulama kontrolleri kâr veya sıfır kayıp garantisi değildir.',sections:[
 {title:'Ayrı cüzdan',text:'Yalnızca sınırlı işlem bakiyesi bulunan ayrı bir bot cüzdanı kullanın.',type:'warning'},
 {title:'Anahtar sızıntısı',text:'Eski sürüme gerçek anahtar kaydettiyseniz yeni bir cüzdana geçin. Eski dosyaları silmek anahtarı geçersiz kılmaz.',type:'danger'},
 {title:'Bağımlılıklar ve dış hizmetler',text:'Canlı bot Jupiter, RPC, Jito ve yerel kodun doğruluğuna güvenir. Bu çalışma bağımsız bir güvenlik denetimi değildir.',type:'info'}
]};
