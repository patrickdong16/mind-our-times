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
  authed: false,
  // 搜索相关
  searchKeyword: '',
  searchResults: null,
  searchLoading: false,
  searchTimer: null,
  // 播客日
  podcastData: null,
  podcastLoading: false,
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
  'Φ': '🤔', 'R': '✝️', 'F': '💰'
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
  if (state.currentTab === 'today') {
    renderToday();
  } else if (state.searchKeyword && state.searchResults) {
    renderSearchResults();
  } else {
    renderArchive();
  }
}

function filterArticles(articles) {
  if (state.activeDomains.size === 0) return articles;
  return articles.filter(function(a) { return state.activeDomains.has(a.domain); });
}

// === 搜索功能 ===
function highlightText(text, keyword) {
  if (!text || !keyword) return escapeHtml(text);
  var escaped = escapeHtml(text);
  var escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var regex = new RegExp('(' + escapedKeyword + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function renderSearchBox() {
  var existing = document.getElementById('searchBox');
  if (existing) return;
  
  var searchHtml = '<div class="search-box" id="searchBox">' +
    '<div class="search-input-wrap">' +
    '<svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
    '<input type="text" id="searchInput" placeholder="搜索文章标题、内容..." autocomplete="off" />' +
    '<button class="search-clear" id="searchClear" style="display:none" onclick="clearSearch()">✕</button>' +
    '</div>' +
    '</div>';
  
  var content = document.getElementById('content');
  content.insertAdjacentHTML('beforebegin', searchHtml);
  
  var input = document.getElementById('searchInput');
  input.addEventListener('input', function() {
    var keyword = this.value.trim();
    var clearBtn = document.getElementById('searchClear');
    clearBtn.style.display = keyword ? 'flex' : 'none';
    
    if (state.searchTimer) clearTimeout(state.searchTimer);
    
    if (!keyword) {
      state.searchKeyword = '';
      state.searchResults = null;
      renderArchive();
      return;
    }
    
    state.searchTimer = setTimeout(function() {
      performSearch(keyword);
    }, 300);
  });
  
  // 回车立即搜索
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var keyword = this.value.trim();
      if (keyword) {
        if (state.searchTimer) clearTimeout(state.searchTimer);
        performSearch(keyword);
      }
    }
  });
}

function removeSearchBox() {
  var existing = document.getElementById('searchBox');
  if (existing) existing.remove();
  state.searchKeyword = '';
  state.searchResults = null;
  if (state.searchTimer) clearTimeout(state.searchTimer);
}

async function performSearch(keyword) {
  state.searchKeyword = keyword;
  state.searchLoading = true;
  var content = document.getElementById('content');
  content.innerHTML = '<div class="loading">搜索中...</div>';
  
  try {
    var data = await callFunction('articles-read', { action: 'search', keyword: keyword, limit: 50 });
    state.searchResults = data;
    state.searchLoading = false;
    renderSearchResults();
  } catch (e) {
    state.searchLoading = false;
    content.innerHTML = '<div class="error-state"><div>搜索失败，请稍后重试</div></div>';
  }
}

