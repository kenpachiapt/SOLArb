import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress } from '../src/walletAddress.ts';
test('public address validates without accepting keys or recovery words',()=>{
  const address='So11111111111111111111111111111111111111112';
  assert.equal(publicAddress(' '+address+' '),address);
  for(const value of ['', 'word '.repeat(12), '1'.repeat(88), '[1,2,3]']) assert.equal(publicAddress(value),null);
});
