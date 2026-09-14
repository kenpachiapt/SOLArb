import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import http from 'node:http';
import { createApp } from '../server.ts';
import { hashPassword, verifyPassword } from '../backend/auth.ts';
import { sanitizeConfig } from '../backend/config.ts';
import { generateArbitrageCode } from '../src/arbitrageCode.ts';
import { botSecurityRuntime } from '../src/botSecurityRuntime.ts';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import vm from 'node:vm';
import ts from 'typescript';

const password = 'test-only-long-random-password-123';
const hash = await hashPassword(password);
async function fixture(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solarb-security-'));
  const origin = 'http://127.0.0.1:3000';
  let now = Date.now(), child: any, spawnArgs: any;
  const {app, stop} = createApp({origin, passwordHash:hash, dataDir:directory, root:process.cwd(), now:()=>now,
    spawnBot: ((...args: any[]) => { spawnArgs=args; child = new EventEmitter(); child.stdout=new EventEmitter(); child.stderr=new EventEmitter(); child.kill=()=>true; return child; }) as any });
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address() as any;
  t.after(async()=>{ stop(); await new Promise<void>(resolve=>server.close(()=>resolve())); fs.rmSync(directory,{recursive:true,force:true}); });
  let cookie='', csrf='';
  const request=(route:string, init:RequestInit={})=>new Promise<Response>((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:address.port,path:route,method:init.method||'GET',headers:{Host:'127.0.0.1:3000',Origin:origin,'Content-Type':'application/json','X-Solarb-Request':'1','X-CSRF-Token':csrf,Cookie:cookie,...init.headers as Record<string,string>}},res=>{
      const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const headers=new Headers();for(const [k,v] of Object.entries(res.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});
    });req.on('error',reject);if(init.body)req.write(String(init.body));req.end();
  });
  const login=async()=>{const r=await request('/api/login',{method:'POST',body:JSON.stringify({password})});cookie=r.headers.get('set-cookie')!.split(';')[0];csrf=(await r.json()).csrf;return r;};
  return { request, login, directory, advance:(ms:number)=>{now+=ms;}, get child(){return child;}, get args(){return spawnArgs;} };
}
test('password hashes have unique salts; no default password is accepted',async()=>{
  assert.notEqual(hash,await hashPassword(password));
  assert(await verifyPassword(password,hash));
  assert(!await verifyPassword('solana123',hash));
  assert.throws(()=>createApp({origin:'http://127.0.0.1:3000',passwordHash:'',dataDir:'/tmp',root:'/tmp'}));
});
test('all APIs deny unauthenticated reads and writes, including legacy config and code upload',async t=>{
  const f=await fixture(t);
  for(const route of ['/api/load-config','/api/bot/status','/api/wallet','/api/spy-wallet','/api/health']) assert.equal((await f.request(route)).status,401);
  for(const route of ['/api/save-config','/api/save-bot','/api/bot/start']) assert.equal((await f.request(route,{method:'POST',body:'{}'})).status,401);
});
test('origin, Host, CSRF and JSON enforcement cannot be bypassed by route casing',async t=>{
  const f=await fixture(t);
  for(const route of ['/api/login','/API/LOGIN']) assert.equal((await f.request(route,{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify({password})})).status,403);
  await f.login();
  assert.equal((await f.request('/api/save-config',{method:'POST',headers:{'X-CSRF-Token':'wrong'},body:'{}'})).status,403);
  assert.equal((await f.request('/api/save-config',{method:'POST',headers:{Origin:''},body:'{}'})).status,403);
  assert.equal((await f.request('/api/save-config',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,403);
  assert.equal((await f.request('/api/load-config',{headers:{Host:'evil.example'}})).status,403);
});
test('cookies are HttpOnly and SameSite; logout and expiration revoke server session',async t=>{
  const f=await fixture(t), r=await f.login();
  assert.match(r.headers.get('set-cookie')!,/HttpOnly/); assert.match(r.headers.get('set-cookie')!,/SameSite=Strict/);
  assert.equal((await f.request('/api/session')).status,200);
  f.advance(16*60_000); assert.equal((await f.request('/api/session')).status,401);
  await f.login(); assert.equal((await f.request('/api/logout',{method:'POST',body:'{}'})).status,200);
  assert.equal((await f.request('/api/session')).status,401);
});
test('global login throttle resists spoofed forwarded IPs',async t=>{
  const f=await fixture(t);
  for(let i=0;i<5;i++) assert.equal((await f.request('/api/login',{method:'POST',headers:{'X-Forwarded-For':'192.0.2.'+i},body:'{"password":"wrong"}'})).status,401);
  assert.equal((await f.request('/api/login',{method:'POST',body:JSON.stringify({password})})).status,429);
});
test('config allowlist rejects secrets, URLs, code, live flags and invalid numeric values',()=>{
  for(const value of [{privateKey:'secret'},{telegramToken:'secret'},{rpcUrl:'http://169.254.169.254'},{jupiterApiUrl:'https://evil.example'},{code:'run()'},{dryRun:false},{amount:NaN},{maxTokens:1.5},JSON.parse('{"__proto__":{}}')]) assert.throws(()=>sanitizeConfig(value));
  assert.deepEqual(sanitizeConfig({privateKey:'secret',amount:1},false),{amount:1,dryRun:true,useJito:true});
});
test('legacy credentials are never served and code upload is permanently disabled',async t=>{
  const f=await fixture(t);await f.login();
  fs.writeFileSync(path.join(f.directory,'scanner.json'),JSON.stringify({privateKey:'SECRET',panelPassword:'PASSWORD',amount:1}));
  const r=await f.request('/api/load-config');const text=await r.text();assert(!text.includes('SECRET'));assert(!text.includes('PASSWORD'));
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await f.request('/api/save-bot',{method:'POST',body:'{"code":"arbitrary"}'})).status,410);
  assert.equal((await f.request('/api/save-config',{method:'POST',body:'{"privateKey":"secret"}'})).status,400);
});
test('panel starts fixed scan-only executable without inheriting secrets; stop waits for exit',async t=>{
  const f=await fixture(t);await f.login();
  const previous=process.env.SOLANA_PRIVATE_KEY;process.env.SOLANA_PRIVATE_KEY='FAKE-SECRET';
  try {
    assert.equal((await f.request('/api/bot/start',{method:'POST',body:'{}'})).status,200);
    assert.equal(f.args[0],process.execPath);assert.equal(f.args[2].shell,false);
    assert.equal(f.args[2].env.SOLANA_DRY_RUN,'true');assert.equal(f.args[2].env.SOLANA_PRIVATE_KEY,undefined);
    assert.equal(f.args[2].env.NODE_OPTIONS,undefined);
    f.child.stdout.emit('data',Buffer.from('FAKE-SECRET https://rpc.example/?key=SECRET'));
    const text=await (await f.request('/api/bot/status')).text();assert(!text.includes('SECRET'));
    await f.request('/api/bot/stop',{method:'POST',body:'{}'});
    assert.equal((await f.request('/api/bot/start',{method:'POST',body:'{}'})).status,409);
    f.child.emit('close');
    assert.equal((await f.request('/api/bot/start',{method:'POST',body:'{}'})).status,200);
  } finally { if(previous===undefined) delete process.env.SOLANA_PRIVATE_KEY; else process.env.SOLANA_PRIVATE_KEY=previous; }
});
test('generator ignores deprecated secrets and downloaded code never embeds their values',()=>{
  const code=generateArbitrageCode({rpcUrl:'',startToken:'SOL',interToken:'ALL',amount:1,minProfitPct:1,slippagePct:0.1,useJito:true,priorityFeeSol:0.0001,scanIntervalMs:5000,privateKey:'DO-NOT-EMBED-KEY',telegramToken:'DO-NOT-EMBED-TOKEN',telegramChatId:'DO-NOT-EMBED-CHAT',dryRun:false});
  for(const value of ['DO-NOT-EMBED-KEY','DO-NOT-EMBED-TOKEN','DO-NOT-EMBED-CHAT']) assert(!code.includes(value));
  assert(code.includes('DRY_RUN: true'));assert(!code.includes('fileData.privateKey'));
});
test('key file reader preserves signing bytes, enforces format, permissions and expected address',()=>{
  const pair=Keypair.generate();let mode=0o100600,text=bs58.encode(pair.secretKey);
  const env:any={SOLANA_KEYPAIR_FILE:'/private/key',SOLANA_PUBLIC_ADDRESS:pair.publicKey.toBase58()};
  const context=vm.createContext({fs:{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,size:200,mode,uid:123}),readFileSync:()=>text},path,process:{platform:'linux',getuid:()=>123,env},Keypair,bs58});
  vm.runInContext(ts.transpileModule(botSecurityRuntime,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const loaded=vm.runInContext('walletFromFile()',context);
  assert.deepEqual(Array.from(loaded.secretKey),Array.from(pair.secretKey));
  text=JSON.stringify(Array.from(pair.secretKey));assert.equal(vm.runInContext('walletFromFile().publicKey.toBase58()',context),pair.publicKey.toBase58());
  mode=0o100644;assert.throws(()=>vm.runInContext('walletFromFile()',context));
  mode=0o100600;env.SOLANA_PUBLIC_ADDRESS=Keypair.generate().publicKey.toBase58();assert.throws(()=>vm.runInContext('walletFromFile()',context));
});

