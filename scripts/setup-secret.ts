import fs from 'node:fs';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { hashPassword } from '../backend/auth.ts';

async function hidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Etkileşimli SSH terminali gerekli.');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let text = '';
    const finish = () => { process.stdin.removeListener('keypress', onKey); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const onKey = (value: string, key: { name?: string; ctrl?: boolean }) => {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('İptal edildi.')); }
      else if (key?.name === 'return') { finish(); resolve(text); }
      else if (key?.name === 'backspace') text = text.slice(0, -1);
      else if (value && !key?.ctrl && /^[\x20-\x7E]+$/.test(value) && text.length + value.length <= 4096) text += value;
    };
    process.stdin.on('keypress', onKey);
  });
}
const [kind, target] = process.argv.slice(2);
try {
  if (!['password','wallet'].includes(kind) || !target || !path.isAbsolute(target)) throw new Error('Kullanım: node scripts/setup-secret.ts password|wallet /mutlak/dosya');
  if (fs.existsSync(target)) throw new Error('Hedef mevcut. Önce servisleri durdurup mevcut dosyayı güvenli şekilde kaldırın veya farklı yol seçin.');
  let input = await hidden(kind === 'wallet' ? 'Base58 özel anahtar veya 64 sayılık JSON (ekranda görünmez): ' : 'Yeni panel parolası, 16+ karakter (ekranda görünmez): ');
  let output = '', address = '';
  if (kind === 'password') {
    let confirm = await hidden('Parolayı tekrar girin: ');
    if (input !== confirm) throw new Error('Parolalar eşleşmiyor.');
    output = await hashPassword(input); confirm = '';
  } else {
    let bytes: Uint8Array;
    if (input.trim().startsWith('[')) {
      const data=JSON.parse(input);
      if (!Array.isArray(data) || data.length!==64 || !data.every(v=>Number.isInteger(v)&&v>=0&&v<=255)) throw new Error('Geçersiz anahtar.');
      bytes=Uint8Array.from(data);
    } else bytes=bs58.decode(input.trim());
    if (bytes.length!==64) throw new Error('64 baytlık özel anahtar gerekli.');
    address=Keypair.fromSecretKey(bytes).publicKey.toBase58(); output=JSON.stringify(Array.from(bytes)); bytes.fill(0);
  }
  input='';
  const fd=fs.openSync(target,'wx',0o600);
  try { fs.writeFileSync(fd,output+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); output=''; }
  console.log('Dosya 0600 izinleriyle oluşturuldu.' + (address ? '\nHerkese açık adres: '+address : ''));
} catch { console.error('Kurulum tamamlanamadı. Komutu, dosya yolunu ve giriş biçimini kontrol edin. Mevcut dosyaların üzerine yazılmaz.'); process.exitCode=1; }
