/**
 * vote: 投票云函数
 * 
 * 调用参数 event:
 *   action: 'submit' | 'result' | 'trend'
 * 
 * submit:
 *   digest_id: string   — 关联的综述 ID
 *   domain: string       — 领域标识 (T/P/H/Φ/R/F)
 *   vote: 'yes' | 'no'  — 投票选项
 *   voter_id: string     — 用户标识（微信 openid 或浏览器指纹）
 * 
 * result:
 *   digest_id: string    — 查询某篇综述的投票结果
 * 
 * trend:
 *   domain: string       — 查询某领域的历史趋势
 *   days: number         — 天数（默认 90）
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;

// === 提交投票 ===
async function submitVote(params) {
  const { digest_id, domain, vote, voter_id } = params;

  // 参数验证
  if (!digest_id) return { success: false, error: '缺少 digest_id' };
  if (!domain) return { success: false, error: '缺少 domain' };
  if (!['yes', 'no'].includes(vote)) return { success: false, error: '无效投票值，需为 yes 或 no' };
  if (!voter_id) return { success: false, error: '缺少 voter_id' };

  // 检查是否已投票（每人每题限一次）
  const { total: existing } = await db.collection('votes')
    .where({ digest_id, voter_id })
    .count();

  if (existing > 0) {
    // 允许更改投票
    await db.collection('votes')
      .where({ digest_id, voter_id })
      .update({
        vote,
        domain,
        updated_at: new Date()
      });
    
    // 返回更新后的结果
    const result = await getResult({ digest_id });
    return { success: true, data: { ...result, changed: true } };
  }

  // 新投票
  await db.collection('votes').add({
    digest_id,
    domain,
    vote,
    voter_id,
    created_at: new Date()
  });

  // 返回最新结果
  const result = await getResult({ digest_id });
  return { success: true, data: { ...result, changed: false } };
}

// === 查询投票结果 ===
async function getResult(params) {
  const { digest_id } = params;
  if (!digest_id) return { yes: 0, no: 0, total: 0 };

  const { total: yesCount } = await db.collection('votes')
    .where({ digest_id, vote: 'yes' })
    .count();

  const { total: noCount } = await db.collection('votes')
    .where({ digest_id, vote: 'no' })
    .count();

  const total = yesCount + noCount;

  return {
    digest_id,
    yes: yesCount,
    no: noCount,
    total,
    yes_pct: total > 0 ? Math.round(yesCount / total * 100) : 0,
    no_pct: total > 0 ? Math.round(noCount / total * 100) : 0
  };
}

// === 查询领域趋势 ===
async function getTrend(params) {
  const { domain } = params;
  if (!domain) return { trend: [] };

  const days = Math.min(365, Math.max(7, parseInt(params.days) || 90));
  const since = new Date();
  since.setDate(since.getDate() - days);

  // 获取该领域的所有投票
  const { data: votes } = await db.collection('votes')
    .where({
      domain,
      created_at: _.gte(since)
    })
    .orderBy('created_at', 'asc')
    .limit(1000)
    .get();

  // 按日期聚合
  const dailyMap = {};
  votes.forEach(v => {
    const dateKey = v.created_at instanceof Date
      ? v.created_at.toISOString().slice(0, 10)
      : new Date(v.created_at).toISOString().slice(0, 10);
    
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { yes: 0, no: 0 };
    if (v.vote === 'yes') dailyMap[dateKey].yes++;
    else dailyMap[dateKey].no++;
  });

  const trend = Object.keys(dailyMap).sort().map(date => {
    const d = dailyMap[date];
    const total = d.yes + d.no;
    return {
      date,
      yes: d.yes,
      no: d.no,
      total,
      yes_pct: total > 0 ? Math.round(d.yes / total * 100) : 0
    };
  });

  return { domain, days, trend, total_votes: votes.length };
}

// === 主入口 ===
exports.main = async (event) => {
  try {
    const action = event.action || 'result';

    switch (action) {
      case 'submit':
        return await submitVote(event);

      case 'result': {
        const data = await getResult(event);
        return { success: true, data };
      }

      case 'trend': {
        const data = await getTrend(event);
        return { success: true, data };
      }

      default:
        return { success: false, error: `无效 action: ${action}` };
    }
  } catch (err) {
    console.error('vote error:', err);
    return { success: false, error: err.message };
  }
};
