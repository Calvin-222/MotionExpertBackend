const axios = require("axios");
const { auth, vertexAI, PROJECT_ID, LOCATION } = require("./config");

class QueryOperations {
  constructor() {
    this.auth = auth;
    this.vertexAI = vertexAI;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    // 添加速率限制
    this.lastApiCall = 0;
    this.minApiInterval = 2000; // 2秒間隔
  }

  // 添加速率限制方法
  async rateLimitedCall(apiCall) {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;

    if (timeSinceLastCall < this.minApiInterval) {
      const waitTime = this.minApiInterval - timeSinceLastCall;
      console.log(`Rate limiting: waiting ${waitTime}ms before API call`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastApiCall = Date.now();
    return await apiCall();
  }

  // 💬 用戶專屬 RAG 查詢（修正版 - 使用資料庫權限檢查）
  async queryUserRAG(
    userId,
    question,
    ragId = null,
    canUserAccessRAG,
    getRAGEngineFromDB
  ) {
    try {
      let targetRagId = ragId;

      if (!targetRagId) {
        return {
          success: false,
          error: "ragId is required for querying",
        };
      }

      // 檢查用戶權限
      const hasAccess = await canUserAccessRAG(userId, targetRagId);
      if (!hasAccess) {
        return {
          success: false,
          error: "您沒有權限查詢此 RAG Engine",
        };
      }

      // 獲取 Engine 信息
      const engineResult = await getRAGEngineFromDB(targetRagId);
      if (!engineResult.success) {
        return {
          success: false,
          error: "找不到指定的 RAG Engine",
        };
      }

      const corpusName = `projects/${this.projectId}/locations/${this.location}/ragCorpora/${targetRagId}`;

      console.log(
        `💬 User ${userId} querying RAG ${targetRagId}: ${question.substring(
          0,
          50
        )}...`
      );

      const result = await this.querySpecificRAG(
        corpusName,
        question,
        userId,
        engineResult.ragEngine.ragname
      );

      if (result.success) {
        return {
          success: true,
          question: question,
          answer: result.answer,
          ragEngine: {
            id: targetRagId,
            name: engineResult.ragEngine.ragname,
            corpusName: corpusName,
          },
          sources: result.sources || [],
          responseTime: result.responseTime,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          error: result.error,
          question: question,
        };
      }
    } catch (error) {
      console.error(`Query error for user ${userId}:`, error);
      return {
        success: false,
        error: error.message,
        question: question,
      };
    }
  }

  // 💬 查詢特定 RAG Engine
  async querySpecificRAG(corpusName, question, userId, fileName) {
    try {
      const startTime = Date.now();

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const queryUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}:retrieveContexts`;

      // 使用更簡化的查詢格式
      const queryRequest = {
        vertexRagStore: {
          ragCorpora: [corpusName],
        },
        query: {
          text: question,
        },
      };

      console.log(`💬 Querying RAG: ${corpusName}`);
      console.log("Query request:", JSON.stringify(queryRequest, null, 2));

      const response = await axios.post(queryUrl, queryRequest, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("RAG query response received");

      const contexts = response.data.contexts || [];
      const sources = contexts.map((context, index) => ({
        content: context.text || "No content",
        source: fileName || `Document ${index + 1}`,
        relevance: context.distance || 0,
      }));

      // 使用 Vertex AI 生成回答
      const generativeModel = this.vertexAI.preview.getGenerativeModel({
        model: "gemini-1.5-flash-preview-0514",
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.1,
          topP: 0.95,
        },
      });

      const contextText = sources.map((s) => s.content).join("\n\n");
      const prompt = `Based on the following context, answer the question comprehensively and accurately. If the context doesn't contain enough information to answer the question, say so clearly.

Context:
${contextText}

Question: ${question}

Answer:`;

      const result = await generativeModel.generateContent(prompt);
      const responseText = this.extractResponseText(result);

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        answer: responseText,
        sources: sources,
        responseTime: `${responseTime}ms`,
        contextCount: contexts.length,
      };
    } catch (error) {
      console.error("Specific RAG query error:", error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  // 📝 提取回應文本
  extractResponseText(response) {
    try {
      if (response.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.response.candidates[0].content.parts[0].text;
      }

      if (response.response?.text) {
        return response.response.text;
      }

      if (typeof response.response === "string") {
        return response.response;
      }

      console.warn("Unexpected response structure:", response);
      return "抱歉，無法解析回應內容";
    } catch (error) {
      console.error("Error extracting response text:", error);
      return "回應解析錯誤";
    }
  }
}

module.exports = QueryOperations;
