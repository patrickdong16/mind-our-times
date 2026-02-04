/**
 * articles-read: 读取文章（公开，无需认证）
 * 
 * ?action=today          → 今日全部文章 + 领域配置
 * ?action=archive&page=1&limit=20&domain=T  → 往期文章（分页、领域筛选）
 * ?action=domains        → 领域配置列表
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();
const _ = db.command;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * 获取今日文章
 */
async function getToday() {
  // 获取最新日期（可能今天还没更新，用最新有数据的日期）
  const { data: latest } = await db.collection('daily_articles')
    .orderBy('date', 'desc')
    .limit(1)
    .get();
  
  if (!latest || latest.length === 0) {
    return { date: null, articles: [], domains: [], total: 0 };
  }
  
  const latestDate = latest[0].date;
  
  // 获取该日期全部文章
  const { data: articles } = await db.collection('daily_articles')
    .where({ date: latestDate })
    .orderBy('domain', 'asc')
    .get();
  
  // 获取领域配置
  const { data: domains } = await db.collection('domains')
    .where({ active: true })
    .orderBy('sort_order', 'asc')
    .get();
  
  return {
    date: latestDate,
    articles,
    domains,
    total: articles.length
  };
}

/**
 * 获取往期文章（分页）
 */
async function getArchive(params) {
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit) || DEFAULT_LIMIT));
  const domain = params.domain || null;
  const skip = (page - 1) * limit;
  
  // 构建查询条件
  const where = {};
  if (domain) {
    where.domain = domain;
  }
  
  // 查询总数
  const { total } = await db.collection('daily_articles')
    .where(where)
    .count();
  
  // 查询数据
  const { data: articles } = await db.collection('daily_articles')
    .where(where)
    .orderBy('date', 'desc')
    .orderBy('domain', 'asc')
    .skip(skip)
    .limit(limit)
    .get();
  
  // 按日期分组
  const grouped = {};
  for (const article of articles) {
    if (!grouped[article.date]) {
      grouped[article.date] = [];
    }
    grouped[article.date].push(article);
  }
  
  return {
    articles,
    grouped,
    total,
    page,
    pages: Math.ceil(total / limit),
    hasMore: skip + articles.length < total
  };
}

/**
 * 获取领域配置
 */
async function getDomains() {
  const { data: domains } = await db.collection('domains')
    .where({ active: true })
    .orderBy('sort_order', 'asc')
    .get();
  
  return { domains };
}

exports.main = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const action = params.action || 'today';
    
    let data;
    switch (action) {
      case 'today':
        data = await getToday();
        break;
      case 'archive':
        data = await getArchive(params);
        break;
      case 'domains':
        data = await getDomains();
        break;
      default:
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ success: false, error: `无效 action: ${action}` })
        };
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': action === 'today' ? 'public, max-age=300' : 'public, max-age=3600'
      },
      body: JSON.stringify({ success: true, data, error: null })
    };
    
  } catch (err) {
    console.error('articles-read error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
