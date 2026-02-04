/**
 * Mind Our Times — 前端逻辑
 * CloudBase JS SDK 2.x + Vite
 */

import cloudbase from '@cloudbase/js-sdk'

// === 配置 ===
const CONFIG = {
  envId: 'mind-our-times-3g7c3va270081e5c',
  siteName: 'Mind Our Times',
  siteDesc: '追踪时代思想脉搏',
  cacheToday: 5 * 60 * 1000,
  cacheArchive: 60 * 60 * 1000,
  cacheDomains: 24 * 60 * 60 * 1000
}

// === CloudBase 初始化 ===
const tcbApp = cloudbase.init({
  env: CONFIG.envId
});

// === 状态 ===
const state = {
  currentTab: 'today',
  activeDomains: new Set(),
  domains: [],
  todayData: null,
  archiveData: null,
  archivePage: 1,
  archiveHasMore: false,
  authed: false
};

// === CloudBase 认证 + 云函数调用 ===
async function ensureAuth() {
  if (state.authed) return;
  try {
    const auth = tcbApp.auth({ persistence: 'local' });
    await auth.signInAnonymously();  // SDK 2.x API
    state.authed = true;
  } catch (e) {
    console.error('Auth failed:', e);
    throw new Error('认证失败');
  }
}

async function callFunction(name, data) {
  await ensureAuth();
  
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await tcbApp.callFunction({ name, data });
      const result = res.result;
      if (!result.success) throw new Error(result.error || '未知错误');
      return result.data;
    } catch (e) {
      lastError = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

// === 缓存 ===
const cache = {};
function getCached(key) {
  const item = cache[key];
  if (!item) return null;
  if (Date.now() - item.time > item.ttl) { delete cache[key]; return null; }
  return item.data;
}
function setCache(key, data, ttl) {
  cache[key] = { data, time: Date.now(), ttl };
}

// === 领域配置 ===
const DOMAIN_ICONS = {
  'T': '🔧', 'P': '🏛️', 'H': '📜',
  'Phi': '💭', 'R': '⛪', 'F': '💰'
};

function renderDomainFilters(domains) {
  const container = document.getElementById('domainFilters');
  let html = '<span class="domain-tag active" data-domain="all" onclick="toggleDomain(\'all\')">全部</span>';
  for (const d of domains) {
    const icon = DOMAIN_ICONS[d._id] || '';
    html += '<span class="domain-tag" data-domain="' + d._id + '" onclick="toggleDomain(\'' + d._id + '\')">' + icon + ' ' + d.name + '</span>';
  }
  container.innerHTML = html;
}

function toggleDomain(domain) {
  if (domain === 'all') {
    state.activeDomains.clear();
  } else {
    if (state.activeDomains.has(domain)) {
      state.activeDomains.delete(domain);
    } else {
      state.activeDomains.add(domain);
    }
  }
  document.querySelectorAll('.domain-tag').forEach(function(tag) {
    var d = tag.dataset.domain;
    if (d === 'all') {
      tag.classList.toggle('active', state.activeDomains.size === 0);
    } else {
      tag.classList.toggle('active', state.activeDomains.has(d));
    }
  });
  if (state.currentTab === 'today') renderToday();
  else renderArchive();
}

function filterArticles(articles) {
  if (state.activeDomains.size === 0) return articles;
  return articles.filter(function(a) { return state.activeDomains.has(a.domain); });
}

// === 渲染 ===
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  var y = parts[0], m = parseInt(parts[1]), d = parseInt(parts[2]);
  var date = new Date(parseInt(y), m - 1, d);
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return y + '年' + m + '月' + d + '日 · 星期' + weekdays[date.getDay()];
}

function renderArticleCard(article) {
  var domainObj = state.domains.find(function(d) { return d._id === article.domain; });
  var domainName = domainObj ? domainObj.name : article.domain;
  var icon = DOMAIN_ICONS[article.domain] || '';
  
  return '<article class="article-card" data-domain="' + article.domain + '">' +
    '<div class="article-domain">' + icon + ' ' + domainName + '</div>' +
    '<h2 class="article-title">' + escapeHtml(article.title) + '</h2>' +
    '<div class="article-meta"><span class="author">' + escapeHtml(article.author_name) + '</span> · ' + escapeHtml(article.author_intro) + '</div>' +
    '<div class="article-content">' + escapeHtml(article.content) + '</div>' +
    '<div class="article-insight">💭 ' + escapeHtml(article.insight) + '</div>' +
    '<div class="article-source"><a href="' + escapeHtml(article.source_url) + '" target="_blank" rel="noopener">原文 →</a> <span class="date">' + escapeHtml(article.source) + '</span></div>' +
    '</article>';
}

