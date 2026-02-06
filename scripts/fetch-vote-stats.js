#!/usr/bin/env node
/**
 * 从 CloudBase 云函数获取投票统计
 * 使用匿名登录 + callFunction
 */

const cloudbase = require('@cloudbase/js-sdk').default;

const ENV_ID = 'mind-our-times-3g7c3va270081e5c';

async function main() {
  // 初始化
  const app = cloudbase.init({ env: ENV_ID });
  
  // 匿名登录
  await app.auth({ persistence: 'local' }).signInAnonymously();
  
  // 调用云函数
  const result = await app.callFunction({
    name: 'vote',
    data: { action: 'stats' }
  });
  
  if (result.result && result.result.success) {
    console.log(JSON.stringify(result.result.data.questions));
  } else {
    console.error(JSON.stringify({ error: result.result?.error || 'Unknown error' }));
    process.exit(1);
  }
}

main().catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
