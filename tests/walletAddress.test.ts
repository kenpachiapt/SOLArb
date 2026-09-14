import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { addressFromSecret, publicAddress } from '../src/walletAddress.ts';

test('Base58 and JSON secret keys derive the same public address without changing the key', () => {
  const wallet = Keypair.generate();
  const encoded = bs58.encode(wallet.secretKey);
  const expected = wallet.publicKey.toBase58();
  assert.equal(addressFromSecret(encoded), expected);
  assert.equal(addressFromSecret(JSON.stringify(Array.from(wallet.secretKey))), expected);
  assert.equal(bs58.encode(wallet.secretKey), encoded);
  assert.equal(publicAddress(' ' + expected + ' '), expected);
});
test('rejects addresses/seeds as secret keys, corrupt keypairs and invalid JSON bytes', () => {
  const wallet = Keypair.generate();
  const corrupt = wallet.secretKey; corrupt[63] ^= 1;
  for (const input of ['', wallet.publicKey.toBase58(), 'word '.repeat(12), bs58.encode(corrupt), JSON.stringify(Array(64).fill(256)), JSON.stringify(Array(64).fill(1.5))]) {
    assert.equal(addressFromSecret(input), null);
  }
  assert.equal(publicAddress(bs58.encode(wallet.secretKey)), null);
  assert.equal(publicAddress('not-an-address'), null);
});
