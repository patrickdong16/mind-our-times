/**
 * 从 CloudBase 拉取投票数据
 * 通过 HTTP 调用云函数获取
 */

const https = require('https');

const ENV_ID = 'mind-our-times-3g7c3va270081e5c';
const FUNCTION_URL = `https://${ENV_ID}.service.tcloudbase.com/vote`;

// 已知的问题列表（也可以从数据库获取）
const KNOWN_QUESTIONS = [
  '2026-02-06-ai-fear',
  // 后续问题会自动添加
];

async function callFunction(action, params = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ action, ...params });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    };
    
    const req = https.request(FUNCTION_URL, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(data);
    req.end();
  });
}

async function main() {
  const results = [];
  
  for (const qid of KNOWN_QUESTIONS) {
    try {
      const res = await callFunction('result', { question_id: qid });
      if (res.success && res.data) {
        results.push({
          question_id: res.data.question_id,
          question: res.data.question,
          option_a: res.data.option_a,
          option_b: res.data.option_b,
          total: res.data.total,
          count_a: res.data.count_a,
          count_b: res.data.count_b,
          publish_date: qid.substring(0, 10) // 从 ID 提取日期
        });
      }
    } catch (e) {
      console.error(`Error fetching ${qid}:`, e.message);
    }
  }
  
  console.log(JSON.stringify(results));
}

main().catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
