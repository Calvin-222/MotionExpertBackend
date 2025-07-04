# RAG 系統模組化架構

## 概述

原本的 `routes/rag.js` 檔案過於龐大（超過 2000 行），不易維護和閱讀。現在已經重構為模組化的架構，每個模組負責特定的功能。

## 模組結構

```
routes/rag/
├── README.md                 # 本說明文檔
├── index.js                  # 主要匯出檔案
├── config.js                 # 配置與初始化
├── middleware.js             # JWT 認證中間件
├── database.js               # 資料庫操作
├── fileOperations.js         # 檔案上傳與管理
├── queryOperations.js        # RAG 查詢處理
├── engineManagement.js       # RAG Engine 管理
└── MultiUserRAGSystem.js     # 主系統類別
```

## 各模組功能

### 1. `config.js`
- 資料庫連接配置
- Google Cloud 服務初始化
- 常數定義（PROJECT_ID, LOCATION 等）

### 2. `middleware.js`
- JWT Token 認證中間件
- 用戶身份驗證

### 3. `database.js`
- 用戶權限檢查
- 好友系統管理
- RAG Engine 分享
- 檔案名稱映射
- 資料庫 CRUD 操作

### 4. `fileOperations.js`
- 檔案上傳到 RAG Engine
- 檔案刪除
- Google Cloud Storage 操作
- 檔案名稱映射管理

### 5. `queryOperations.js`
- RAG 查詢處理
- 回應格式化
- 查詢結果解析

### 6. `engineManagement.js`
- RAG Engine 創建
- RAG Engine 刪除
- RAG Engine 列舉
- 操作狀態管理

### 7. `MultiUserRAGSystem.js`
- 主系統類別
- 整合所有模組功能
- 提供統一的 API 介面

### 8. `index.js`
- 匯出所有模組
- 統一的對外介面

## 使用方式

在主路由檔案中：

```javascript
const { MultiUserRAGSystem, authenticateToken, config } = require('./rag/');

const ragSystem = new MultiUserRAGSystem();
```

## 優勢

1. **可讀性提升**：每個檔案專注於特定功能，易於理解
2. **維護性增強**：修改特定功能時只需編輯對應模組
3. **測試友好**：可以單獨測試每個模組
4. **擴展性好**：新增功能時可以創建新模組或擴展現有模組
5. **功能隔離**：各模組職責明確，減少耦合

## 向後相容性

所有原有的 API 端點和功能都保持不變，確保：
- 前端不需要任何修改
- 現有測試繼續有效
- 資料庫結構保持一致

## 測試

運行資料庫整合測試：
```bash
npx jest tests/rag-upload.test.js
```

測試 API 端點：
```bash
curl http://localhost:3000/api/rag/test
```

## 未來改進

1. 為每個模組添加單元測試
2. 增加錯誤處理的統一性
3. 優化資料庫查詢性能
4. 增加更多的配置選項
