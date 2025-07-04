const DatabaseOperations = require("./database");
const FileOperations = require("./fileOperations");
const QueryOperations = require("./queryOperations");
const EngineManagement = require("./engineManagement");

class MultiUserRAGSystem {
  constructor() {
    // 初始化各個操作模組
    this.database = new DatabaseOperations();
    this.fileOps = new FileOperations();
    this.queryOps = new QueryOperations();
    this.engineMgmt = new EngineManagement();
  }

  // === 資料庫操作方法 ===
  async getUserAccessibleRAGEngines(userId) {
    return await this.database.getUserAccessibleRAGEngines(userId);
  }

  async canUserAccessRAG(userId, ragId) {
    return await this.database.canUserAccessRAG(userId, ragId);
  }

  async getRAGEngineFromDB(ragId) {
    return await this.database.getRAGEngineFromDB(ragId);
  }

  async addFriend(userId, friendUsername) {
    return await this.database.addFriend(userId, friendUsername);
  }

  async acceptFriendRequest(userId, friendId) {
    return await this.database.acceptFriendRequest(userId, friendId);
  }

  async shareRAGEngineToUser(ownerId, ragId, targetUserId) {
    return await this.database.shareRAGEngineToUser(
      ownerId,
      ragId,
      targetUserId
    );
  }

  async getFileNameMapping(ragId) {
    return await this.database.getFileNameMapping(ragId);
  }

  async getOriginalFileName(ragId, fileId) {
    return await this.database.getOriginalFileName(ragId, fileId);
  }

  // === 檔案操作方法 ===
  async uploadToUserRAG(userId, file, fileName, ragId = null) {
    return await this.fileOps.uploadToUserRAG(
      userId,
      file,
      fileName,
      ragId,
      this.createUserRAGEngine.bind(this),
      this.getRAGEngineFromDB.bind(this)
    );
  }

  async uploadFileToEngine(corpusName, userId, fileBuffer, fileName) {
    return await this.fileOps.uploadFileToEngine(
      corpusName,
      userId,
      fileBuffer,
      fileName
    );
  }

  async importFileToRAG(corpusName, filePath) {
    return await this.fileOps.importFileToRAG(corpusName, filePath);
  }

  async getUserDocuments(corpusName) {
    return await this.fileOps.getUserDocuments(corpusName);
  }

  async deleteUserDocument(userId, ragFileId, ragId = null) {
    return await this.fileOps.deleteUserDocument(
      userId,
      ragFileId,
      ragId,
      this.canUserAccessRAG.bind(this)
    );
  }

  // === 查詢操作方法 ===
  async queryUserRAG(userId, question, ragId = null) {
    return await this.queryOps.queryUserRAG(
      userId,
      question,
      ragId,
      this.canUserAccessRAG.bind(this),
      this.getRAGEngineFromDB.bind(this)
    );
  }

  async querySpecificRAG(corpusName, question, userId, fileName) {
    return await this.queryOps.querySpecificRAG(
      corpusName,
      question,
      userId,
      fileName
    );
  }

  extractResponseText(response) {
    return this.queryOps.extractResponseText(response);
  }

  // === Engine 管理方法 ===
  async createUserRAGEngine(
    userId,
    engineName = null,
    description = null,
    visibility = "private"
  ) {
    return await this.engineMgmt.createUserRAGEngine(
      userId,
      engineName,
      description,
      visibility
    );
  }

  async waitForOperation(operationName, maxWaitTime = 300000) {
    return await this.engineMgmt.waitForOperation(operationName, maxWaitTime);
  }

  async listAllRAGEngines() {
    return await this.engineMgmt.listAllRAGEngines();
  }

  extractUserIdFromEngine(corpus) {
    return this.engineMgmt.extractUserIdFromEngine(corpus);
  }

  async getEngineFileCount(corpusName) {
    return await this.engineMgmt.getEngineFileCount(corpusName);
  }

  async deleteUserRAGEngine(corpusName, userId) {
    return await this.engineMgmt.deleteUserRAGEngine(corpusName, userId);
  }

  // === 速率限制方法 ===
  async rateLimitedCall(apiCall) {
    return await this.fileOps.rateLimitedCall(apiCall);
  }

  // === 獲取配置屬性 ===
  get projectId() {
    return this.engineMgmt.projectId;
  }

  get location() {
    return this.engineMgmt.location;
  }

  get bucketName() {
    return this.fileOps.bucketName;
  }
}

module.exports = MultiUserRAGSystem;
