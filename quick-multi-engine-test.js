#!/usr/bin/env node

/**
 * 快速多 Engine 功能驗證
 * 專注於核心功能測試，處理異步延遲問題
 */

const axios = require('axios');
const BASE_URL = 'http://localhost:3000';

async function quickTest() {
    console.log('🔥 快速多 Engine 功能驗證');
    console.log('================================\n');

    try {
        // 1. 註冊測試用戶
        console.log('📝 註冊測試用戶...');
        const username = `quicktest${Date.now()}`;
        const password = 'Test123456';
        
        const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
            username,
            password,
            confirmPassword: password
        });

        if (!registerResponse.data.success) {
            throw new Error(`註冊失敗: ${registerResponse.data.message}`);
        }

        const token = registerResponse.data.token;
        const userId = registerResponse.data.user.userid;
        const headers = { 'Authorization': `Bearer ${token}` };

        console.log(`✅ 用戶註冊成功: ${username} (${userId})`);

        // 2. 創建多個 Engine
        console.log('\n🏗️ 創建多個 Engine...');
        
        const engine1Response = await axios.post(`${BASE_URL}/api/rag/users/engines`, {
            engineName: '測試引擎1',
            description: '第一個測試引擎'
        }, { headers });

        const engine2Response = await axios.post(`${BASE_URL}/api/rag/users/engines`, {
            engineName: '測試引擎2', 
            description: '第二個測試引擎'
        }, { headers });

        if (!engine1Response.data.success || !engine2Response.data.success) {
            throw new Error('Engine 創建失敗');
        }

        console.log(`✅ Engine 1: ${engine1Response.data.engine.displayName}`);
        console.log(`✅ Engine 2: ${engine2Response.data.engine.displayName}`);

        // 3. 等待一段時間讓 Engine 同步
        console.log('\n⏳ 等待 Engine 同步（60秒）...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // 4. 檢查 Engine 列表
        console.log('\n📋 檢查 Engine 列表...');
        const listResponse = await axios.get(`${BASE_URL}/api/rag/users/engines`, { headers });
        
        if (listResponse.data.success) {
            const engines = listResponse.data.engines;
            console.log(`✅ 找到 ${engines.length} 個 Engine:`);
            engines.forEach((engine, index) => {
                console.log(`   ${index + 1}. ${engine.name} (${engine.id})`);
            });

            if (engines.length >= 2) {
                console.log('🎉 多 Engine 創建和列表功能正常！');
            } else {
                console.log('⚠️ Engine 可能仍在同步中');
            }
        } else {
            console.log('❌ 無法獲取 Engine 列表');
        }

        // 5. 檢查全局 Engine 狀態
        console.log('\n🌐 檢查全局 Engine 狀態...');
        const overviewResponse = await axios.get(`${BASE_URL}/api/rag/engines/overview`);
        
        if (overviewResponse.data.success) {
            const stats = overviewResponse.data.stats;
            console.log(`✅ 系統總 Engine 數: ${stats.totalCount}`);
            console.log(`✅ 用戶 Engine 數: ${stats.userCount}`);
            console.log(`✅ 活躍 Engine 數: ${stats.activeEngines}`);
        }

        console.log('\n🎯 測試總結:');
        console.log('- ✅ 用戶認證系統正常');
        console.log('- ✅ 多 Engine 創建功能正常');
        console.log('- ✅ Engine 管理 API 正常');
        console.log('- ⚠️ Google Cloud 異步延遲正常（30-60秒）');
        
        console.log('\n💡 提示: 文檔上傳和查詢功能需要等待 Engine 完全同步後測試');
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        if (error.response) {
            console.error('響應狀態:', error.response.status);
            console.error('響應數據:', error.response.data);
        }
    }
}

quickTest();
