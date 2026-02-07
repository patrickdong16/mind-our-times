/**
 * vote: 投票云函数 v2
 * 
 * 支持的 actions:
 *   - submit: 提交投票（检查是否已投）
 *   - result: 查询投票结果
 *   - check: 检查用户是否已投票
 *   - create: 创建/更新投票问题
 *   - trend: 查询领域趋势
 *   - stats: 获取所有问题的统计数据（供 Pepper 日报使用）
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();
const _ = db.command;

// 硬编码的问题库（也可以从数据库加载）
const QUESTIONS = {
  '2026-02-06-ai-fear': {
    question_id: '2026-02-06-ai-fear',
    question: 'AI时代，你更担心哪个？',
    option_a: 'AI直接干掉你 — 有一天发现自己的工作被算法自动完成了，公司根本不需要这个岗位了',
    option_b: '隔壁工位干掉你 — 有一天发现同事用AI干活又快又好，老板觉得一个人能顶三个，你成了多余的那个'
  },
  '2026-02-07-tech-vs-ideology': {
    question_id: '2026-02-07-tech-vs-ideology',
    question: '当技术能救命，但来自敌人，你会接受吗？',
    option_a: '接受 — 生存比面子重要，技术无国界，能救人就该用',
    option_b: '拒绝 — 依赖敌人的技术就是投降，宁可自己慢慢解决',
    context: '伊朗正面临严重水危机，而最有效的解决方案恰恰掌握在宿敌以色列手中。'
  }
};

// === 获取问题配置 ===
async function getQuestion(questionId) {
  // 先查硬编码
  if (QUESTIONS[questionId]) {
    return QUESTIONS[questionId];
  }
  
  // 再查数据库（集合可能不存在）
  try {
    const { data } = await db.collection('vote_questions')
      .where({ _id: questionId })
      .get();
    
    if (data.length > 0) {
      return {
        question_id: data[0]._id,
        question: data[0].question,
        option_a: data[0].option_a || data[0].yes_label,
        option_b: data[0].option_b || data[0].no_label,
        context: data[0].context || ''
      };
    }
  } catch (e) {
    // 集合不存在时返回 null
  }
  
  return null;
}

// === 提交投票 ===
async function submitVote(params) {
  const { question_id, vote, voter_id } = params;
  
  if (!question_id) return { success: false, error: '缺少 question_id' };
  if (!vote || !['a', 'b'].includes(vote)) return { success: false, error: '无效投票值，必须是 a 或 b' };
  if (!voter_id) return { success: false, error: '缺少 voter_id' };
  
  // 获取问题配置
  const questionConfig = await getQuestion(question_id);
  if (!questionConfig) {
    return { success: false, error: '投票问题不存在' };
  }
  
  // 检查是否已投票
  const { data: existingVotes } = await db.collection('votes')
    .where({ question_id, voter_id })
    .get();
  
  if (existingVotes.length > 0) {
    // 已投票，返回结果
    const result = await getResult({ question_id });
    return { 
      success: true, 
      data: {
        already_voted: true,
        previous_vote: existingVotes[0].vote,
        ...result.data
      }
    };
  }
  
  // 记录投票
  await db.collection('votes').add({
    question_id,
    question: questionConfig.question,
    option_a: questionConfig.option_a,
    option_b: questionConfig.option_b,
    vote,
    voter_id,
    created_at: new Date()
  });
  
  // 返回最新结果
  const result = await getResult({ question_id });
  return {
    success: true,
    data: {
      voted: true,
      your_vote: vote,
      ...result.data
    }
  };
}

// === 查询投票结果 ===
async function getResult(params) {
  const { question_id } = params;
  
  if (!question_id) return { success: false, error: '缺少 question_id' };
  
  // 获取问题配置
  const questionConfig = await getQuestion(question_id);
  
  // 统计投票
  const { data: allVotes } = await db.collection('votes')
    .where({ question_id })
    .get();
  
  const count_a = allVotes.filter(v => v.vote === 'a').length;
  const count_b = allVotes.filter(v => v.vote === 'b').length;
  const total = count_a + count_b;
  
  return {
    success: true,
    data: {
      question_id,
      question: questionConfig?.question || '',
      option_a: questionConfig?.option_a || '选项A',
      option_b: questionConfig?.option_b || '选项B',
      total,
      count_a,
      count_b,
      percent_a: total > 0 ? Math.round(count_a / total * 100) : 0,
      percent_b: total > 0 ? Math.round(count_b / total * 100) : 0
    }
  };
}

// === 检查用户投票状态 ===
async function checkVote(params) {
  const { question_id, voter_id } = params;
  
  if (!question_id) return { success: false, error: '缺少 question_id' };
  if (!voter_id) return { success: false, error: '缺少 voter_id' };
  
  const { data } = await db.collection('votes')
    .where({ question_id, voter_id })
    .get();
  
  if (data.length > 0) {
    return {
      success: true,
      data: {
        voted: true,
        vote: data[0].vote
      }
    };
  }
  
  return {
    success: true,
    data: {
      voted: false
    }
  };
}

// === 创建/更新投票问题 ===
async function createVote(params) {
  const { question_id, question, option_a, option_b, context, domain, source, article_id, date } = params;
  
  if (!question_id) return { success: false, error: '缺少 question_id' };
  if (!question) return { success: false, error: '缺少 question' };
  
  const docData = {
    question,
    option_a: option_a || '选项A',
    option_b: option_b || '选项B',
    context: context || '',
    domain: domain || '',
    source: source || '',
    article_id: article_id || '',
    date: date || new Date().toISOString().slice(0, 10),
    updated_at: new Date()
  };
  
  try {
    // 先尝试更新（如果存在）
    const updateResult = await db.collection('vote_questions').doc(question_id).update(docData);
    if (updateResult.updated > 0) {
      return { success: true, data: { question_id, updated: true } };
    }
  } catch (e) {
    // 文档不存在或集合不存在，尝试创建
  }
  
  // 创建新文档
  try {
    await db.collection('vote_questions').add({
      _id: question_id,
      ...docData,
      created_at: new Date()
    });
    return { success: true, data: { question_id, created: true } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// === 获取所有问题统计（供日报使用） ===
async function getAllStats() {
  // 获取所有问题配置（集合可能不存在）
  let questions = [];
  try {
    const result = await db.collection('vote_questions').get();
    questions = result.data || [];
  } catch (e) {
    // 集合不存在时返回空
    questions = [];
  }
  
  // 合并硬编码的问题
  const allQuestions = [...questions];
  for (const [qid, q] of Object.entries(QUESTIONS)) {
    if (!allQuestions.find(x => x._id === qid)) {
      allQuestions.push({ _id: qid, ...q });
    }
  }
  
  // 获取所有投票记录
  const { data: allVotes } = await db.collection('votes').limit(1000).get();
  
  // 按问题分组统计
  const stats = [];
  for (const q of allQuestions) {
    const qid = q._id || q.question_id;
    const votes = allVotes.filter(v => v.question_id === qid);
    const count_a = votes.filter(v => v.vote === 'a').length;
    const count_b = votes.filter(v => v.vote === 'b').length;
    const total = count_a + count_b;
    
    // 计算发布日期（从 ID 提取或使用 created_at）
    let publish_date = qid.substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}/.test(publish_date)) {
      publish_date = q.created_at ? new Date(q.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    }
    
    stats.push({
      question_id: qid,
      question: q.question,
      option_a: q.option_a || '选项A',
      option_b: q.option_b || '选项B',
      domain: q.domain || '',
      publish_date,
      total,
      count_a,
      count_b,
      percent_a: total > 0 ? Math.round(count_a / total * 100) : 0,
      percent_b: total > 0 ? Math.round(count_b / total * 100) : 0
    });
  }
  
  return {
    success: true,
    data: {
      questions: stats,
      total_questions: stats.length,
      total_votes: allVotes.length,
      generated_at: new Date().toISOString()
    }
  };
}

// === 查询领域趋势（保留兼容） ===
async function getTrend(params) {
  const { domain } = params;
  if (!domain) return { success: false, error: '缺少 domain' };

  const days = Math.min(365, Math.max(7, parseInt(params.days) || 90));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: votes } = await db.collection('votes')
    .where({
      domain,
      created_at: _.gte(since)
    })
    .orderBy('created_at', 'asc')
    .limit(1000)
    .get();

  const dailyMap = {};
  votes.forEach(v => {
    const dateKey = v.created_at instanceof Date
      ? v.created_at.toISOString().slice(0, 10)
      : new Date(v.created_at).toISOString().slice(0, 10);
    
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { a: 0, b: 0 };
    if (v.vote === 'a') dailyMap[dateKey].a++;
    else dailyMap[dateKey].b++;
  });

  const trend = Object.keys(dailyMap).sort().map(date => {
    const d = dailyMap[date];
    const total = d.a + d.b;
    return {
      date,
      count_a: d.a,
      count_b: d.b,
      total,
      percent_a: total > 0 ? Math.round(d.a / total * 100) : 0
    };
  });

  return { success: true, data: { domain, days, trend, total_votes: votes.length } };
}

// === 主入口 ===
exports.main = async (event) => {
  try {
    const action = event.action || 'result';

    switch (action) {
      case 'submit':
        return await submitVote(event);

      case 'result':
        return await getResult(event);

      case 'check':
        return await checkVote(event);

      case 'create':
        return await createVote(event);

      case 'trend':
        return await getTrend(event);

      case 'stats':
        return await getAllStats();

      default:
        return { success: false, error: `无效 action: ${action}` };
    }
  } catch (err) {
    console.error('vote error:', err);
    return { success: false, error: err.message };
  }
};
