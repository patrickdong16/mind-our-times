/**
 * Mind Our Times — 前端逻辑
 * 纯 Vanilla JS，零依赖
 */

// === 状态 ===
const state = {
  currentTab: 'today',
  activeDomains: new Set(),  // 空集 = 全部
  domains: [],
  todayData: null,
  archiveData: null,
  archivePage: 1,
  archiveHasMore: false,
  loading: false
};

// === 缓存 ===
const cache = {};

function getCached(key) {
  const item = cache[key];
  if (!item) return null;
  if (Date.now() - item.time > item.ttl) {
    delete cache[key];
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl) {
  cache[key] = { data, time: Date.now(), ttl };
}

// === API 调用 ===
async function api(action, params = {}) {
  const url = new URL(`${CONFIG.apiBase}/articles-read`);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }
  
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '未知错误');
      
      return json.data;
    } catch (e) {
      lastError = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

// === 领域配置 ===
const DOMAIN_ICONS = {
  'T': '🔧', 'P': '🏛️', 'H': '📜',
  'Φ': '💭', 'R': '⛪', 'F': '💰'
};

function renderDomainFilters(domains) {
  const container = document.getElementById('domainFilters');
  
  // 「全部」标签
  let html = `<span class="domain-tag active" data-domain="all" onclick="toggleDomain('all')">全部</span>`;
  
  for (const d of domains) {
    const icon = DOMAIN_ICONS[d._id] || '';
    html += `<span class="domain-tag" data-domain="${d._id}" onclick="toggleDomain('${d._id}')">${icon} ${d.name}</span>`;
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
  
  // 更新标签样式
  document.querySelectorAll('.domain-tag').forEach(tag => {
    const d = tag.dataset.domain;
    if (d === 'all') {
      tag.classList.toggle('active', state.activeDomains.size === 0);
    } else {
      tag.classList.toggle('active', state.activeDomains.has(d));
    }
  });
  
  // 重新渲染内容
  if (state.currentTab === 'today') renderToday();
  else renderArchive();
}

// === 文章过滤 ===
function filterArticles(articles) {
  if (state.activeDomains.size === 0) return articles;
  return articles.filter(a => state.activeDomains.has(a.domain));
}

// === 渲染：今日 ===
function renderArticleCard(article) {
  const domainName = state.domains.find(d => d._id === article.domain)?.name || article.domain;
  const icon = DOMAIN_ICONS[article.domain] || '';
  
  return `
    <article class="article-card" data-domain="${article.domain}">
      <div class="article-domain">${icon} ${domainName}</div>
      <h2 class="article-title">${escapeHtml(article.title)}</h2>
      <div class="article-meta">
        <span class="author">${escapeHtml(article.author_name)}</span> · ${escapeHtml(article.author_intro)}
      </div>
      <div class="article-content">${escapeHtml(article.content)}</div>
      <div class="article-insight">💭 ${escapeHtml(article.insight)}</div>
      <div class="article-source">
        <a href="${escapeHtml(article.source_url)}" target="_blank" rel="noopener">原文 →</a>
        <span class="date">${escapeHtml(article.source)}</span>
      </div>
    </article>
  `;
}

function renderToday() {
  const content = document.getElementById('content');
  
  if (!state.todayData || !state.todayData.articles.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔭</div>
        <div>今日内容正在生成中，请稍后再来</div>
      </div>
    `;
    return;
  }
  
  const filtered = filterArticles(state.todayData.articles);
  const dateStr = formatDate(state.todayData.date);
  
  if (filtered.length === 0) {
    content.innerHTML = `
      <div class="date-header">${dateStr}</div>
      <div class="empty-state">
        <div>该领域今日暂无内容</div>
      </div>
    `;
    return;
  }
  
  content.innerHTML = `
    <div class="date-header">${dateStr}</div>
    ${filtered.map(renderArticleCard).join('')}
  `;
}

// === 渲染：往期 ===
function renderArchive() {
  const content = document.getElementById('content');
  
  if (!state.archiveData || !state.archiveData.articles.length) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">📜</div>
        <div>暂无往期内容</div>
      </div>
    `;
    return;
  }
  
  const filtered = filterArticles(state.archiveData.articles);
  
  // 按日期分组
  const grouped = {};
  for (const a of filtered) {
    if (!grouped[a.date]) grouped[a.date] = [];
    grouped[a.date].push(a);
  }
  
  const dates = Object.keys(grouped).sort().reverse();
  
  if (dates.length === 0) {
    content.innerHTML = `
      <div class="empty-state"><div>该领域暂无往期内容</div></div>
    `;
    return;
  }
  
  let html = '';
  for (const date of dates) {
    const articles = grouped[date];
    const dateStr = formatDate(date);
    html += `
      <div class="archive-group" onclick="toggleArchiveGroup(this)">
        <div class="archive-date-header">
          <span>${dateStr} <span class="count">(${articles.length}篇)</span></span>
          <span class="chevron">▸</span>
        </div>
        <div class="archive-articles">
          ${articles.map(renderArticleCard).join('')}
        </div>
      </div>
    `;
  }
  
  if (state.archiveHasMore) {
    html += `
      <div class="load-more">
        <button onclick="loadMoreArchive()">加载更多</button>
      </div>
    `;
  }
  
  content.innerHTML = html;
}

function toggleArchiveGroup(el) {
  el.classList.toggle('open');
}

// === Tab 切换 ===
async function switchTab(tab) {
  state.currentTab = tab;
  
  // 更新 Tab 样式
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  
  // 更新 URL hash
  window.location.hash = tab;
  
  if (tab === 'today') {
    await loadToday();
  } else {
    await loadArchive();
  }
}

// === 数据加载 ===
async function loadToday() {
  const content = document.getElementById('content');
  
  // 检查缓存
  const cached = getCached('today');
  if (cached) {
    state.todayData = cached;
    renderToday();
    return;
  }
  
  content.innerHTML = '<div class="loading">加载中...</div>';
  
  try {
    const data = await api('today');
    state.todayData = data;
    
    // 缓存领域配置
    if (data.domains && data.domains.length > 0) {
      state.domains = data.domains;
      renderDomainFilters(data.domains);
    }
    
    setCache('today', data, CONFIG.cacheToday);
    renderToday();
  } catch (e) {
    content.innerHTML = `
      <div class="error-state">
        <div>加载失败，请稍后重试</div>
        <div style="font-size:0.75rem;margin-top:8px;opacity:0.6">${escapeHtml(e.message)}</div>
      </div>
    `;
  }
}

async function loadArchive(append = false) {
  const content = document.getElementById('content');
  
  if (!append) {
    state.archivePage = 1;
    content.innerHTML = '<div class="loading">加载中...</div>';
  }
  
  try {
    const domainParam = state.activeDomains.size === 1 
      ? [...state.activeDomains][0] 
      : null;
    
    const data = await api('archive', {
      page: state.archivePage,
      limit: 30,
      domain: domainParam
    });
    
    if (append && state.archiveData) {
      state.archiveData.articles = [...state.archiveData.articles, ...data.articles];
    } else {
      state.archiveData = data;
    }
    
    state.archiveHasMore = data.hasMore;
    renderArchive();
  } catch (e) {
    content.innerHTML = `
      <div class="error-state">
        <div>加载失败，请稍后重试</div>
      </div>
    `;
  }
}

async function loadMoreArchive() {
  state.archivePage++;
  await loadArchive(true);
}

// === 工具函数 ===
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${y}年${parseInt(m)}月${parseInt(d)}日 · 星期${weekdays[date.getDay()]}`;
}

// === 初始化 ===
async function init() {
  // 加载领域配置
  try {
    const domainsCached = getCached('domains');
    if (domainsCached) {
      state.domains = domainsCached;
    } else {
      const data = await api('domains');
      state.domains = data.domains;
      setCache('domains', data.domains, CONFIG.cacheDomains);
    }
    renderDomainFilters(state.domains);
  } catch (e) {
    // 降级：使用默认领域
    state.domains = [
      { _id: 'T', name: '技术' }, { _id: 'P', name: '政治' },
      { _id: 'H', name: '历史' }, { _id: 'Φ', name: '哲学' },
      { _id: 'R', name: '宗教' }, { _id: 'F', name: '金融' }
    ];
    renderDomainFilters(state.domains);
  }
  
  // 根据 hash 决定初始 tab
  const hash = window.location.hash.replace('#', '');
  if (hash === 'archive') {
    switchTab('archive');
  } else {
    switchTab('today');
  }
}

// Hash 变化监听
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && hash !== state.currentTab) {
    switchTab(hash);
  }
});

// 启动
document.addEventListener('DOMContentLoaded', init);
