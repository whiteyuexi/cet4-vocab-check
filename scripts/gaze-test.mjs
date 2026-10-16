// 验证视线跟踪：鼠标移到左边 / 右边，各截一张桌宠特写做对比
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9600 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gaze-'));
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
  const send=(method,params={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method,params}));});
  const ev=async x=>(await send('Runtime.evaluate',{expression:x,returnByValue:true})).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8787/'});
  for(let i=0;i<60;i++){ if(await ev("document.documentElement.dataset.pet==='live2d'")) break; await sleep(300); }
  await sleep(1500);

  const rect = JSON.parse(await ev("JSON.stringify((function(){var r=document.getElementById('petFig').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})())"));
  const clip = { x: Math.max(0, rect.x - 10), y: Math.max(0, rect.y - 14), width: rect.w + 20, height: rect.h + 20, scale: 2 };
  console.log('桌宠区域 ' + Math.round(rect.x) + ',' + Math.round(rect.y) + '  ' + Math.round(rect.w) + 'x' + Math.round(rect.h));

  async function shotAt(mx, my, name) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none', buttons: 0, pointerType: 'mouse' });
    await sleep(1300);
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip });
    fs.writeFileSync(name, Buffer.from(r.result.data, 'base64'));
    console.log('  ' + name + '  (鼠标 ' + mx + ',' + my + ')');
  }
  await shotAt(40, 300, 'shots/_gaze_left.png');
  await shotAt(1460, 300, 'shots/_gaze_right.png');
  await shotAt(rect.x + rect.w / 2, rect.y + rect.h, 'shots/_gaze_center.png');

  const a = fs.readFileSync('shots/_gaze_left.png'), b = fs.readFileSync('shots/_gaze_right.png');
  console.log('左右两张是否不同: ' + (a.equals(b) ? '相同（说明没跟踪）' : '不同 ✓'));
  ws.close(); chrome.kill(); try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  process.exit(0);
} catch(e){ console.error('ERR '+e.message); try{ws&&ws.close();}catch{}; try{chrome.kill();}catch{}; process.exit(1); }
