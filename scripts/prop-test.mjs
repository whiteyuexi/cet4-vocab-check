import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CH='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT=9400+Math.floor(Math.random()*90);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'prop-'));
const chrome=spawn(CH,['--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+PORT,'--window-size=600,600'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+PORT+'/json/version')).ok)break;}catch{}await sleep(150);}
  const tab=await(await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent('http://127.0.0.1:8787/scripts/pet-render.html'),{method:'PUT'})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'));});
  let id=0;const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(method,params={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method,params}));});
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true})).result?.result?.value;
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8787/scripts/pet-render.html'});
  await sleep(400);
  await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
  await send('Runtime.evaluate',{expression:'document.documentElement.style.background="transparent";document.body.style.background="transparent";'});
  for(let i=0;i<60;i++){if(await ev('window.__ready===true'))break;await sleep(300);}
  await sleep(1600);
  const clip={x:0,y:0,width:232,height:214,scale:2};
  async function shot(n){const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,clip});fs.writeFileSync(n,Buffer.from(r.result.data,'base64'));}
  console.log('道具参数当前值: '+await ev('window.__probeProps()'));
  await shot('shots/_prop_on.png');
  await ev('window.__hideProps(true)');
  await sleep(1200);
  await shot('shots/_prop_off.png');
  console.log('道具参数置 0 后: '+await ev('window.__probeProps()'));
  const a=fs.readFileSync('shots/_prop_on.png'), b=fs.readFileSync('shots/_prop_off.png');
  console.log('两张是否不同: '+(a.equals(b)?'相同（说明置 0 无效）':'不同 ✓'));
  ws.close();chrome.kill();try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  process.exit(0);
}catch(e){console.error('ERR '+e.message);try{ws&&ws.close();}catch{};try{chrome.kill();}catch{};process.exit(1);}
