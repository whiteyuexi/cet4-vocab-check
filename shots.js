// shots.js — 生成各页面截图用的临时页面
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dir = path.join(ROOT, 'shots');
fs.mkdirSync(dir, { recursive: true });

// 造一份"看起来像真实使用过"的数据：掌握率随词频段递减
const SEED = [
  'var A=window.__APP__,S=A.S;S.settings.autoNext=false;',
  'var p=[0.55,0.94,0.88,0.76,0.63,0.44,0.28];',
  'A.WORDS.forEach(function(w){var k=w.w.toLowerCase();if(S.status[k]!==undefined)return;var q=p[w.f||0],r=Math.random();',
  'if(r<q)S.status[k]=2;else if(r<q+0.1)S.status[k]=1;else if(r<q+0.18)S.status[k]=0;});',
  'S.samples=[{ts:Date.now()-3600000,n:214,k:132,f:41,u:41,pre:9,bank:"c4",mode:"self",bands:null}];',
  'S.history=[{ts:Date.now()-86400000,kind:"probe",label:"摸底检测 · 目标 ±250 词",bank:"c4",total:214,k:132,f:41,u:41},',
  '{ts:Date.now()-3600000,kind:"group",label:"第 1 组 · 第 1-100 词",bank:"c4",total:100,k:70,f:17,u:13}];',
  'A.save();'
].join('');

const screens = {
  'home_empty': 'A.go("home");',
  'home': SEED + 'A.go("home");',
  'home_c6': SEED + 'S.settings.bank="c6";A.save();A.go("home");',
  'groups': SEED + 'A.go("groups");',
  'test_probe': SEED + 'A.startSession("probe",{target:250});for(var i=0;i<46;i++){A.judge(i%3===0?1:2);A.nextQ();}',
  'test_self': SEED + 'A.startSession("group",{group:2});',
  'test_reveal': SEED + 'A.startSession("group",{group:2});A.judge(1);',
  'test_choice': SEED + 'S.settings.mode="choice";A.startSession("group",{group:14});',
  'result': SEED + 'A.startSession("probe",{target:250});for(var i=0;i<46;i++){if(!A.S.session)break;A.judge(i%5===0?0:(i%3===0?1:2));A.nextQ();}if(A.S.session)A.finishSession();',
  'stats': SEED + 'A.go("stats");',
  'settings': SEED + 'A.go("settings");',
  'home_dark': SEED + 'S.theme="dark";A.setTheme("dark");A.go("home");',
  'test_dark': SEED + 'S.theme="dark";A.setTheme("dark");A.startSession("group",{group:5});'
};

const out = [];
for (const name of Object.keys(screens)) {
  const inject = '<script>document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){try{' +
    screens[name] + '}catch(e){document.title="ERR "+e.message;}},40);});<\/script>';
  const f = path.join(dir, name + '.html');
  fs.writeFileSync(f, html.replace('</body>', inject + '\n</body>'));
  out.push(name);
}
console.log('生成截图页面:', out.join(', '));