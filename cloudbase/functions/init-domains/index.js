/**
 * init-domains: 一次性云函数，初始化领域配置
 * 部署后调用一次，然后可以删除
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({
  env: cloud.SYMBOL_CURRENT_ENV
});

const db = app.database();

const domains = [
  {
    _id: 'T',
    name: '技术',
    question: 'AI 是否正在加剧社会分层？',
    yes_label: '正在加剧',
    no_label: '趋向普惠',
    sort_order: 1,
    active: true
  },
  {
    _id: 'P',
    name: '政治',
    question: '民主制度是否正在失效？',
    yes_label: '正在失效',
    no_label: '仍然有效',
    sort_order: 2,
    active: true
  },
  {
    _id: 'H',
    name: '历史',
    question: '当前文明是否正在走向衰退？',
    yes_label: '正在衰退',
    no_label: '只是调整',
    sort_order: 3,
    active: true
  },
  {
    _id: 'Φ',
    name: '哲学',
    question: '算法优化是否正在侵蚀自由意志？',
    yes_label: '正在侵蚀',
    no_label: '只是工具',
    sort_order: 4,
    active: true
  },
  {
    _id: 'R',
    name: '宗教',
    question: '科技是否正在成为新宗教？',
    yes_label: '正在替代',
    no_label: '只是工具',
    sort_order: 5,
    active: true
  },
  {
    _id: 'F',
    name: '金融',
    question: '金融是否正在加剧社会撕裂？',
    yes_label: '正在加剧',
    no_label: '可以修复',
    sort_order: 6,
    active: true
  }
];

exports.main = async (event) => {
  try {
    // 清空旧数据
    await db.collection('domains').where({ _id: db.command.exists(true) }).remove();
    
    // 批量插入
    let inserted = 0;
    for (const domain of domains) {
      await db.collection('domains').add(domain);
      inserted++;
    }
    
    return {
      success: true,
      message: `成功初始化 ${inserted} 个领域配置`,
      domains: domains.map(d => ({ id: d._id, name: d.name }))
    };
  } catch (err) {
    console.error('init-domains error:', err);
    return {
      success: false,
      error: err.message
    };
  }
};
