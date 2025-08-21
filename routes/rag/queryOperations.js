const axios = require("axios");
const { auth, vertexAI, PROJECT_ID, LOCATION } = require("./config");
const { GoogleGenAI } = require("@google/genai");

class QueryOperations {
  constructor() {
    this.auth = auth;
    this.vertexAI = vertexAI;
    this.projectId = PROJECT_ID;
    this.location = LOCATION;
    // 添加速率限制
    this.lastApiCall = 0;
    this.minApiInterval = 2000; // 2秒間隔

    // 初始化 Google GenAI SDK for Vertex AI
    this.genAI = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: LOCATION,
      googleAuth: auth,
    });
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

  async queryUserRAG(userId, question, ragId = null, getRAGEngineFromDB) {
    try {
      const targetRagId = ragId;

      if (!targetRagId) {
        return {
          success: false,
          error: "RAG ID is required",
        };
      }

      // 從資料庫獲取 RAG Engine 信息
      const engineResult = await getRAGEngineFromDB(targetRagId);
      console.log(
        engineResult.success ? "RAG Engine found" : "RAG Engine not found"
      );
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

  // 💬 查詢特定 RAG Engine - 添加重試機制
  async querySpecificRAG(corpusName, question, userId, fileName) {
    try {
      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const queryUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}:retrieveContexts`;

      const queryRequest = {
        vertexRagStore: {
          ragCorpora: [corpusName],
        },
        query: {
          text: question,
        },
      };

      console.log(`🔗 Query URL: ${queryUrl}`);
      console.log(`📦 Query Request:`, JSON.stringify(queryRequest, null, 2));

      // 重試機制：最多重試 3 次
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔄 Query attempt ${attempt}/3...`);

          const response = await axios.post(queryUrl, queryRequest, {
            headers: {
              Authorization: `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            timeout: 30000,
          });

          console.log(`✅ Query successful on attempt ${attempt}`);
          console.log(`📨 Response:`, JSON.stringify(response.data, null, 2));

          const contexts = response.data.contexts?.contexts || [];

          if (contexts.length > 0) {
            // 🆕 如果有檢索到相關內容，使用生成式 AI 來產生答案
            console.log(
              `🤖 Generating AI answer based on ${contexts.length} retrieved contexts...`
            );
            const aiAnswer = await this.generateAnswerFromContexts(
              question,
              contexts
            );

            return {
              success: true,
              answer: aiAnswer.success
                ? aiAnswer.answer
                : "基於您上傳的文檔內容找到相關信息，但生成答案時出現問題。",
              sources: { contexts: contexts },
              rawResponse: response.data,
              aiGenerationDetails: aiAnswer,
            };
          } else {
            return {
              success: true,
              answer: "抱歉，在您的文檔中沒有找到相關信息。",
              sources: { contexts: [] },
              rawResponse: response.data,
            };
          }
        } catch (error) {
          lastError = error;
          console.error(
            `❌ Query attempt ${attempt} failed:`,
            error.response?.data
          );

          // 如果是 "Invalid rag corpus ID" 錯誤，可能是 corpus 還沒完全準備好
          if (
            error.response?.data?.error?.message?.includes(
              "Invalid rag corpus ID"
            )
          ) {
            console.log(
              `⚠️ Corpus might not be ready yet, waiting before retry...`
            );
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 30000)); // 等待 30 秒
            }
            continue;
          }

          // 其他錯誤，短暫等待後重試
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待 5 秒
          }
        }
      }

      // 所有重試都失敗
      console.error(`❌ All query attempts failed`);
      return {
        success: false,
        error:
          lastError?.response?.data?.error ||
          lastError?.message ||
          "Query failed after multiple attempts",
        statusCode: lastError?.response?.status,
        corpusName: corpusName,
        suggestion: "RAG Corpus 可能還在初始化中，請稍後再試",
      };
    } catch (error) {
      console.error(`❌ Query operation failed:`, error);
      return {
        success: false,
        error: error.message,
        corpusName: corpusName,
      };
    }
  }

  // 💬 RAG Engine 查詢方法 - 修正版
  async queryRAGEngine(corpusName, question, userId, fileName = null) {
    try {
      console.log(`💬 === RAG ENGINE QUERY ===`);
      console.log(`🏛️ Corpus Name: ${corpusName}`);
      console.log(`❓ Question: ${question.substring(0, 100)}...`);
      console.log(`👤 User ID: ${userId}`);

      if (!corpusName || corpusName.includes("undefined")) {
        throw new Error("Invalid corpus name provided");
      }

      const authClient = await this.auth.getClient();
      const accessToken = await authClient.getAccessToken();

      const queryUrl = `https://${this.location}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${this.location}:retrieveContexts`;

      const queryRequest = {
        vertexRagStore: {
          ragCorpora: [corpusName],
        },
        query: {
          text: question,
        },
      };

      console.log(`📤 Sending query request...`);
      const response = await axios.post(queryUrl, queryRequest, {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      console.log(`✅ Query successful`);
      const contexts = response.data.contexts?.contexts || [];

      if (contexts.length > 0) {
        console.log(
          `🤖 Generating AI answer based on ${contexts.length} retrieved contexts...`
        );
        const aiAnswer = await this.generateAnswerFromContexts(
          question,
          contexts
        );

        return {
          success: true,
          answer: aiAnswer.success
            ? aiAnswer.answer
            : "基於您上傳的文檔內容找到相關信息，但生成答案時出現問題。",
          sources: { contexts: contexts },
          rawResponse: response.data,
          aiGenerationDetails: aiAnswer,
        };
      } else {
        return {
          success: true,
          answer: "抱歉，在您的文檔中沒有找到相關信息。",
          sources: { contexts: [] },
          rawResponse: response.data,
        };
      }
    } catch (error) {
      console.error(`❌ RAG Engine query failed:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  // 🤖 使用生成式 AI 基於檢索到的內容生成答案 (使用 Google GenAI SDK)
  async generateAnswerFromContexts(question, contexts) {
    try {
      console.log(`🤖 Generating answer for question: "${question}"`);
      console.log(`📚 Using ${contexts.length} context(s)`);

      // 構建上下文文本
      const contextTexts = contexts
        .map((ctx, index) => {
          return `文檔片段 ${index + 1}:\n${
            ctx.text || ctx.chunk?.text || "無內容"
          }`;
        })
        .join("\n\n");

      console.log(`📝 Context texts:`, contextTexts.substring(0, 500) + "...");

      // 構建提示詞
      const prompt = `基於以下文檔內容回答問題。請只使用提供的文檔內容來回答，如果文檔中沒有相關信息，請明確說明。

文檔內容:
${contextTexts}

問題: ${question}

請用繁體中文回答，並基於文檔內容提供具體和有用的答案:`;

      console.log(`🚀 Calling Google GenAI SDK with Gemini model...`);

      // 使用 Google GenAI SDK 調用 Gemini 模型
      const request = {
        model: "gemini-2.5-pro",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        config: {
          temperature: 0.2,
          topK: 32,
          topP: 1,
          maxOutputTokens: 65536,
        },
      };

      const result = await this.genAI.models.generateContent(request);

      console.log(`✅ Gemini response received via SDK`);
      console.log(`📨 Raw result:`, JSON.stringify(result, null, 2));

      // 檢查回應結構並提取文本
      let generatedText = "無法提取回應內容";

      if (result && result.response) {
        if (typeof result.response.text === "function") {
          generatedText = result.response.text();
        } else if (
          result.response.candidates &&
          result.response.candidates[0]
        ) {
          const candidate = result.response.candidates[0];
          if (
            candidate.content &&
            candidate.content.parts &&
            candidate.content.parts[0]
          ) {
            generatedText =
              candidate.content.parts[0].text || "無法提取文本內容";
          }
        } else if (result.response.text) {
          generatedText = result.response.text;
        }
      } else if (result.text) {
        generatedText = result.text;
      }

      console.log(`📝 Extracted text:`, generatedText);

      return {
        success: true,
        answer: generatedText,
        model: "gemini-2.5-pro",
        contextUsed: contexts.length,
        rawResponse: result,
      };
    } catch (error) {
      console.error(`❌ Error generating answer from contexts:`, error);
      console.error(`❌ Error details:`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
        fallbackAnswer: `根據檢索到的文檔內容，找到了 ${
          contexts.length
        } 個相關片段，但生成詳細答案時遇到技術問題。文檔內容摘要：${contexts
          .map((c) => c.text || c.chunk?.text || "")
          .join(" ")
          .substring(0, 200)}...`,
      };
    }
  }

  // 🔧 提取 Gemini 回應的輔助方法
  // extractGeminiResponse(responseData) {
  //   try {
  //     if (responseData.candidates && responseData.candidates.length > 0) {
  //       const candidate = responseData.candidates[0];
  //       if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
  //         return candidate.content.parts[0].text || "無法提取回應文本";
  //       }
  //     }

  //     console.warn("Unexpected Gemini response structure:", responseData);
  //     return "抱歉，無法解析 AI 回應內容";
  //   } catch (error) {
  //     console.error("Error extracting Gemini response:", error);
  //     return "AI 回應解析錯誤";
  //   }
  // }

  extractGeminiResponse(responseData) {
    try {
      const candidate = responseData.candidates?.[0];
      if (!candidate) return "無法提取回應內容";
      if (candidate.content?.parts?.[0]?.text) {
        return candidate.content.parts[0].text;
      }
      if (candidate.content?.text) {
        return candidate.content.text;
      }
      return "無法提取回應內容";
    } catch (e) {
      console.error("Error extracting Gemini response:", e);
      return "AI 回應解析錯誤";
    }
  }

  // 🔧 提取回應文本的輔助方法
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
