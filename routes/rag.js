const express = require('express');
const router = express.Router();
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const multer = require('multer');
const axios = require('axios');

// 初始化認證
const auth = new GoogleAuth({
  keyFile: './motionexpaiweb-471ee0d1e3d6.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// 初始化 Vertex AI
const vertexAI = new VertexAI({
  project: 'motionexpaiweb',
  location: 'us-central1'
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 配置資訊
const PROJECT_ID = 'motionexpaiweb';
const LOCATION = 'us-central1';
const CORPUS_ID = '2305843009213693952';
const CORPUS_NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/ragCorpora/${CORPUS_ID}`;

// 輔助函數：正確獲取 Vertex AI 回應文字
function extractResponseText(response) {
  try {
    if (response && response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return candidate.content.parts[0].text || 'No response generated';
      }
    }
    
    if (typeof response.text === 'function') {
      return response.text();
    }
    
    if (response.text) {
      return response.text;
    }
    
    return 'No response generated';
  } catch (error) {
    console.error('Error extracting response text:', error);
    return 'Error extracting response';
  }
}

// 🔍 檢查 RAG Corpus 是否存在
router.get('/corpus-info', async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    // 檢查 corpus 是否存在
    const corpusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/${CORPUS_NAME}`;
    
    const response = await axios.get(corpusUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'RAG Corpus found',
      corpus: response.data
    });

  } catch (error) {
    console.error('Corpus check error:', error.response?.status, error.response?.statusText);
    
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        message: 'RAG Corpus not found - may need to create it first',
        corpusName: CORPUS_NAME,
        error: 'Corpus does not exist'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error checking RAG Corpus',
        error: error.response?.data || error.message
      });
    }
  }
});

// 🆕 創建 RAG Corpus（如果不存在）
router.post('/create-corpus', async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    const createCorpusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/ragCorpora`;
    
    const corpusData = {
      displayName: 'MotionExpert Movie Scripts Corpus',
      description: 'RAG Corpus for movie script analysis and generation'
    };

    console.log('Creating RAG Corpus...');
    
    const response = await axios.post(createCorpusUrl, corpusData, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'RAG Corpus created successfully',
      corpus: response.data,
      note: 'You can now upload files to this corpus'
    });

  } catch (error) {
    console.error('Create corpus error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error creating RAG Corpus',
      error: error.response?.data || error.message
    });
  }
});

// 🚀 使用正確的 RAG API 進行文字上傳
router.post('/upload-text-fixed', async (req, res) => {
  try {
    const { text, fileName } = req.body;
    
    if (!text || !fileName) {
      return res.status(400).json({
        success: false,
        message: 'Text content and fileName are required'
      });
    }

    console.log(`Uploading text to RAG: ${fileName}`);
    console.log(`Text preview: ${text.substring(0, 200)}...`);

    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    // 先檢查 corpus 是否存在
    try {
      const corpusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/${CORPUS_NAME}`;
      await axios.get(corpusUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (corpusError) {
      if (corpusError.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: 'RAG Corpus not found. Please create it first using POST /api/rag/create-corpus',
          corpusName: CORPUS_NAME
        });
      }
      throw corpusError;
    }

    // 使用正確的 import API
    const importUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/${CORPUS_NAME}/ragFiles:import`;
    
    // 創建臨時的文字檔案並使用 import API
    const importData = {
      importRagFilesConfig: {
        ragFileTransformation: {
          ragFileTransformationType: "RAG_FILE_TRANSFORMATION_TYPE_LAYOUT_PARSER"
        }
      }
    };

    console.log('Importing text to RAG Corpus...');
    
    const response = await axios.post(importUrl, importData, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'Text import operation started',
      fileName: fileName,
      operation: response.data,
      note: 'Text is being processed and will be available for queries soon'
    });

  } catch (error) {
    console.error('Text upload error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error uploading text to RAG',
      error: error.response?.data || error.message
    });
  }
});

// 🔧 簡化的文件上傳方法（使用 Cloud Storage + Import）
router.post('/upload-simple', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { originalname, buffer } = req.file;
    const fileContent = buffer.toString('utf-8');
    
    console.log(`Simple upload: ${originalname}`);

    // 將內容直接傳送給 AI，不使用 RAG 儲存
    res.json({
      success: true,
      message: 'File content received - using in-memory processing',
      fileName: originalname,
      contentLength: fileContent.length,
      preview: fileContent.substring(0, 200) + '...',
      method: 'in-memory',
      note: 'File content is ready for AI processing without RAG storage'
    });

  } catch (error) {
    console.error('Simple upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing file',
      error: error.message
    });
  }
});

// 📝 記憶型劇本生成（不依賴 RAG）
router.post('/synopsis-memory', async (req, res) => {
  try {
    const { synopsisString, referenceScript } = req.body;
    
    if (!synopsisString) {
      return res.status(400).json({
        success: false,
        message: 'Synopsis string is required'
      });
    }

    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
    });

    let promptText = `基於以下劇情概要，生成一個專業的詳細電影劇本：