test('live risk envelope persists pending state, caps daily exposure and honors STOP',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'solarb-risk-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const pair=Keypair.generate();
  const env:any={ENABLE_LIVE_TRADING:'I_UNDERSTAND_THE_RISKS',MAX_TRADE_SOL:'0.01',MAX_DAILY_RISK_SOL:'0.025',MAX_TRADES_PER_DAY:'2',MIN_RESERVE_SOL:'0.02',MAX_FEES_SOL:'0.001',MAX_SLIPPAGE_BPS:'30',JITO_TIP_SOL:'0.00001',BOT_STATE_DIR:directory};
  const context=vm.createContext({fs:{...fs,lstatSync:(p:string)=>{const s=fs.lstatSync(p);return {isFile:()=>s.isFile(),isDirectory:()=>s.isDirectory(),isSymbolicLink:()=>s.isSymbolicLink(),size:s.size,uid:123,mode:s.isDirectory()?0o40700:0o100600};}},path,
    process:{env,platform:'linux',getuid:()=>123,once:()=>{},pid:123},URL,
    CONFIG:{START_TOKEN:'SOL',USE_JITO:true,JUPITER_API_URL:'https://api.jup.ag/swap/v1',JITO_BLOCK_ENGINE_URL:'https://mainnet.block-engine.jito.wtf/api/v1/bundles',RPC_URL:'https://api.mainnet-beta.solana.com',TRADE_AMOUNT:0.01,SLIPPAGE_BPS:20,PRIORITY_FEE_SOL:0.0001},
  });
  vm.runInContext(ts.transpileModule(botSecurityRuntime,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const risk=vm.runInContext('initializeLiveRisk()',context);
  const connection={getBalance:async()=>100000000};
  await risk.reserve(connection,pair);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'risk.json'),'utf8')).pending,true);
  await assert.rejects(()=>risk.reserve(connection,pair));
  risk.complete(); await risk.reserve(connection,pair); risk.complete();
  await assert.rejects(()=>risk.reserve(connection,pair));
  assert.throws(()=>vm.runInContext('initializeLiveRisk()',context));
  fs.writeFileSync(path.join(directory,'STOP'),'');assert.throws(()=>risk.check());
});

test('live mode refuses missing authorization, non-Linux, non-SOL and custom endpoints',()=>{
  const env:any={};const processMock:any={platform:'linux',env};
  const config:any={START_TOKEN:'SOL',USE_JITO:true};
  const context=vm.createContext({process:processMock,CONFIG:config});
  vm.runInContext(ts.transpileModule(botSecurityRuntime,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const run=()=>vm.runInContext('initializeLiveRisk()',context);
  assert.throws(run);
  env.ENABLE_LIVE_TRADING='I_UNDERSTAND_THE_RISKS';processMock.platform='win32';assert.throws(run);
  processMock.platform='linux';config.START_TOKEN='USDC';assert.throws(run);
  config.START_TOKEN='SOL';config.JUPITER_API_URL='https://evil.example';assert.throws(run);
});
