#!/bin/bash
# Mind Our Times — 部署脚本
# 从 workspace 根目录运行：bash mind-our-times/deploy.sh

set -e
ENVID="mind-our-times-3g7c3va270081e5c"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Mind Our Times 部署 ==="
echo ""

# Step 1: Build webapp
echo "📦 Step 1: Building webapp..."
cd "$DIR/webapp"
npm run build
echo "✅ Webapp built"
echo ""

# Step 2: Deploy cloud functions
echo "☁️ Step 2: Deploying cloud functions..."
cd "$DIR/cloudbase"

echo "  → Deploying articles-read..."
echo "y" | tcb fn deploy articles-read --envId $ENVID
echo "  ✅ articles-read deployed"

echo "  → Deploying vote..."
echo "y" | tcb fn deploy vote --envId $ENVID
echo "  ✅ vote deployed"
echo ""

# Step 3: Deploy static hosting
echo "🌐 Step 3: Deploying static hosting..."
tcb hosting deploy "$DIR/webapp/dist" / --envId $ENVID
echo "✅ Static hosting deployed"
echo ""

echo "=== 部署完成，正在验证... ==="

# 验证部署
BASE_URL="https://mind-our-times-3g7c3va270081e5c-1397697000.tcloudbaseapp.com"
echo ""
echo "🔍 验证首页..."
HTTP_CODE=$(curl -sI "$BASE_URL/" --max-time 10 | head -1 | awk '{print $2}')
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 首页 OK"
else
  echo "❌ 首页失败 (HTTP $HTTP_CODE)"
  exit 1
fi

echo "🔍 验证投票页..."
HTTP_CODE=$(curl -sI "$BASE_URL/vote.html" --max-time 10 | head -1 | awk '{print $2}')
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ 投票页 OK"
else
  echo "❌ 投票页失败 (HTTP $HTTP_CODE)"
  exit 1
fi

echo ""
echo "=== ✅ 部署并验证完成 ==="
echo "Webapp: $BASE_URL/"
echo "投票页: $BASE_URL/vote.html"
