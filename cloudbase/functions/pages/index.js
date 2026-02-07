/**
 * pages - 服务端渲染投票页面
 * 直接在云函数中获取数据并渲染，避免客户端 SDK 认证问题
 */

const tcb = require('@cloudbase/node-sdk');

const app = tcb.init({ env: process.env.TCB_ENV || 'mind-our-times-3g7c3va270081e5c' });
const db = app.database();

// 问题配置（硬编码，与 vote 函数同步）
const QUESTIONS = {
  '2026-02-07-tech-vs-ideology': {
    question: '当技术能救命，但来自敌人，你会接受吗？',
    option_a: '接受 — 生命至上，技术无国界',
    option_b: '拒绝 — 宁死不屈，立场高于一切'
  },
  '2026-02-06-ai-fear': {
    question: 'AI时代，你更担心哪个？',
    option_a: 'AI直接干掉你 — 工作被算法自动完成',
    option_b: '隔壁工位干掉你 — 同事用AI效率碾压你'
  }
};

exports.main = async (event, context) => {
  const queryParams = event.queryStringParameters || {};
  const questionId = queryParams.id || event.id || '2026-02-07-tech-vs-ideology';
  const action = queryParams.action || event.action;
  const vote = queryParams.vote || event.vote;
  const voterId = queryParams.voter_id || event.voter_id;
  
  // 处理投票提交（AJAX 请求）
  if (action === 'submit' && vote && voterId) {
    return await handleVote(questionId, vote, voterId);
  }
  
  // 处理获取结果（AJAX 请求）
  if (action === 'result') {
    return await handleResult(questionId);
  }
  
  // 渲染页面
  const config = QUESTIONS[questionId] || QUESTIONS['2026-02-07-tech-vs-ideology'];
  const html = renderVotePage(questionId, config);
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    },
    body: html
  };
};

async function handleVote(questionId, vote, voterId) {
  try {
    const votesRef = db.collection('votes');
    
    // 检查是否已投票
    const existing = await votesRef
      .where({ question_id: questionId, voter_id: voterId })
      .get();
    
    let alreadyVoted = existing.data && existing.data.length > 0;
    
    if (!alreadyVoted) {
      await votesRef.add({
        question_id: questionId,
        voter_id: voterId,
        vote: vote,
        created_at: new Date()
      });
    }
    
    // 统计结果
    const allVotes = await votesRef.where({ question_id: questionId }).get();
    const votes = allVotes.data || [];
    const countA = votes.filter(v => v.vote === 'a').length;
    const countB = votes.filter(v => v.vote === 'b').length;
    const total = countA + countB;
    
    const config = QUESTIONS[questionId] || {};
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          already_voted: alreadyVoted,
          count_a: countA,
          count_b: countB,
          total: total,
          percent_a: total > 0 ? Math.round(countA / total * 100) : 50,
          percent_b: total > 0 ? Math.round(countB / total * 100) : 50,
          question: config.question,
          option_a: config.option_a,
          option_b: config.option_b
        }
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
}

async function handleResult(questionId) {
  try {
    const allVotes = await db.collection('votes').where({ question_id: questionId }).get();
    const votes = allVotes.data || [];
    const countA = votes.filter(v => v.vote === 'a').length;
    const countB = votes.filter(v => v.vote === 'b').length;
    const total = countA + countB;
    
    const config = QUESTIONS[questionId] || {};
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          count_a: countA,
          count_b: countB,
          total: total,
          percent_a: total > 0 ? Math.round(countA / total * 100) : 50,
          percent_b: total > 0 ? Math.round(countB / total * 100) : 50,
          question: config.question,
          option_a: config.option_a,
          option_b: config.option_b
        }
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: e.message })
    };
  }
}

