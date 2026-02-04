/**
 * 初始化 CloudBase 数据库集合
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: 'mind-our-times-3g7c3va270081e5c'
});

const db = app.database();

async function init() {
  console.log('开始初始化数据库...');
  
  // 创建 daily_articles 集合
  try {
    await db.createCollection('daily_articles');
    console.log('✓ daily_articles 集合创建成功');
  } catch (e) {
    console.log('daily_articles:', e.message);
  }
  
  // 创建 domains 集合
  try {
    await db.createCollection('domains');
    console.log('✓ domains 集合创建成功');
  } catch (e) {
    console.log('domains:', e.message);
  }
  
  console.log('\n验证集合列表：');
  const collections = await db.listCollections();
  console.log(collections.map(c => c.CollectionName));
}

init().then(() => {
  console.log('\n初始化完成！');
  process.exit(0);
}).catch(err => {
  console.error('初始化失败：', err);
  process.exit(1);
});
