/* 演示额度的单元测试：不起 HTTP 服务，直接验规则。
   用法：node scripts/quota-test.mjs
*/
import { createQuota } from '../server/quota.mjs';

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; console.log('PASS  ' + name + (note ? '  [' + note + ']' : '')); }
  else { fail++; console.log('FAIL  ' + name + (note ? '  [' + note + ']' : '')); }
}

// 固定的"今天"，便于测跨天
let fakeDay = new Date(2026, 10, 16, 10, 0, 0);
const q = createQuota({ perIp: 2, total: 5, now: () => fakeDay });

ok('第一次请求放行', q.check('1.1.1.1').ok);
q.consume('1.1.1.1');

ok('第二次请求放行', q.check('1.1.1.1').ok);
q.consume('1.1.1.1');

const third = q.check('1.1.1.1');
ok('第三次被单设备上限拦住', !third.ok && third.reason === 'ip', third.message);

ok('换一台设备仍可放行', q.check('2.2.2.2').ok);
q.consume('2.2.2.2');
q.consume('2.2.2.2');
q.consume('2.2.2.2');

const sixth = q.check('3.3.3.3');
ok('全站 5 次用完后，新设备也被拦', !sixth.ok && sixth.reason === 'global', sixth.message);

ok('被拒绝不消耗额度', q.stats().usedToday === 5, 'usedToday=' + q.stats().usedToday);

fakeDay = new Date(2026, 10, 17, 0, 1, 0);
const nextDay = q.check('1.1.1.1');
ok('跨天自动清零', nextDay.ok && q.stats().usedToday === 0, 'day=' + q.stats().day);

ok('stats 报告上限', q.stats().perIp === 2 && q.stats().total === 5);

console.log('\n通过 ' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
