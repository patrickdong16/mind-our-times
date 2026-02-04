/**
 * Mind Our Times - 配置
 * 根据部署环境切换 API 地址
 */
const CONFIG = {
  // CloudBase 环境 ID
  envId: 'thoughts-rador26-2f3u8ht52110fab',
  
  // API 基础地址（CloudBase HTTP 触发）
  // 部署后替换为实际地址
  apiBase: '',
  
  // 站点信息
  siteName: 'Mind Our Times',
  siteDesc: '追踪时代思想脉搏',
  
  // 缓存时间（毫秒）
  cacheToday: 5 * 60 * 1000,     // 今日数据 5 分钟
  cacheArchive: 60 * 60 * 1000,  // 往期数据 1 小时
  cacheDomains: 24 * 60 * 60 * 1000  // 领域配置 24 小时
};

// 自动检测环境
(function detectEnv() {
  const host = window.location.hostname;
  if (host.includes('vercel.app') || host === 'localhost' || host === '127.0.0.1') {
    // 测试环境 - 仍指向 CloudBase API
    CONFIG.apiBase = `https://${CONFIG.envId}.service.tcloudbase.com`;
  } else {
    // 生产环境（CloudBase 托管）
    CONFIG.apiBase = `https://${CONFIG.envId}.service.tcloudbase.com`;
  }
})();