function clearSearch() {
  var input = document.getElementById('searchInput');
  if (input) input.value = '';
  var clearBtn = document.getElementById('searchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  state.searchKeyword = '';
  state.searchResults = null;
  if (state.searchTimer) clearTimeout(state.searchTimer);
  renderArchive();
}

function renderSearchArticleCard(article, keyword) {
  var domainObj = state.domains.find(function(d) { return d._id === article.domain; });
  var domainName = domainObj ? domainObj.name : article.domain;
  var icon = DOMAIN_ICONS[article.domain] || '';
  
  var titleHtml = highlightText(article.title, keyword);
  var contentHtml = keyword ? getHighlightedSnippet(article.content, keyword) : escapeHtml(article.content);
  var insightHtml = highlightText(article.insight, keyword);
  
  return '<article class="article-card" data-domain="' + article.domain + '">' +
    '<div class="article-domain">' + icon + ' ' + domainName + '</div>' +
    '<h2 class="article-title">' + titleHtml + '</h2>' +
    '<div class="article-meta"><span class="author">' + escapeHtml(article.author_name) + '</span> · ' + escapeHtml(article.author_intro) + '</div>' +
    '<div class="article-content">' + contentHtml + '</div>' +
    '<div class="article-insight">💭 ' + insightHtml + '</div>' +
    '<div class="article-source"><a href="' + escapeHtml(article.source_url) + '" target="_blank" rel="noopener">原文 →</a> <span class="date">' + escapeHtml(article.source) + (article.source_date ? ' · ' + formatSourceDate(article.source_date) : '') + '</span></div>' +
    '</article>';
}

function getHighlightedSnippet(text, keyword) {
  if (!text || !keyword) return escapeHtml(text);
  var lowerText = text.toLowerCase();
  var lowerKeyword = keyword.toLowerCase();
  var idx = lowerText.indexOf(lowerKeyword);
  
  if (idx === -1) return escapeHtml(text);
  
  // 截取关键词附近的文本作为片段
  var snippetStart = Math.max(0, idx - 60);
  var snippetEnd = Math.min(text.length, idx + keyword.length + 200);
  var snippet = text.substring(snippetStart, snippetEnd);
  if (snippetStart > 0) snippet = '…' + snippet;
  if (snippetEnd < text.length) snippet = snippet + '…';
  
  return highlightText(snippet, keyword);
}

function renderSearchResults() {
  var content = document.getElementById('content');
  var keyword = state.searchKeyword;
  var results = state.searchResults;
  
  if (!results || !results.articles || results.articles.length === 0) {
    content.innerHTML = '<div class="search-results-header">找到 <strong>0</strong> 篇相关文章</div>' +
      '<div class="empty-state"><div class="icon">🔍</div><div>未找到与「' + escapeHtml(keyword) + '」相关的文章</div></div>';
    return;
  }
  
  var filtered = filterArticles(results.articles);
  
  var html = '<div class="search-results-header">找到 <strong>' + results.total + '</strong> 篇相关文章' +
    (results.total > filtered.length && state.activeDomains.size > 0 ? '，当前筛选显示 ' + filtered.length + ' 篇' : '') +
    '</div>';
  
  if (filtered.length === 0) {
    html += '<div class="empty-state"><div>当前领域筛选下无匹配结果</div></div>';
  } else {
    // 按日期分组
    var grouped = {};
    filtered.forEach(function(a) {
      if (!grouped[a.date]) grouped[a.date] = [];
      grouped[a.date].push(a);
    });
    var dates = Object.keys(grouped).sort().reverse();
    
    dates.forEach(function(date) {
      html += '<div class="search-date-label">' + formatDate(date) + '</div>';
      grouped[date].forEach(function(article) {
        html += renderSearchArticleCard(article, keyword);
      });
    });
  }
  
  content.innerHTML = html;
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

function formatSourceDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  var m = parseInt(parts[1]), d = parseInt(parts[2]);
  return m + '月' + d + '日';
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
    '<div class="article-source"><a href="' + escapeHtml(article.source_url) + '" target="_blank" rel="noopener">原文 →</a> <span class="date">' + escapeHtml(article.source) + (article.source_date ? ' · ' + formatSourceDate(article.source_date) : '') + '</span></div>' +
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
  if (tab === 'today') {
    removeSearchBox();
    await loadToday();
  } else {
    renderSearchBox();
    await loadArchive();
  }
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

// === 暴露函数到全局作用域（Vite 构建后 onclick 需要） ===
window.switchTab = switchTab;
window.toggleDomain = toggleDomain;
window.toggleArchiveGroup = toggleArchiveGroup;
window.loadMoreArchive = loadMoreArchive;
window.clearSearch = clearSearch;
window.performSearch = performSearch;

document.addEventListener('DOMContentLoaded', init);
