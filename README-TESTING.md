# MotionExpert Backend 測試系統使用指南

## 🚀 快速開始

### 1. 啟動伺服器
```bash
npm start
```

### 2. 運行完整自動化測試
```bash
node motion-expert-test.js
```

## 📋 可用的測試命令

### 主要測試
```bash
# 完整系統自動化測試（推薦）
node motion-expert-test.js

# RAG 引擎狀態檢查
node check-engines.js
```

## 🔧 系統功能狀態

### ✅ 正常運行的功能

- **基礎 API 端點**: `/api/health`, `/api/status`, `/api/test`
- **RAG 引擎管理**: `/api/rag/engines/overview`, `/api/rag/test`
- **用戶認證**: `/api/auth/register`, `/api/auth/login`, `/api/auth/verify`
- **用戶 RAG 功能**: 
  - `/api/rag/users/status` - 查詢用戶 RAG 狀態
  - `/api/rag/users/upload` - 文檔上傳到用戶專屬 Engine
  - `/api/rag/users/query` - 智能文檔查詢
  - `/api/rag/users/documents` - 獲取用戶文檔列表
- **Vertex AI 生成**: `/api/generate`, `/api/synopsis`
- **模型信息**: `/api/model-info`

### 🎯 核心功能特色

- **一用戶一 RAG Engine**: 每個用戶有專屬的知識庫引擎
- **多文件上傳**: 一個引擎可以存儲多個文檔
- **智能查詢**: 基於 Vertex AI 的檢索增強生成
- **用戶隔離**: 每個用戶的資料完全隔離

## 📊 測試結果說明

### 成功率標準
- **90%+ = 優秀**: 系統運行良好
- **80-90% = 良好**: 基本功能正常
- **70-80% = 一般**: 需要關注
- **<70% = 需要修復**: 存在重要問題

### 常見測試結果
```
✅ Home Page: 主頁正常 (200)
✅ RAG Overview: RAG 系統正常，總引擎數: 13
✅ User Registration: 用戶註冊成功
✅ Basic Generation: Vertex AI 基礎生成成功
```

## 🔍 故障排除

### 如果測試失敗

1. **檢查伺服器狀態**
   ```bash
   # 確保伺服器在運行
   curl http://localhost:3000/
   ```

2. **重新啟動伺服器**
   ```bash
   # 停止伺服器 (Ctrl+C)
   # 重新啟動
   npm start
   ```

3. **檢查端點可用性**
   ```bash
   # 測試健康檢查
   curl http://localhost:3000/api/health
   
   # 測試 RAG 概覽
   curl http://localhost:3000/api/rag/engines/overview
   ```

### 常見錯誤及解決方案

#### 錯誤: "Cannot read properties of undefined"
- **原因**: API 回應結構變化
- **解決**: 重新啟動伺服器，確保使用最新代碼

#### 錯誤: "404 Not Found"
- **原因**: 端點未實現或路由配置問題
- **解決**: 檢查 `routes/index.js` 和 `routes/rag.js` 配置

#### 錯誤: "Database connection failed"
- **原因**: 資料庫連接問題
- **解決**: 檢查資料庫配置和網路連接

## 📁 測試文件說明

### 主要測試文件

- `motion-expert-test.js`: 完整系統自動化測試（推薦使用）
- `check-engines.js`: RAG 引擎狀態檢查

## 🎯 系統監控

### 定期檢查項目

1. **每日**: 運行 `node check-engines.js`
2. **每週**: 運行 `node motion-expert-test.js`
3. **部署前**: 運行完整測試套件

### 關鍵指標

- RAG 引擎數量和狀態
- 用戶註冊/登入成功率
- Vertex AI 生成成功率
- API 回應時間

## 📞 技術支援

如果遇到問題：

1. 檢查伺服器日誌輸出
2. 運行診斷測試
3. 查看測試結果摘要
4. 檢查網路和資料庫連接

---

**最後更新**: 2025年7月2日  
**版本**: 2.0.4 - 完整功能版
**功能**: 一用戶一 RAG Engine，多文件上傳完整實現