function renderToday() {
  var content = document.getElementById('content');
  if (!state.todayData || !state.todayData.articles.length) {
    content.innerHTML = '<div class="empty-state"><div class="icon">🔭</div><div>今日内容正在生成中，请稍后再来</div></div>';
    return;
  }
  var filtered = filterArticles(state.todayData.articles);
  var dateStr = formatDate(state.todayData.date);
  if (filtered.length === 0) {
    content.innerHTML = '<div class="date-header">' + dateStr + '</div><div class="empty-state"><div>该领域今日暂无内容</div></div>';
    return;
  }
  content.innerHTML = '<div class="date-header">' + dateStr + '</div>' + filtered.map(renderArticleCard).join('');
}

function renderArchive() {
  var content = document.getElementById('content');
  if (!state.archiveData || !state.archiveData.articles.length) {
    content.innerHTML = '<div class="empty-state"><div class="icon">📜</div><div>暂无往期内容</div></div>';
    return;
  }
  var filtered = filterArticles(state.archiveData.articles);
  var grouped = {};
  filtered.forEach(function(a) {
    if (!grouped[a.date]) grouped[a.date] = [];
    grouped[a.date].push(a);
  });
  var dates = Object.keys(grouped).sort().reverse();
  if (dates.length === 0) {
    content.innerHTML = '<div class="empty-state"><div>该领域暂无往期内容</div></div>';
    return;
  }
  var html = '';
  dates.forEach(function(date) {
    var articles = grouped[date];
    html += '<div class="archive-group" onclick="toggleArchiveGroup(this)">' +
      '<div class="archive-date-header"><span>' + formatDate(date) + ' <span class="count">(' + articles.length + '篇)</span></span><span class="chevron">▸</span></div>' +
      '<div class="archive-articles">' + articles.map(renderArticleCard).join('') + '</div></div>';
  });
  if (state.archiveHasMore) {
    html += '<div class="load-more"><button onclick="loadMoreArchive()">加载更多</button></div>';
  }
  content.innerHTML = html;
}

function toggleArchiveGroup(el) { el.classList.toggle('open'); }

// === Tab 切换 ===
async function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  window.location.hash = tab;
  if (tab === 'today') await loadToday();
  else await loadArchive();
}

// === 数据加载 ===
async function loadToday() {
  var content = document.getElementById('content');
  var cached = getCached('today');
  if (cached) { state.todayData = cached; renderToday(); return; }
  
  content.innerHTML = '<div class="loading">加载中...</div>';
  try {
    var data = await callFunction('articles-read', { action: 'today' });
    state.todayData = data;
    if (data.domains && data.domains.length > 0) {
      state.domains = data.domains;
      renderDomainFilters(data.domains);
    }
    setCache('today', data, 300000);
    renderToday();
  } catch (e) {
    content.innerHTML = '<div class="error-state"><div>加载失败，请稍后重试</div><div style="font-size:0.75rem;margin-top:8px;opacity:0.6">' + escapeHtml(e.message) + '</div></div>';
  }
}

async function loadArchive(append) {
  var content = document.getElementById('content');
  if (!append) { state.archivePage = 1; content.innerHTML = '<div class="loading">加载中...</div>'; }
  try {
    var domainParam = state.activeDomains.size === 1 ? Array.from(state.activeDomains)[0] : null;
    var data = await callFunction('articles-read', {
      action: 'archive', page: state.archivePage, limit: 30, domain: domainParam
    });
    if (append && state.archiveData) {
      state.archiveData.articles = state.archiveData.articles.concat(data.articles);
    } else {
      state.archiveData = data;
    }
    state.archiveHasMore = data.hasMore;
    renderArchive();
  } catch (e) {
    content.innerHTML = '<div class="error-state"><div>加载失败，请稍后重试</div></div>';
  }
}

async function loadMoreArchive() { state.archivePage++; await loadArchive(true); }

// === 初始化 ===
async function init() {
  try {
    var cached = getCached('domains');
    if (cached) {
      state.domains = cached;
    } else {
      var data = await callFunction('articles-read', { action: 'domains' });
      state.domains = data.domains;
      setCache('domains', data.domains, 86400000);
    }
    renderDomainFilters(state.domains);
  } catch (e) {
    state.domains = [
      { _id: 'T', name: '技术' }, { _id: 'P', name: '政治' },
      { _id: 'H', name: '历史' }, { _id: 'Phi', name: '哲学' },
      { _id: 'R', name: '宗教' }, { _id: 'F', name: '金融' }
    ];
    renderDomainFilters(state.domains);
  }
  var hash = window.location.hash.replace('#', '');
  if (hash === 'archive') switchTab('archive');
  else switchTab('today');
}

window.addEventListener('hashchange', function() {
  var hash = window.location.hash.replace('#', '');
  if (hash && hash !== state.currentTab) switchTab(hash);
});

document.addEventListener('DOMContentLoaded', init);
