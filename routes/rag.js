const express = require('express');
const router = express.Router();
const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const axios = require('axios');

// 初始化 Google Cloud Storage
const storage = new Storage({
  projectId: 'motionexpaiweb',
  keyFilename: './motionexpaiweb-471ee0d1e3d6.json'
});

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
const BUCKET_NAME = 'motionexpert-rag-documents';

// 動態 RAG Engine 管理
let CURRENT_CORPUS_ID = '2305843009213693952';
let CURRENT_CORPUS_NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/ragCorpora/${CURRENT_CORPUS_ID}`;

class MultiUserRAGSystem {
  constructor() {
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    this.bucketName = BUCKET_NAME;
    this.auth = auth;
    this.storage = storage;
    this.vertexAI = vertexAI;
  }

  // 🏗️ 為用戶創建專屬的 RAG Engine（完全修正版）
  async createUserRAGEngine(userId, displayName = null) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const createUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;
      
      const corpusData = {
        displayName: displayName || `${userId}'s Knowledge Base`,
        description: `Dedicated RAG corpus for user ${userId} - Created ${new Date().toISOString()}`,
      };

      console.log(`Creating RAG Engine for user ${userId}...`);
      console.log('Request URL:', createUrl);
      console.log('Request payload:', JSON.stringify(corpusData, null, 2));

      const response = await axios.post(createUrl, corpusData, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Create response received:', JSON.stringify(response.data, null, 2));

      // 檢查是否是異步操作
      if (response.data.name && response.data.name.includes('/operations/')) {
        console.log('RAG Engine creation is an async operation, waiting for completion...');
        
        // 等待操作完成
        const operationResult = await this.waitForOperation(response.data.name);
        
        if (!operationResult.success) {
          throw new Error(`Operation failed: ${operationResult.error}`);
        }

        // 從操作結果中獲取實際的 corpus
        const corpusName = operationResult.result?.name;
        if (!corpusName) {
          throw new Error('No corpus name found in operation result');
        }

        const corpusId = corpusName.split('/').pop();

        console.log(`✅ RAG Engine created for user ${userId}`);
        console.log('Full corpus name:', corpusName);
        console.log('Corpus ID:', corpusId);

        return {
          success: true,
          userId: userId,
          corpusId: corpusId,
          corpusName: corpusName,
          displayName: operationResult.result?.displayName || corpusData.displayName,
          bucketPath: `user-data/${userId}`,
          createdAt: new Date().toISOString(),
          operationId: response.data.name.split('/').pop()
        };
      } else {
        // 同步創建（如果有的話）
        const corpusName = response.data.name;
        const corpusId = corpusName.split('/').pop();

        return {
          success: true,
          userId: userId,
          corpusId: corpusId,
          corpusName: corpusName,
          displayName: response.data.displayName,
          bucketPath: `user-data/${userId}`,
          createdAt: new Date().toISOString()
        };
      }

    } catch (error) {
      console.error(`❌ Failed to create RAG Engine for user ${userId}:`);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      return {
        success: false,
        error: error.response?.data || error.message,
        details: {
          status: error.response?.status,
          message: error.message
        }
      };
    }
  }

  // 🕐 等待操作完成
  async waitForOperation(operationName, maxWaitTime = 300000) {
    try {
      const authClient = await this.auth.getClient();
      const startTime = Date.now();
      
      console.log(`⏳ Waiting for operation to complete: ${operationName}`);
      
      while (Date.now() - startTime < maxWaitTime) {
        const accessToken = await authClient.getAccessToken();
        
        const statusUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${operationName}`;
        
        const response = await axios.get(statusUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken.token}`,
            'Content-Type': 'application/json'
          }
        });

        const operation = response.data;
        console.log(`Operation status: done=${operation.done}, name=${operation.name}`);
        
        if (operation.done) {
          if (operation.error) {
            console.error('Operation failed:', operation.error);
            return {
              success: false,
              error: operation.error
            };
          }
          
          console.log('✅ Operation completed successfully');
          return {
            success: true,
            result: operation.response,
            metadata: operation.metadata
          };
        }
        
        // 等待 10 秒後重試
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      return {
        success: false,
        error: 'Operation timeout'
      };
      
    } catch (error) {
      console.error('Error waiting for operation:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 📋 列出所有 RAG Engines
  async listAllRAGEngines() {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const listUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}/ragCorpora`;
      
      console.log('Listing RAG engines from:', listUrl);

      const response = await axios.get(listUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      const corpora = response.data.ragCorpora || [];
      
      console.log(`Found ${corpora.length} RAG engines`);

      const enginesWithDetails = await Promise.all(corpora.map(async (corpus) => {
        const details = await this.getEngineFileCount(corpus.name);
        const corpusId = corpus.name.split('/').pop();
        
        return {
          id: corpusId,
          fullName: corpus.name,
          displayName: corpus.displayName,
          description: corpus.description,
          createTime: corpus.createTime,
          updateTime: corpus.updateTime,
          fileCount: details.fileCount,
          status: details.status,
          isUserEngine: corpus.displayName?.includes('Knowledge Base') || corpus.description?.includes('user '),
          userId: this.extractUserIdFromEngine(corpus)
        };
      }));

      return {
        success: true,
        totalEngines: corpora.length,
        userEngines: enginesWithDetails.filter(e => e.isUserEngine),
        systemEngines: enginesWithDetails.filter(e => !e.isUserEngine),
        allEngines: enginesWithDetails
      };

    } catch (error) {
      console.error('List RAG engines error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // 🔍 從 Engine 中提取用戶 ID（改進版）
  extractUserIdFromEngine(corpus) {
    // 嘗試從 description 中提取用戶 ID
    if (corpus.description) {
      const match = corpus.description.match(/user ([^\s-]+)/i);
      if (match) {
        return match[1];
      }
    }
    
    // 嘗試從 displayName 中提取用戶 ID
    if (corpus.displayName) {
      const match = corpus.displayName.match(/^([^']+)'s Knowledge Base/);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  // 🔍 獲取 Engine 文件數量
  async getEngineFileCount(corpusName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;
      
      const response = await axios.get(filesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      const files = response.data.ragFiles || [];
      
      return {
        fileCount: files.length,
        status: files.length > 0 ? 'active' : 'empty',
        recentFiles: files.slice(-3)
      };

    } catch (error) {
      console.error(`Error getting file count for ${corpusName}:`, error.message);
      return {
        fileCount: 0,
        status: 'unknown',
        recentFiles: []
      };
    }
  }

  // 📋 獲取用戶文檔列表
  async getUserDocuments(corpusName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const filesUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles`;
      
      console.log(`Getting documents from: ${filesUrl}`);

      const response = await axios.get(filesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      const files = response.data.ragFiles || [];
      
      const formattedFiles = files.map(file => {
        const fileId = file.name.split('/').pop();
        return {
          id: fileId,
          name: file.displayName || fileId,
          fullName: file.name,
          createTime: file.createTime,
          updateTime: file.updateTime,
          sizeBytes: file.sizeBytes,
          ragFileType: file.ragFileType
        };
      });

      return {
        success: true,
        files: formattedFiles,
        totalFiles: formattedFiles.length
      };

    } catch (error) {
      console.error(`Error getting documents from ${corpusName}:`, error.message);
      return {
        success: false,
        error: error.message,
        files: []
      };
    }
  }

  // 🗑️ 刪除用戶文檔（改進版）
  async deleteUserDocument(userId, ragFileId) {
    try {
      const userEngines = await this.listAllRAGEngines();
      const userEngine = userEngines.userEngines.find(e => 
        e.userId === userId || 
        e.displayName?.includes(`${userId}'s Knowledge Base`) ||
        e.description?.includes(`user ${userId}`)
      );
      
      if (!userEngine) {
        return {
          success: false,
          error: 'User RAG engine not found'
        };
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const deleteUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${userEngine.fullName}/ragFiles/${ragFileId}`;
      
      console.log(`Deleting document: ${deleteUrl}`);

      await axios.delete(deleteUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        message: 'Document deleted successfully',
        documentId: ragFileId,
        userId: userId
      };

    } catch (error) {
      console.error(`Error deleting document ${ragFileId} for user ${userId}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // 📤 用戶文檔上傳到專屬 RAG（改進版）
  async uploadToUserRAG(userId, file, fileName) {
    try {
      console.log(`📤 Starting upload process for user ${userId}, file: ${fileName}`);

      // 1. 獲取或創建用戶的 RAG Engine
      let userEngines = await this.listAllRAGEngines();
      if (!userEngines.success) {
        throw new Error(`Failed to list RAG engines: ${JSON.stringify(userEngines.error)}`);
      }

      let userEngine = userEngines.userEngines.find(e => {
        const matchesUserId = e.userId === userId;
        const matchesDisplayName = e.displayName?.includes(`${userId}'s Knowledge Base`);
        const matchesDescription = e.description?.includes(`user ${userId}`);
        
        console.log(`Checking engine ${e.id}: userId=${e.userId}, matchesUserId=${matchesUserId}, matchesDisplayName=${matchesDisplayName}, matchesDescription=${matchesDescription}`);
        
        return matchesUserId || matchesDisplayName || matchesDescription;
      });
      
      if (!userEngine) {
        console.log(`No existing RAG Engine found for user ${userId}, creating new one...`);
        const createResult = await this.createUserRAGEngine(userId);
        if (!createResult.success) {
          throw new Error(`Failed to create user RAG engine: ${JSON.stringify(createResult.error)}`);
        }
        userEngine = {
          id: createResult.corpusId,
          fullName: createResult.corpusName,
          displayName: createResult.displayName,
          userId: userId
        };
        console.log(`✅ Created new RAG Engine: ${userEngine.id}`);
      } else {
        console.log(`✅ Found existing RAG Engine for user ${userId}: ${userEngine.id}`);
      }

      // 2. 上傳文件到用戶專屬路徑
      const timestamp = Date.now();
      const userBucketPath = `user-data/${userId}/${timestamp}-${fileName}`;
      console.log(`📁 Uploading to bucket path: ${userBucketPath}`);
      
      const bucket = this.storage.bucket(this.bucketName);
      
      // 檢查 bucket 是否存在
      try {
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
          console.log(`Creating bucket: ${this.bucketName}`);
          await this.storage.createBucket(this.bucketName, {
            location: this.location,
            storageClass: 'STANDARD'
          });
        }
      } catch (bucketError) {
        console.error('Bucket check/create error:', bucketError.message);
        // 如果 bucket 已存在，繼續執行
      }
      const bucketFile = bucket.file(userBucketPath);
      await bucketFile.save(file, {
        metadata: {
          contentType: 'text/plain',
          metadata: {
            userId: userId,
            originalName: fileName,
            uploadedAt: new Date().toISOString(),
            ragEngine: userEngine.id
          }
        }
      });

      console.log(`✅ File uploaded to Cloud Storage: gs://${this.bucketName}/${userBucketPath}`);

      // 3. 導入到用戶的 RAG Engine
      console.log(`🔄 Importing file to RAG Engine: ${userEngine.fullName}`);
      
      // 驗證 corpus name 格式
      if (userEngine.fullName.includes('/operations/')) {
        console.error('❌ Invalid corpus name - appears to be an operation name');
        throw new Error('RAG Engine creation may not be complete. Please try again later.');
      }
      
      const importResult = await this.importFileToRAG(userEngine.fullName, userBucketPath);

      if (!importResult.success) {
        console.error('Import to RAG failed:', importResult.error);
      } else {
        console.log(`✅ Import operation started: ${importResult.operationId}`);
      }

      return {
        success: true,
        userId: userId,
        fileName: fileName,
        bucketPath: `gs://${this.bucketName}/${userBucketPath}`,
        ragEngine: {
          id: userEngine.id,
          name: userEngine.fullName,
          displayName: userEngine.displayName
        },
        importResult: importResult
      };

    } catch (error) {
      console.error(`❌ Upload to user RAG error (${userId}):`, error);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  // 🔄 導入文件到指定的 RAG Engine（改進版）
  async importFileToRAG(corpusName, filePath) {
    try {
      // 確保 corpusName 不是操作名稱
      if (corpusName.includes('/operations/')) {
        throw new Error(`Invalid corpus name: ${corpusName}. This appears to be an operation name, not a corpus name.`);
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const importUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/${corpusName}/ragFiles:import`;
      
      const importData = {
        importRagFilesConfig: {
          gcsSource: {
            uris: [`gs://${this.bucketName}/${filePath}`]
          },
          ragFileChunkingConfig: {
            chunkSize: 1024,
            chunkOverlap: 200
          }
        }
      };

      console.log(`Importing file to RAG: ${corpusName}`);
      console.log(`Import URL: ${importUrl}`);
      console.log(`File URI: gs://${this.bucketName}/${filePath}`);
      console.log('Import request data:', JSON.stringify(importData, null, 2));

      const response = await axios.post(importUrl, importData, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Import response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        operationName: response.data.name,
        operationId: response.data.name?.split('/').pop() || 'unknown'
      };

    } catch (error) {
      console.error('Import to RAG error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        corpusName: corpusName
      });
      
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // 💬 用戶專屬 RAG 查詢
  async queryUserRAG(userId, question) {
    try {
      const userEngines = await this.listAllRAGEngines();
      const userEngine = userEngines.userEngines.find(e => 
        e.userId === userId || 
        e.displayName?.includes(`${userId}'s Knowledge Base`) ||
        e.description?.includes(`user ${userId}`)
      );
      
      if (!userEngine) {
        return {
          success: false,
          error: 'User RAG engine not found. Please upload some documents first.'
        };
      }

      const generativeModel = this.vertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash-preview-05-20',
      });

      const request = {
        contents: [{
          role: 'user',
          parts: [{
            text: `基於我的個人知識庫，請回答以下問題：

${question}

請確保回答基於我上傳的文檔內容，如果找不到相關信息，請誠實說明。`
          }]
        }],
        tools: [{
          retrieval: {
            vertexRagStore: {
              ragCorpora: [userEngine.fullName],
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
      const answer = this.extractResponseText(result.response);

      return {
        success: true,
        answer: answer,
        question: question,
        userId: userId,
        ragEngine: userEngine.displayName
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 📝 提取回應文本
  extractResponseText(response) {
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
}

const ragSystem = new MultiUserRAGSystem();

// 📋 獲取所有 RAG Engines 概覽
router.get('/engines/overview', async (req, res) => {
  try {
    const result = await ragSystem.listAllRAGEngines();
    if (result.success) {
      const statistics = {
        totalEngines: result.totalEngines,
        userEngines: result.userEngines.length,
        systemEngines: result.systemEngines.length,
        totalFiles: result.allEngines.reduce((sum, engine) => sum + engine.fileCount, 0),
        activeEngines: result.allEngines.filter(e => e.status === 'active').length
      };

      res.json({
        success: true,
        statistics: statistics,
        engines: {
          user: result.userEngines,
          system: result.systemEngines
        },
        currentEngine: {
          id: CURRENT_CORPUS_ID,
          name: CURRENT_CORPUS_NAME
        }
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 👤 用戶專屬文檔上傳
router.post('/users/:userId/upload', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    console.log(`📤 User ${userId} uploading file: ${file.originalname} (${file.size} bytes)`);

    const result = await ragSystem.uploadToUserRAG(userId, file.buffer, file.originalname);

    if (result.success) {
      res.json({
        success: true,
        message: `文檔已成功上傳到您的個人知識庫`,
        data: {
          userId: result.userId,
          fileName: result.fileName,
          bucketPath: result.bucketPath,
          ragEngine: result.ragEngine,
          operationId: result.importResult?.operationId,
          note: 'Document is being processed. It will be available for queries in a few minutes.'
        }
      });
    } else {
      console.error('Upload failed:', result);
      res.status(500).json({
        success: false,
        message: 'Upload failed',
        error: result.error,
        details: result.stack
      });
    }

  } catch (error) {
    console.error('User upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// 💬 用戶專屬 RAG 查詢
router.post('/users/:userId/query', async (req, res) => {
  try {
    const { userId } = req.params;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    console.log(`💬 User ${userId} asking: ${question.substring(0, 50)}...`);

    const result = await ragSystem.queryUserRAG(userId, question);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 📊 用戶 RAG 狀態
router.get('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const allEngines = await ragSystem.listAllRAGEngines();
    const userEngine = allEngines.userEngines.find(e => 
      e.userId === userId || 
      e.displayName?.includes(`${userId}'s Knowledge Base`) ||
      e.description?.includes(`user ${userId}`)
    );
    
    if (!userEngine) {
      res.json({
        success: true,
        hasRAGEngine: false,
        message: 'No personal RAG engine found. Upload a document to create one.',
        userId: userId
      });
    } else {
      res.json({
        success: true,
        hasRAGEngine: true,
        ragEngine: {
          id: userEngine.id,
          displayName: userEngine.displayName,
          fileCount: userEngine.fileCount,
          status: userEngine.status,
          createTime: userEngine.createTime
        },
        userId: userId
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 📋 獲取用戶文檔列表
router.get('/users/:userId/documents', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const allEngines = await ragSystem.listAllRAGEngines();
    const userEngine = allEngines.userEngines.find(e => 
      e.userId === userId || 
      e.displayName?.includes(`${userId}'s Knowledge Base`) ||
      e.description?.includes(`user ${userId}`)
    );
    
    if (!userEngine) {
      return res.json({
        success: true,
        documents: [],
        message: 'No personal RAG engine found.',
        userId: userId
      });
    }

    // 獲取用戶 RAG Engine 中的文檔列表
    const documents = await ragSystem.getUserDocuments(userEngine.fullName);
    
    res.json({
      success: true,
      documents: documents.files || [],
      totalDocuments: documents.files?.length || 0,
      ragEngine: {
        id: userEngine.id,
        displayName: userEngine.displayName
      },
      userId: userId
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🗑️ 刪除用戶文檔
router.delete('/users/:userId/documents/:documentId', async (req, res) => {
  try {
    const { userId, documentId } = req.params;
    
    console.log(`🗑️ User ${userId} deleting document: ${documentId}`);

    const result = await ragSystem.deleteUserDocument(userId, documentId);
    
    if (result.success) {
      res.json({
        success: true,
        message: '文檔已成功刪除',
        documentId: documentId,
        userId: userId
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Failed to delete document',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 操作狀態檢查
router.get('/operation-status/:operationId', async (req, res) => {
  try {
    const { operationId } = req.params;
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    const statusUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/operations/${operationId}`;
    
    const response = await axios.get(statusUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      }
    });

    const operation = response.data;
    let status = operation.done ? 'completed' : 'running';
    
    if (operation.done && operation.error) {
      status = 'failed';
    }

    res.json({
      success: true,
      operationId: operationId,
      status: status,
      done: operation.done || false,
      error: operation.error || null,
      result: operation.response || null,
      metadata: operation.metadata || null,
      recommendations: operation.done 
        ? operation.error 
          ? ['❌ 操作失敗，請檢查錯誤信息', '🔄 嘗試重新上傳文件']
          : ['✅ 處理完成！', '🧪 可以開始測試查詢功能']
        : ['⏳ 操作進行中，請稍候', '🕐 通常需要1-3分鐘完成']
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// 🧪 測試端點
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Multi-User RAG System is running',
    version: '2.0.3',
    features: [
      'Multi-user RAG engines',
      'User-specific document upload',
      'User-specific querying',
      'Document management (list, delete)',
      'System-wide RAG engine management',
      'Auto RAG engine creation',
      'Document isolation per user',
      'Enhanced error handling and logging'
    ],
    endpoints: {
      userUpload: 'POST /api/rag/users/:userId/upload',
      userQuery: 'POST /api/rag/users/:userId/query',
      userStatus: 'GET /api/rag/users/:userId/status',
      userDocuments: 'GET /api/rag/users/:userId/documents',
      deleteDocument: 'DELETE /api/rag/users/:userId/documents/:documentId',
      enginesOverview: 'GET /api/rag/engines/overview',
      operationStatus: 'GET /api/rag/operation-status/:operationId'
    },
    currentSystemEngine: {
      id: CURRENT_CORPUS_ID,
      name: CURRENT_CORPUS_NAME
    }
  });
});

module.exports = router;