/**
 * articles-read: 普通云函数，读取文章（公开）
 * 
 * 调用参数 event:
 *   action: 'today' | 'archive' | 'domains'
 *   page: 分页页码（archive 用）
 *   limit: 每页条数（archive 用）
 *   domain: 领域筛选（archive 用）
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});
const db = app.database();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

async function getToday() {
  const { data: latest } = await db.collection('daily_articles')
    .orderBy('date', 'desc')
    .limit(1)
    .get();

  if (!latest || latest.length === 0) {
    return { date: null, articles: [], domains: [], total: 0 };
  }

  const latestDate = latest[0].date;

  const { data: articles } = await db.collection('daily_articles')
    .where({ date: latestDate })
    .orderBy('domain', 'asc')
    .get();

  const { data: domains } = await db.collection('domains')
    .where({ active: true })
    .orderBy('sort_order', 'asc')
    .get();

  return { date: latestDate, articles, domains, total: articles.length };
}

async function getArchive(params) {
  const page = Math.max(1, parseInt(params.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit) || DEFAULT_LIMIT));
  const domain = params.domain || null;
  const skip = (page - 1) * limit;

  const where = {};
  if (domain) where.domain = domain;

  const { total } = await db.collection('daily_articles').where(where).count();

  const { data: articles } = await db.collection('daily_articles')
    .where(where)
    .orderBy('date', 'desc')
    .orderBy('domain', 'asc')
    .skip(skip)
    .limit(limit)
    .get();

  return {
    articles, total, page,
    pages: Math.ceil(total / limit),
    hasMore: skip + articles.length < total
  };
}

async function getDomains() {
  const { data: domains } = await db.collection('domains')
    .where({ active: true })
    .orderBy('sort_order', 'asc')
    .get();
  return { domains };
}

exports.main = async (event) => {
  try {
    const action = event.action || 'today';
    let data;

    switch (action) {
      case 'today':
        data = await getToday();
        break;
      case 'archive':
        data = await getArchive(event);
        break;
      case 'domains':
        data = await getDomains();
        break;
      default:
        return { success: false, error: `无效 action: ${action}` };
    }

    return { success: true, data, error: null };
  } catch (err) {
    console.error('articles-read error:', err);
    return { success: false, error: err.message };
  }
};
