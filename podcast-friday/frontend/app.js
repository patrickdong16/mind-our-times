/**
 * Podcast Friday — Frontend Logic
 * Vanilla JS, no dependencies, mobile-first
 */

(function() {
  'use strict';

  // === State ===
  let episodes = [];
  let activeDomain = 'all';

  // === Domain Config ===
  const DOMAIN_NAMES = {
    'T': '技术', 'P': '政治', 'Φ': '哲学',
    'H': '历史', 'R': '宗教', 'F': '金融'
  };

  const DOMAIN_ICONS = {
    'T': '🔧', 'P': '🏛️', 'Φ': '🤔',
    'H': '📜', 'R': '✝️', 'F': '💰'
  };

  // === Data Loading ===
  async function loadData() {
    const episodesEl = document.getElementById('episodes');
    const errorEl = document.getElementById('errorState');
    
    errorEl.style.display = 'none';
    episodesEl.innerHTML = generateSkeletons(3);

    try {
      const response = await fetch('data.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      episodes = data.episodes || [];
      
      // Set week label
      const weekLabel = document.getElementById('weekLabel');
      if (data.weekLabel) {
        weekLabel.textContent = data.weekLabel;
      } else if (data.generatedAt) {
        const d = new Date(data.generatedAt);
        weekLabel.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
      }

      renderEpisodes();
    } catch (e) {
      console.error('Load failed:', e);
      episodesEl.innerHTML = '';
      errorEl.style.display = 'block';
    }
  }

  // === Rendering ===
  function renderEpisodes() {
    const episodesEl = document.getElementById('episodes');
    
    const filtered = activeDomain === 'all' 
      ? episodes 
      : episodes.filter(ep => ep.domain === activeDomain);
    
    if (filtered.length === 0) {
      episodesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎧</div>
          <p>该领域暂无推荐</p>
        </div>`;
      return;
    }

    episodesEl.innerHTML = filtered.map((ep, i) => renderCard(ep, i + 1)).join('');
    
    // Attach event listeners
    document.querySelectorAll('.summary-toggle').forEach(btn => {
      btn.addEventListener('click', handleToggle);
    });
    
    document.querySelectorAll('.watch-btn').forEach(btn => {
      btn.addEventListener('click', handleWatch);
    });
  }

  function renderCard(ep, rank) {
    const domainName = DOMAIN_NAMES[ep.domain] || ep.domain;
    const domainIcon = DOMAIN_ICONS[ep.domain] || '';
    const publishDate = formatPublishDate(ep.publishedAt);
    
    return `
    <article class="episode-card" data-video-id="${escapeAttr(ep.videoId)}">
      <div class="episode-thumb">
        <img src="${escapeAttr(ep.thumbnail)}" 
             alt="${escapeAttr(ep.title)}" 
             loading="${rank <= 3 ? 'eager' : 'lazy'}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22><rect fill=%22%23222%22 width=%2216%22 height=%229%22/><text fill=%22%23666%22 x=%228%22 y=%225%22 text-anchor=%22middle%22 font-size=%222%22>🎙️</text></svg>'">
        <span class="domain-badge">${domainIcon} ${escapeHtml(domainName)}</span>
        <span class="duration-badge">${escapeHtml(ep.durationFormatted)}</span>
      </div>
      <div class="episode-body">
        <div class="episode-channel">${escapeHtml(ep.channelName)}</div>
        <h2 class="episode-title">${escapeHtml(ep.title)}</h2>
        <div class="episode-meta">
          <span class="meta-item">
            <span class="meta-icon">👁</span>
            ${escapeHtml(ep.viewCountFormatted)} 观看
          </span>
          <span class="meta-item">
            <span class="meta-icon">📅</span>
            ${escapeHtml(publishDate)}
          </span>
        </div>
        <button class="summary-toggle" data-video-id="${escapeAttr(ep.videoId)}">
          <span class="arrow">▼</span>
          <span>查看 AI 摘要</span>
        </button>
        <div class="episode-summary">${formatSummary(ep.summary)}</div>
        <a href="${escapeAttr(ep.youtubeUrl)}" target="_blank" rel="noopener" 
           class="watch-btn" data-video-id="${escapeAttr(ep.videoId)}">
          <span class="play-icon">▶</span>
          在 YouTube 观看
        </a>
      </div>
    </article>`;
  }

  // === Event Handlers ===
  function handleToggle(e) {
    e.stopPropagation();
    const card = e.target.closest('.episode-card');
    if (card) {
      card.classList.toggle('expanded');
      const label = card.querySelector('.summary-toggle span:last-child');
      if (card.classList.contains('expanded')) {
        label.textContent = '收起摘要';
      } else {
        label.textContent = '查看 AI 摘要';
      }
    }
  }

  function handleWatch(e) {
    // Let the link work naturally, just stop card toggle
    e.stopPropagation();
  }

  // === Filters ===
  function setupFilters() {
    document.querySelectorAll('.filter-tag').forEach(tag => {
      tag.addEventListener('click', function() {
        const domain = this.dataset.domain;
        activeDomain = domain;
        
        // Update active state
        document.querySelectorAll('.filter-tag').forEach(t => {
          t.classList.toggle('active', t.dataset.domain === domain);
        });
        
        renderEpisodes();
      });
    });
  }

  // === Helpers ===
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatPublishDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatSummary(summary) {
    if (!summary) return '<p>摘要生成中...</p>';
    // Convert line breaks to paragraphs
    return summary.split('\n').filter(l => l.trim()).map(line => {
      line = escapeHtml(line);
      // Bold **text**
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return `<p>${line}</p>`;
    }).join('');
  }

  function generateSkeletons(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      html += `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-thumb"></div>
        <div class="skeleton-content">
          <div class="skeleton-line w80"></div>
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w90"></div>
          <div class="skeleton-line w70"></div>
        </div>
      </div>`;
    }
    return html;
  }

  // === Init ===
  function init() {
    setupFilters();
    loadData();
  }

  // Expose loadData for retry button
  window.loadData = loadData;

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
