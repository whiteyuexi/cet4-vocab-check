/* 演示额度：公开链接必须有刹车，否则一个被转发的 URL 就能把 Key 刷爆。
 *
 * 独立成模块，是为了能单独跑测试（不用起 HTTP 服务）：
 *   node scripts/quota-test.mjs
 *
 * 规则：
 *   · 每台设备每天 N 次
 *   · 全站每天 M 次（更硬的上限，防"换 IP 刷"）
 *   · 跨天自动清零
 */
export function createQuota({ perIp = 25, total = 400, now = () => new Date() } = {}) {
  let day = '';
  let usedTotal = 0;
  const byIp = new Map();

  function key(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function roll() {
    const k = key(now());
    if (k !== day) {
      day = k;
      usedTotal = 0;
      byIp.clear();
    }
  }

  /* 先问再记：check() 不改变计数，consume() 才加。
     这样"被拒绝的请求"不会反过来消耗额度。 */
  function check(ip) {
    roll();
    const used = byIp.get(ip) || 0;
    if (used >= perIp) {
      return { ok: false, reason: 'ip', message: '这台设备今天已经用完 ' + perIp + ' 次演示额度' };
    }
    if (usedTotal >= total) {
      return { ok: false, reason: 'global', message: '今天全站演示额度（' + total + ' 次）已经用完了' };
    }
    return { ok: true };
  }

  function consume(ip) {
    roll();
    byIp.set(ip, (byIp.get(ip) || 0) + 1);
    usedTotal++;
  }

  function stats() {
    roll();
    return { perIp, total, usedToday: usedTotal, day };
  }

  return { check, consume, stats, limits: { perIp, total } };
}
