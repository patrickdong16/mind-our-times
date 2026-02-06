#!/bin/bash
# 手动检查投票统计
# 用法: bash scripts/vote-manual-check.sh

echo "📊 Mind Our Times 投票统计"
echo "=========================="
echo ""

# 访问投票页获取数据
VOTE_URL="https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com/vote.html?id=2026-02-06-ai-fear"

echo "打开投票页查看实时数据："
echo "$VOTE_URL"
echo ""

# 尝试用 browser 获取
if command -v openclaw &> /dev/null; then
  echo "正在获取数据..."
  openclaw browser navigate "$VOTE_URL" 2>/dev/null
  sleep 5
  openclaw browser evaluate --json --fn "() => {
    const total = document.querySelector('.result-total')?.textContent;
    const a = document.querySelector('.result-a')?.textContent;
    const b = document.querySelector('.result-b')?.textContent;
    return { total, a, b };
  }" 2>&1
fi
