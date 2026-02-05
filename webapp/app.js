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

// === 播客日功能 ===

function formatPodcastDate(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  var now = new Date();
  var diffMs = now - d;
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return diffDays + '天前';
  if (diffDays < 30) return Math.floor(diffDays / 7) + '周前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function formatPodcastSummary(text) {
  if (!text) return '';
  return text.split('\n').filter(function(l) { return l.trim(); }).map(function(line) {
    var escaped = escapeHtml(line);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return '<p>' + escaped + '</p>';
  }).join('');
}

function renderPodcastCard(ep) {
  var domainObj = state.domains.find(function(d) { return d._id === ep.domain; });
  var domainName = domainObj ? domainObj.name : (ep.domain || '');
  var icon = DOMAIN_ICONS[ep.domain] || '🎙️';
  var title = ep.title || ep.title_original || '';
  var titleOriginal = ep.title_original || ep.title || '';
  var channel = ep.channel || ep.channelName || '';
  var duration = ep.duration || ep.durationFormatted || '';
  var views = ep.views_formatted || ep.viewCountFormatted || '';
  var thumbnail = ep.thumbnail || '';
  var youtubeUrl = ep.youtube_url || ep.youtubeUrl || '';
  var summary = ep.summary_cn || ep.summary || '';
  var whyListen = ep.why_listen || '';
  var publishDate = formatPodcastDate(ep.published_at || ep.publishedAt || '');

  return '<article class="podcast-card" data-domain="' + (ep.domain || '') + '">' +
    '<a href="' + escapeHtml(youtubeUrl) + '" target="_blank" rel="noopener" class="podcast-thumb-link">' +
    '<div class="podcast-thumb">' +
    '<img src="' + escapeHtml(thumbnail) + '" alt="' + escapeHtml(title) + '" loading="lazy" onerror="this.style.display=\'none\'">' +
    '<span class="podcast-domain-badge">' + icon + ' ' + escapeHtml(domainName) + '</span>' +
    '<span class="podcast-duration-badge">' + escapeHtml(duration) + '</span>' +
    '<div class="podcast-play-overlay">▶</div>' +
    '</div>' +
    '</a>' +
    '<div class="podcast-body">' +
    '<div class="podcast-channel">' + escapeHtml(channel) + '</div>' +
    '<h2 class="podcast-title">' + escapeHtml(title) + '</h2>' +
    (title !== titleOriginal ? '<div class="podcast-title-orig">' + escapeHtml(titleOriginal) + '</div>' : '') +
    '<div class="podcast-meta">' +
    '<span class="podcast-meta-item">👁 ' + escapeHtml(views) + ' 观看</span>' +
    '<span class="podcast-meta-item">📅 ' + escapeHtml(publishDate) + '</span>' +
    '</div>' +
    (whyListen ? '<div class="podcast-why-listen">🎧 ' + escapeHtml(whyListen) + '</div>' : '') +
    '<div class="podcast-summary">' + formatPodcastSummary(summary) + '</div>' +
    '<a href="' + escapeHtml(youtubeUrl) + '" target="_blank" rel="noopener" class="podcast-watch-btn">' +
    '<span>▶</span> 在 YouTube 观看' +
    '</a>' +
    '</div>' +
    '</article>';
}

function renderPodcast() {
  var content = document.getElementById('content');
  if (!state.podcastData || !state.podcastData.articles || state.podcastData.articles.length === 0) {
    content.innerHTML = '<div class="empty-state"><div class="icon">🎙️</div><div>本周播客推荐正在生成中，请稍后再来</div><div style="font-size:0.8rem;margin-top:8px;opacity:0.6">每周五更新</div></div>';
    return;
  }
  var filtered = filterArticles(state.podcastData.articles);
  var dateStr = state.podcastData.date ? formatDate(state.podcastData.date) : '';
  
  if (filtered.length === 0) {
    content.innerHTML = (dateStr ? '<div class="date-header">' + dateStr + '</div>' : '') +
      '<div class="empty-state"><div>该领域暂无播客推荐</div></div>';
    return;
  }
  
  var html = '<div class="podcast-header">' +
    '<div class="podcast-header-title">🎙️ Podcast Friday</div>' +
    '<div class="podcast-header-desc">每周精选 · 全球顶级思想播客 · AI 中文解读</div>' +
    (dateStr ? '<div class="podcast-header-date">' + dateStr + '</div>' : '') +
    '</div>';
  
  html += '<div class="podcast-grid">';
  html += filtered.map(renderPodcastCard).join('');
  html += '</div>';
  
  content.innerHTML = html;
}

async function loadPodcast() {
  var content = document.getElementById('content');
  
  // 先检查缓存
  var cached = getCached('podcast');
  if (cached) {
    state.podcastData = cached;
    renderPodcast();
    return;
  }
  
  content.innerHTML = '<div class="loading">加载播客推荐...</div>';
  state.podcastLoading = true;
  
  try {
    // 尝试从 CloudBase 云函数读取
    var data = await callFunction('articles-read', { action: 'podcast-latest' });
    
    if (data && data.articles && data.articles.length > 0) {
      state.podcastData = data;
      if (data.domains && data.domains.length > 0) {
        state.domains = data.domains;
        renderDomainFilters(data.domains);
      }
      setCache('podcast', data, 600000); // 10 分钟缓存
      renderPodcast();
    } else {
      // Fallback: 从静态 JSON 加载（podcast-friday/frontend/data.json）
      await loadPodcastFromStatic();
    }
  } catch (e) {
    console.log('CloudBase podcast load failed, trying static:', e.message);
    await loadPodcastFromStatic();
  }
  
  state.podcastLoading = false;
}

async function loadPodcastFromStatic() {
  try {
    var resp = await fetch('/podcast-friday/data.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    
    // 转换格式以匹配渲染函数
    state.podcastData = {
      date: data.weekLabel || '',
      articles: (data.episodes || []).map(function(ep) {
        return {
          domain: ep.domain,
          title: ep.title,
          title_original: ep.title,
          channel: ep.channelName,
          channelName: ep.channelName,
          duration: ep.durationFormatted,
          durationFormatted: ep.durationFormatted,
          views_formatted: ep.viewCountFormatted,
          viewCountFormatted: ep.viewCountFormatted,
          views: ep.viewCount,
          published_at: ep.publishedAt,
          publishedAt: ep.publishedAt,
          thumbnail: ep.thumbnail,
          summary_cn: ep.summary,
          summary: ep.summary,
          why_listen: ep.why_listen || '',
          youtube_url: ep.youtubeUrl,
          youtubeUrl: ep.youtubeUrl,
          video_id: ep.videoId,
          score: ep.score,
        };
      }),
      total: (data.episodes || []).length,
    };
    
    setCache('podcast', state.podcastData, 600000);
    renderPodcast();
  } catch (e) {
    console.error('Static podcast load failed:', e);
    document.getElementById('content').innerHTML = 
      '<div class="error-state"><div>播客数据加载失败</div><div style="font-size:0.75rem;margin-top:8px;opacity:0.6">' + escapeHtml(e.message) + '</div></div>';
  }
}

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
  } else if (tab === 'podcast') {
    removeSearchBox();
    await loadPodcast();
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
  else if (hash === 'podcast') switchTab('podcast');
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