function renderVotePage(questionId, config) {
  const apiBase = '/vote';  // HTTP 服务路径
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
  <title>今日之问 — Mind Our Times</title>
  <style>
    :root {
      --bg: #fafafa; --card-bg: #fff; --text: #1a1a1a;
      --text-secondary: #555; --text-muted: #999; --border: #e5e5e5;
      --accent: #1a1a1a; --option-hover: #f5f5f5;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', serif;
      min-height: 100vh; background: var(--bg); color: var(--text);
      display: flex; flex-direction: column; align-items: center;
      padding: 40px 20px; line-height: 1.6;
    }
    .container { width: 100%; max-width: 480px; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    .brand { font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
    .title { font-size: 1rem; font-weight: 400; color: var(--text-secondary); font-style: italic; }
    .question { font-size: 1.5rem; font-weight: 600; line-height: 1.4; text-align: center; margin-bottom: 40px; }
    .voted-status { text-align: center; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px; display: none; }
    .voted-status.show { display: block; }
    .options { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
    .option {
      width: 100%; padding: 20px 24px; background: var(--card-bg);
      border: 1px solid var(--border); border-radius: 4px;
      font-size: 0.95rem; line-height: 1.6; color: var(--text);
      text-align: left; cursor: pointer; transition: all 0.2s; font-family: inherit;
    }
    .option:hover:not(:disabled) { background: var(--option-hover); border-color: var(--text-muted); }
    .option:disabled { cursor: default; }
    .option.selected { background: var(--accent); color: white; border-color: var(--accent); }
    .option-label { font-size: 0.8rem; font-weight: 600; margin-right: 10px; opacity: 0.6; }
    .result { display: none; padding-top: 24px; border-top: 1px solid var(--border); }
    .result.show { display: block; }
    .result-item { margin-bottom: 20px; }
    .result-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .result-label { font-size: 0.85rem; color: var(--text-secondary); }
    .result-pct { font-size: 1.1rem; font-weight: 600; }
    .result-bar { width: 100%; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .result-bar-fill { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
    .bar-a { background: #333; }
    .bar-b { background: #888; }
    .result-total { text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 24px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
    .footer a { font-size: 0.85rem; color: var(--text-secondary); text-decoration: none; }
    .toast {
      position: fixed; top: 20px; left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: var(--text); color: white; padding: 12px 24px;
      border-radius: 4px; font-size: 0.9rem; z-index: 1000;
      transition: transform 0.3s ease;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Mind Our Times</div>
      <div class="title">今日之问</div>
    </div>
    <div class="question">${config.question}</div>
    <div class="voted-status" id="votedStatus">你已投过票</div>
    <div class="options">
      <button class="option" id="btnA"><span class="option-label">A</span>${config.option_a}</button>
      <button class="option" id="btnB"><span class="option-label">B</span>${config.option_b}</button>
    </div>
    <div class="result" id="result">
      <div class="result-item">
        <div class="result-header">
          <span class="result-label">${config.option_a.split(' — ')[0]}</span>
          <span class="result-pct" id="pctA">0%</span>
        </div>
        <div class="result-bar"><div class="result-bar-fill bar-a" id="barA" style="width:0%"></div></div>
      </div>
      <div class="result-item">
        <div class="result-header">
          <span class="result-label">${config.option_b.split(' — ')[0]}</span>
          <span class="result-pct" id="pctB">0%</span>
        </div>
        <div class="result-bar"><div class="result-bar-fill bar-b" id="barB" style="width:0%"></div></div>
      </div>
      <div class="result-total" id="resultTotal">0 人参与</div>
    </div>
    <div class="footer">
      <a href="https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/">阅读今日分析 →</a>
    </div>
  </div>
  <div class="toast" id="toast">✓ 投票成功</div>
  <script>
    const questionId = '${questionId}';
    const apiBase = '${apiBase}';
    
    function getVoterId() {
      let id = localStorage.getItem('mot_voter_id');
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
        localStorage.setItem('mot_voter_id', id);
      }
      return id;
    }
    
    function showResult(data) {
      document.getElementById('pctA').textContent = data.percent_a + '%';
      document.getElementById('pctB').textContent = data.percent_b + '%';
      document.getElementById('resultTotal').textContent = data.total + ' 人参与';
      document.getElementById('result').classList.add('show');
      setTimeout(() => {
        document.getElementById('barA').style.width = data.percent_a + '%';
        document.getElementById('barB').style.width = data.percent_b + '%';
      }, 50);
    }
    
    function showToast() {
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }
    
    async function vote(choice) {
      const btnA = document.getElementById('btnA');
      const btnB = document.getElementById('btnB');
      btnA.disabled = true;
      btnB.disabled = true;
      
      try {
        const res = await fetch(apiBase + '?action=submit&id=' + questionId + '&vote=' + choice + '&voter_id=' + getVoterId());
        const result = await res.json();
        
        if (result.success) {
          (choice === 'a' ? btnA : btnB).classList.add('selected');
          showResult(result.data);
          localStorage.setItem('mot_voted_' + questionId, choice);
          if (!result.data.already_voted) showToast();
        }
      } catch (e) {
        alert('网络错误');
        btnA.disabled = false;
        btnB.disabled = false;
      }
    }
    
    document.getElementById('btnA').addEventListener('click', () => vote('a'));
    document.getElementById('btnB').addEventListener('click', () => vote('b'));
    
    // 检查是否已投票
    const prev = localStorage.getItem('mot_voted_' + questionId);
    if (prev) {
      document.getElementById('btn' + prev.toUpperCase()).classList.add('selected');
      document.getElementById('votedStatus').classList.add('show');
      document.getElementById('btnA').disabled = true;
      document.getElementById('btnB').disabled = true;
      fetch(apiBase + '?action=result&id=' + questionId)
        .then(r => r.json())
        .then(result => { if (result.success) showResult(result.data); });
    }
  </script>
</body>
</html>`;
}
