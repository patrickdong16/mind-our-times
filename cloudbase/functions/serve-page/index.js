/**
 * serve-page - 代理静态页面，修复 Content-Disposition 问题
 * 
 * 用法:
 * - /serve-page?page=vote.html&id=xxx
 * - /serve-page?page=index.html
 */

const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: process.env.TCB_ENV || 'mind-our-times-3g7c3va270081e5c' });

// 页面内容（内联，避免文件读取问题）
const PAGES = {
  'vote.html': getVotePage,
  'index.html': getIndexPage
};

exports.main = async (event, context) => {
  const page = event.page || 'index.html';
  
  if (!PAGES[page]) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Page not found'
    };
  }
  
  const html = PAGES[page](event);
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60'
    },
    body: html
  };
};

function getVotePage(event) {
  // 返回 vote.html 内容
  return `<!DOCTYPE html>
<html lang="zh-CN">
<!-- vote.html content will be inlined here -->
</html>`;
}

function getIndexPage(event) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<!-- index.html content will be inlined here -->
</html>`;
}
