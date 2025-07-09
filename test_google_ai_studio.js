const axios = require('axios');

async function testGoogleAIStudio() {
  console.log('🧪 測試 Google AI Studio API...');
  
  try {
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;
    
    const generateRequest = {
      contents: [{
        role: "user",
        parts: [{
          text: "請回答：什麼是人工智能？"
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 1024,
      }
    };
    
    console.log('🔗 Generate URL:', generateUrl);
    console.log('📦 Request payload:', JSON.stringify(generateRequest, null, 2));
    
    // 先嘗試使用服務帳戶認證
    const { auth } = require('./routes/rag/config');
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    
    console.log('🔑 Using service account authentication...');
    
    const response = await axios.post(generateUrl, generateRequest, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
    
    console.log('✅ Google AI Studio API 調用成功！');
    console.log('📨 Response:', JSON.stringify(response.data, null, 2));
    
    // 提取答案
    if (response.data.candidates && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const answer = candidate.content.parts[0].text;
        console.log('🎯 生成的答案:', answer);
      }
    }
    
  } catch (error) {
    console.error('❌ API 調用失敗:');
    console.error('📍 Error message:', error.message);
    console.error('📍 Status code:', error.response?.status);
    console.error('📍 Response data:', JSON.stringify(error.response?.data, null, 2));
    
    // 如果認證失敗，建議設定 API key
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('💡 建議：設定 GOOGLE_AI_API_KEY 環境變數');
      console.log('   可到 https://aistudio.google.com/app/apikey 申請 API key');
    }
  }
}

testGoogleAIStudio();
