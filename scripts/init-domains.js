/**
 * 初始化领域配置数据
 * 运行方式：通过 CloudBase CLI 或直接在云函数中执行
 */
const DOMAINS = [
  {
    _id: 'T',
    name: '技术',
    core_question: 'AI 是否正在加剧社会分层？',
    yes_label: '正在加剧',
    no_label: '趋向普惠',
    sort_order: 1,
    active: true
  },
  {
    _id: 'P',
    name: '政治',
    core_question: '民主制度是否正在失效？',
    yes_label: '正在失效',
    no_label: '仍然有效',
    sort_order: 2,
    active: true
  },
  {
    _id: 'H',
    name: '历史',
    core_question: '当前文明是否正在走向衰退？',
    yes_label: '正在衰退',
    no_label: '只是调整',
    sort_order: 3,
    active: true
  },
  {
    _id: 'Φ',
    name: '哲学',
    core_question: '算法优化是否正在侵蚀自由意志？',
    yes_label: '正在侵蚀',
    no_label: '只是工具',
    sort_order: 4,
    active: true
  },
  {
    _id: 'R',
    name: '宗教',
    core_question: '科技是否正在成为新宗教？',
    yes_label: '正在替代',
    no_label: '只是工具',
    sort_order: 5,
    active: true
  },
  {
    _id: 'F',
    name: '金融',
    core_question: '金融是否正在加剧社会撕裂？',
    yes_label: '正在加剧',
    no_label: '可以修复',
    sort_order: 6,
    active: true
  }
];

// 用于 CloudBase 云函数环境
async function initInCloudBase(db) {
  console.log('初始化领域配置...');
  
  for (const domain of DOMAINS) {
    try {
      await db.collection('domains').doc(domain._id).set(domain);
      console.log(`✅ ${domain._id} (${domain.name})`);
    } catch (e) {
      console.error(`❌ ${domain._id}: ${e.message}`);
    }
  }
  
  console.log(`完成，共 ${DOMAINS.length} 个领域`);
}

// 导出供云函数调用
module.exports = { DOMAINS, initInCloudBase };

// 直接运行时输出 JSON（便于 curl 初始化）
if (require.main === module) {
  console.log(JSON.stringify(DOMAINS, null, 2));
}
