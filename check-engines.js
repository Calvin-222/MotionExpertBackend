const axios = require('axios');

async function checkRAGEngines() {
  try {
    console.log('🔍 Checking RAG Engines...\n');
    
    // 獲取 RAG Engines 概覽
    const response = await axios.get('http://localhost:3000/api/rag/engines/overview');
    const data = response.data;
    
    if (data.success) {
      console.log('📊 RAG Engines Statistics:');
      console.log('==========================================');
      console.log(`Total Engines: ${data.statistics.totalEngines}`);
      console.log(`User Engines: ${data.statistics.userEngines}`);
      console.log(`System Engines: ${data.statistics.systemEngines}`);
      console.log(`Total Files: ${data.statistics.totalFiles}`);
      console.log(`Active Engines: ${data.statistics.activeEngines}`);
      
      console.log('\n👥 User RAG Engines:');
      console.log('==========================================');
      if (data.engines.user.length > 0) {
        data.engines.user.forEach((engine, index) => {
          console.log(`${index + 1}. Name: ${engine.displayName}`);
          console.log(`   ID: ${engine.id}`);
          console.log(`   User ID: ${engine.userId}`);
          console.log(`   File Count: ${engine.fileCount}`);
          console.log(`   Status: ${engine.status}`);
          console.log(`   Created: ${engine.createTime}`);
          console.log('   ---');
        });
      } else {
        console.log('   No user engines found.');
      }
      
      console.log('\n🔧 System RAG Engines:');
      console.log('==========================================');
      if (data.engines.system.length > 0) {
        data.engines.system.forEach((engine, index) => {
          console.log(`${index + 1}. Name: ${engine.displayName}`);
          console.log(`   ID: ${engine.id}`);
          console.log(`   File Count: ${engine.fileCount}`);
          console.log(`   Status: ${engine.status}`);
          console.log(`   Created: ${engine.createTime}`);
          console.log('   ---');
        });
      } else {
        console.log('   No system engines found.');
      }
      
      console.log('\n🎯 Current Default Engine:');
      console.log('==========================================');
      console.log(`ID: ${data.currentEngine.id}`);
      console.log(`Name: ${data.currentEngine.name}`);
      
    } else {
      console.error('❌ Failed to get RAG engines:', data.error);
    }
    
  } catch (error) {
    console.error('❌ Error checking RAG engines:', error.message);
  }
}

// 執行檢查
checkRAGEngines();