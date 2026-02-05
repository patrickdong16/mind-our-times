#!/bin/bash
# Mind Our Times — 部署脚本
# 从 workspace 根目录运行：bash mind-our-times/deploy.sh

set -e
ENVID="thoughts-rador26-2f3u8ht52110fab"
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

echo "=== 部署完成 ==="
echo "Webapp: https://thoughts-rador26-2f3u8ht52110fab.ap-shanghai.app.tcloudbase.com/"
echo "投票页: https://thoughts-rador26-2f3u8ht52110fab.ap-shanghai.app.tcloudbase.com/vote.html"
