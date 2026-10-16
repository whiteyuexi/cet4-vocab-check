// 验证立体感三件套：透视倾斜 / 接触投影 / 气泡视差
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9500 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-'));
const chrome = spawn(CH, ['--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--hide-scrollbars','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+PORT,'--window-size=1500,950'],{stdio:'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
try {
  for (let i=0;i<80;i++){ try{ if((await fetch('http://127.0.0.1:'+PORT+'/json/version')).ok) break; }catch{} await sleep(150); }
  const tab = await (await fetch('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent('http://127.0.0.1:8787/'),{method:'PUT'})).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('ws'));});
  let id=0; const pend=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(m,p={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method:m,params:p}));});
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true})).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8787/'});
  for(let i=0;i<60;i++){ if(await ev("document.documentElement.dataset.pet==='live2d'")) break; await sleep(300); }
  await sleep(1500);

  const R = JSON.parse(await ev("JSON.stringify((function(){var r=document.getElementById('pet').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})())"));
  const clip = { x: Math.max(0,R.x-16), y: Math.max(0,R.y-10), width: R.w+32, height: R.h+30, scale: 2 };
  const fire=(type,x,y,buttons)=>send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons,pointerType:'mouse'});

  async function shot(name){ const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,clip}); fs.writeFileSync(name,Buffer.from(r.result.data,'base64')); console.log('  '+name); }

  await fire('mouseMoved',30,400,0); await sleep(900); await shot('shots/_d_left.png');
  await fire('mouseMoved',1470,400,0); await sleep(900); await shot('shots/_d_right.png');

  // 拖到半空松手前，看影子有没有留在地面
  const fx=R.x+R.w/2, fy=R.y+R.h*0.72;
  await fire('mousePressed',fx,fy,1);
  for(let i=1;i<=8;i++) await fire('mouseMoved',fx-i*6,fy-i*24,1);
  await sleep(400); await shot('shots/_d_lift.png');

  const t = await ev("JSON.stringify({tx:getComputedStyle(document.getElementById('petFig')).getPropertyValue('--tx'),ty:getComputedStyle(document.getElementById('petFig')).getPropertyValue('--ty'),shBottom:document.getElementById('petShadow').style.bottom,shScale:document.getElementById('petShadow').style.getPropertyValue('--shs'),bx:getComputedStyle(document.getElementById('petSay')).getPropertyValue('--bx')})");
  console.log('样式变量: ' + t);
  ws.close(); chrome.kill(); try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  process.exit(0);
} catch(e){ console.error('ERR '+e.message); try{ws&&ws.close();}catch{}; try{chrome.kill();}catch{}; process.exit(1); }
