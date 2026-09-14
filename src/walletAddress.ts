import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export function publicAddress(value: string): string | null {
  try {
    const text = value.trim();
    return new PublicKey(text).toBase58() === text ? text : null;
  } catch { return null; }
}

// Derive locally from an already configured key. Never return/log the secret.
export function addressFromSecret(value: string): string | null {
  let bytes: Uint8Array | undefined;
  try {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith('[')) {
      const data: unknown = JSON.parse(text);
      if (!Array.isArray(data) || data.length !== 64 || !data.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
      bytes = Uint8Array.from(data);
    } else {
      bytes = bs58.decode(text);
    }
    if (bytes.length !== 64) return null;
    const keypair = Keypair.fromSecretKey(bytes);
    return keypair.publicKey.toBase58();
  } catch { return null; }
  finally { bytes?.fill(0); }
}
