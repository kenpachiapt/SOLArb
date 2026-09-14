import { PublicKey } from '@solana/web3.js';

export function publicAddress(value: string): string | null {
  try {
    const text = value.trim();
    return new PublicKey(text).toBase58() === text ? text : null;
  } catch { return null; }
}
