# RAG 系統測試腳本整理

## 📁 測試文件狀態

### 🟢 保留文件
- `final_rag_system_test.js` - **最終綜合測試文件**
- `debug_rag_system.js` - **調試用測試文件**

### 🔴 舊測試文件 (可考慮刪除)
- `test_gemini_model.js` - 功能已整合至 `final_rag_system_test.js`
- `test_gemini_quick.js` - 功能已整合至 `final_rag_system_test.js`
- `test_delete_specific.js` - 刪除功能測試，功能已整合
- `test_google_ai_studio.js` - AI Studio 測試，功能已整合
- `tests/test_files/test_complete_system.js` - 完整系統測試，功能已整合

## 🚀 推薦使用

### 日常測試
```bash
node final_rag_system_test.js
```

### 調試模式
```bash
node debug_rag_system.js
```

## 📊 測試覆蓋範圍

`final_rag_system_test.js` 包含所有核心功能測試：
- ✅ 用戶註冊/登入
- ✅ RAG 引擎創建
- ✅ 文件上傳 (FormData)
- ✅ 文件列表
- ✅ 引擎列表
- ✅ RAG 查詢
- ✅ Gemini 模型測試
- ✅ 清理測試

## 🎯 建議
1. 主要使用 `final_rag_system_test.js` 進行系統驗證
2. 保留 `debug_rag_system.js` 用於問題診斷
3. 其他測試文件可以歸檔或刪除