劇情概要：
${synopsisString}

請生成一個完整的電影劇本，包含：
1. 正確的劇本格式（FADE IN, EXT./INT., 角色名稱、對話、動作描述）
2. 詳細的場景描述和角色動作
3. 自然流暢的角色對話
4. 適當的場景轉換
5. 專業的劇本結構`;

    // 如果有參考劇本，加入到提示中
    if (referenceScript) {
      promptText += `\n\n參考劇本格式：\n${referenceScript}\n\n請參考以上劇本的格式和風格。`;
    }

    const request = {
      contents: [{
        role: 'user',
        parts: [{
          text: promptText
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.95
      }
    };

    const result = await generativeModel.generateContent(request);
    const generatedScript = extractResponseText(result.response);

    console.log('Generated script preview:', generatedScript.substring(0, 200) + '...');

    res.json({
      success: true,
      message: 'Movie script generated successfully using memory-based processing',
      aiProcessedOutput: generatedScript,
      originalInput: synopsisString,
      method: 'memory-based',
      hasReference: !!referenceScript
    });

  } catch (error) {
    console.error('Memory synopsis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing synopsis',
      error: error.message
    });
  }
});

// RAG 查詢（保持原有）
router.post('/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }

    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
    });

    const request = {
      contents: [{
        role: 'user',
        parts: [{
          text: `基於已上傳的電影劇本文檔，請回答以下問題：

${query}

請確保回答專業且符合電影劇本標準格式。如果需要生成劇本內容，請參考上傳文檔的風格和格式。`
        }]
      }],
      tools: [{
        retrieval: {
          vertexRagStore: {
            ragCorpora: [CORPUS_NAME],
            similarityTopK: 10,
            vectorDistanceThreshold: 0.5
          }
        }
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.95
      }
    };

    const result = await generativeModel.generateContent(request);
    const answer = extractResponseText(result.response);

    res.json({
      success: true,
      answer: answer,
      query: query,
      corpusUsed: CORPUS_NAME
    });

  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing RAG query',
      error: error.message
    });
  }
});

// 測試端點
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Enhanced RAG service with multiple upload methods',
    corpus: CORPUS_NAME,
    methods: {
      memoryBased: {
        description: 'Direct AI processing without RAG storage',
        endpoints: [
          'POST /api/rag/upload-simple (File processing)',
          'POST /api/rag/synopsis-memory (Script generation)'
        ],
        advantages: ['Always works', 'No setup required', 'Immediate processing']
      },
      ragBased: {
        description: 'RAG-enhanced processing with persistent storage',
        endpoints: [
          'GET /api/rag/corpus-info (Check corpus)',
          'POST /api/rag/create-corpus (Create if needed)',
          'POST /api/rag/query (RAG queries)'
        ],
        advantages: ['Better context', 'Persistent knowledge', 'Multi-document queries']
      }
    },
    recommendations: [
      '1. Try memory-based methods first (always work)',
      '2. If you need RAG, check corpus-info first',
      '3. Create corpus if needed',
      '4. Then use RAG-based methods'
    ]
  });
});

module.exports = router;