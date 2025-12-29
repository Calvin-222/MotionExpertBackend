#!/bin/bash

echo "🧹 完全清理伺服器，準備重新部署..."
echo "=========================================="

# 1. 停止所有服務
echo "📋 步驟 1: 停止所有服務..."
pm2 stop all 2>/dev/null || echo "沒有運行中的 PM2 進程"
pm2 delete all 2>/dev/null || echo "沒有 PM2 進程需要刪除"
pm2 save
sudo systemctl stop apache2

# 2. 清理應用目錄
echo "📋 步驟 2: 清理應用目錄..."
sudo rm -rf /opt/motionexpert
sudo rm -rf /var/www/html/*

# 3. 清理 Apache 配置
echo "📋 步驟 3: 重置 Apache 配置..."
sudo a2dissite motionexpert 2>/dev/null || echo "motionexpert site 已停用"
sudo a2ensite 000-default 2>/dev/null || echo "default site 已啟用"
sudo rm -f /etc/apache2/sites-available/motionexpert.conf

# 4. 清理 home 目錄中的所有舊檔案
echo "📋 步驟 4: 清理 home 目錄..."
cd /home/admin
rm -rf MotionExpertBackend/
rm -rf lab-spa/
rm -f *.sh
rm -f *.zip
rm -f *.md
rm -f deploy.sh
rm -f startup-script-complete-new.sh
rm -f cleanup-server.sh
rm -f server-deploy-commands.sh
rm -f DEPLOYMENT_GUIDE.md
rm -f QUICK_COMMANDS.md
rm -f clean-server.sh

# 5. 重新創建預設 Apache 頁面
echo "📋 步驟 5: 重置 Apache 預設頁面..."
sudo systemctl start apache2
sudo systemctl reload apache2

echo "✅ 伺服器清理完成！"
echo ""
echo "📦 現在可以上傳新的部署包"
echo "建議執行步驟："
echo "1. 上傳新的 ZIP 檔案到 /home/admin"
echo "2. 解壓縮: unzip MotionExpert-Deploy-*.zip"
echo "3. 執行部署: chmod +x deploy-new.sh && sudo ./deploy-new.sh"
