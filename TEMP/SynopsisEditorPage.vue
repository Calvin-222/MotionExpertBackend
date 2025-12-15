<!-- filepath: /Users/cc/Desktop/MotionExpert_MyVersion/lab-spa/src/views/SynopsisEditorPage.vue -->
<template>
  <div class="synopsis-editor-container">
    <!-- main-content-synopsis 現在是兩欄佈局的 flex 容器 -->
    <div class="main-content-synopsis">
      <!-- 左欄：表單 -->
      <div class="form-column">
        <header class="synopsis-header">
          <h1>Synopsis Editor</h1>
          <p>Craft your story structure and generate a cohesive synopsis.</p>

          <!-- AI Model Selection -->
          <div class="model-selector input-group" style="margin-bottom: 1rem;">
            <label for="modelSelect">AI Model:</label>
            <select id="modelSelect" v-model="selectedModel">
              <option v-for="model in models" :key="model.id" :value="model.id">
                {{ model.name }}
              </option>
            </select>
          </div>

          <!-- 模板選擇器 -->
          <div class="template-selector" v-if="userTemplates.length > 0 || error">
            <div class="selector-controls" v-if="userTemplates.length > 0">
              <label for="templateSelect">Template:</label>
              <select id="templateSelect" v-model="selectedTemplateId" @change="loadTemplate">
                <option v-for="template in userTemplates" :key="template.id" :value="template.id">
                  {{ template.scriptname }}
                </option>
              </select>
              <button @click="editCurrentTemplate" class="btn-edit-template" :disabled="!selectedTemplateId || selectedTemplateId === 'fallback'">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button @click="createNewTemplate" class="btn-new-template" :disabled="selectedTemplateId === 'fallback'">
                <i class="fas fa-plus"></i> New
              </button>
            </div>
            <div v-if="error && !userTemplates.length" class="error-info">
              <p>{{ error }}</p>
              <p><small>Using default template to continue</small></p>
            </div>
          </div>
        </header>

        <div class="form-sections" v-if="currentTemplate && currentTemplate.sections">
          <!-- 動態生成表單，但保持原有佈局 -->
          <template v-for="(rowSections, rowIndex) in groupedSections" :key="rowIndex">
            <div :class="getRowClass(rowSections)">
              <section
                v-for="section in rowSections"
                :key="section.id"
                class="act-section">

                <!-- 動態 h2 標題 -->
                <h2>{{ section.title }}</h2>

                <!-- 動態欄位 -->
                <div v-for="field in section.fields" :key="field.id" class="input-group">
                  <label :for="field.id">{{ field.label }}</label>

                  <!-- textarea -->
                  <textarea
                    v-if="field.type === 'textarea'"
                    :id="field.id"
                    v-model="formData[field.id]"
                    :placeholder="field.placeholder">
                  </textarea>

                  <!-- text input -->
                  <input
                    v-else-if="field.type === 'text'"
                    :id="field.id"
                    v-model="formData[field.id]"
                    :placeholder="field.placeholder"
                    type="text">

                  <!-- select dropdown -->
                  <select
                    v-else-if="field.type === 'select'"
                    :id="field.id"
                    v-model="formData[field.id]">
                    <option value="">{{ field.placeholder || '請選擇...' }}</option>
                    <option
                      v-for="option in field.options"
                      :key="option"
                      :value="option">
                      {{ option }}
                    </option>
                  </select>

                  <!-- checkbox -->
                  <div v-else-if="field.type === 'checkbox'" class="checkbox-group">
                    <input
                      :id="field.id"
                      v-model="formData[field.id]"
                      type="checkbox">
                    <label :for="field.id" class="checkbox-label">{{ field.label }}</label>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </div>

        <!-- Loading state -->
        <div v-else-if="loading" class="loading-state">
          <p>Loading template...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="error-state">
          <p>{{ error }}</p>
          <button @click="loadUserTemplates" class="retry-btn">Retry</button>
        </div>

        <!-- RAG Engine 選擇 -->
        <div class="input-group">
          <label for="engineSelect">Choose RAG Engine：</label>
          <select id="engineSelect" v-model="selectedEngineId">
            <option v-for="engine in userEngines" :key="engine.id" :value="engine.id">
              {{ engine.displayName || engine.name || engine.ragName }}
            </option>
          </select>
        </div>
        <button
          @click="submitSynopsis"
          class="submit-btn synopsis-action-btn main-generate-btn"
          :disabled="isGenerating"
        >
          <i class="fas fa-spinner fa-spin" v-if="isGenerating"></i>
          <i class="fas fa-cogs" v-else></i>
          {{ isGenerating ? '正在處理中...' : 'Generate' }}
        </button>
      </div>

      <!-- 右欄：AI 互動 -->
      <div class="ai-column">
        <!-- Action Buttons Toolbar -->
        <div class="action-toolbar" style="margin-bottom: 1rem; display: flex; gap: 10px; flex-wrap: wrap;">
          <button @click="exportFile" class="btn-action">
            <i class="fas fa-file-export"></i> Export
          </button>
          <button @click="saveToCloud" class="btn-action" :disabled="isSavingToCloud">
            <i class="fas fa-cloud-upload-alt"></i> {{ isSavingToCloud ? 'Saving...' : 'Save to Cloud' }}
          </button>
          <button @click="openRagModal" class="btn-action">
            <i class="fas fa-database"></i> Add to RAG Engine
          </button>
        </div>

        <div class="ai-interaction-section">
          <h2 class="ai-title">AI Interaction</h2>
          <div class="ai-response-box">
            <!-- 將 pre 標籤改為支援 Markdown 的 div -->
            <div class="markdown-content" v-html="renderedAiResponse"></div>
          </div>
          <div class="follow-up-section">
            <label for="followUpPrompt">Follow-up Instructions:</label>
            <textarea
              id="followUpPrompt"
              v-model="followUpPrompt"
              placeholder="Enter further requirements or modifications for the AI..."
              :disabled="isSendingFollowUp"
            ></textarea>
            <button
              @click="sendFollowUp"
              class="submit-btn synopsis-action-btn"
              :disabled="isSendingFollowUp"
            >
              <i class="fas fa-spinner fa-spin" v-if="isSendingFollowUp"></i>
              <i class="fas fa-paper-plane" v-else></i>
              {{ isSendingFollowUp ? '正在發送中...' : 'Send Follow-up' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板編輯器彈窗 -->
    <TemplateEditor
      v-if="showTemplateEditor"
      :template="editingTemplate"
      @close="showTemplateEditor = false"
      @save="saveTemplate"
      @delete="handleTemplateDelete"
    />

    <!-- Add to RAG Modal -->
    <div v-if="showRagModal" class="modal-overlay">
      <div class="modal-content">
        <h3>Add to RAG Engine</h3>
        <div class="form-group">
          <label for="targetRagSelect">Select Target RAG Engine:</label>
          <select id="targetRagSelect" v-model="targetRagId">
            <option v-for="engine in userEngines" :key="engine.id" :value="engine.id">
              {{ engine.displayName || engine.name || engine.ragName }}
            </option>
          </select>
        </div>
        <div class="modal-actions">
          <button @click="showRagModal = false" class="btn-cancel">Cancel</button>
          <button @click="addToRag" class="btn-confirm" :disabled="isAddingToRag || !targetRagId">
            {{ isAddingToRag ? 'Adding...' : 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { marked } from 'marked';
import TemplateEditor from '@/components/TemplateEditor.vue';

export default {
  name: 'SynopsisEditorPage',
  components: {
    TemplateEditor
  },
  data() {
    return {
      // 原有數據保持不變
      formData: {
        act1: { openingScene: '', initiation: '' },
        act2: { processAndAchievements: '', obstaclesAndChallenges: '' },
        act3a: { turningPointAndDiscovery: '', inmostCave: '' },
        act3b: { finalBattle: '', endingScene: '', isAntiClimax: false },
        additionalDetails: {
          logline: '',
          theme: '',
          targetAudience: '',
          comparableTitles: ''
        },
        periodOfScene: '',
        teasingAction: '',
        teasingDialogue: '',
      },
      generatedSynopsisString: '',
      aiResponse: 'AI response will appear here once you generate the synopsis.',
      followUpPrompt: '',
      selectedEngineId: '',
      userEngines: [],

      // 新增動態模板相關數據
      currentTemplate: {
        id: '',
        templateName: '',
        sections: []
      },
      userTemplates: [],
      selectedTemplateId: '',
      editingTemplate: null,
      showTemplateEditor: false,
      loading: false,
      error: null,

      // Loading states
      isGenerating: false,
      isSendingFollowUp: false,

      // New Features Data
      selectedModel: 'gemini-2.5-pro',
      models: [], // Initialize as empty array
      showRagModal: false,
      targetRagId: '',
      isSavingToCloud: false,
      isAddingToRag: false,
    };
  },
  computed: {
    // 計算屬性來渲染 Markdown
    renderedAiResponse() {
      if (!this.aiResponse) {
        return '<p class="placeholder-text">AI response will appear here once you generate the synopsis.</p>';
      }

      // 配置 marked 選項
      marked.setOptions({
        breaks: true, // 支援換行
        gfm: true, // 支援 GitHub Flavored Markdown
      });

      return marked(this.aiResponse);
    },

    // 根據 layoutClass 將 sections 分組到不同的 row 中
    groupedSections() {
      if (!this.currentTemplate.sections) return [];

      const sortedSections = [...this.currentTemplate.sections].sort((a, b) => a.order - b.order);
      const rows = [];
      let currentRow = [];

      for (const section of sortedSections) {
        if (section.layoutClass === 'full-width') {
          // full-width 的 section 獨佔一行
          if (currentRow.length > 0) {
            rows.push(currentRow);
            currentRow = [];
          }
          rows.push([section]);
        } else {
          // half-width 或其他的 section 可以共享一行
          currentRow.push(section);

          // 如果當前行已經有兩個 half-width，開始新的一行
          if (currentRow.length >= 2) {
            rows.push(currentRow);
            currentRow = [];
          }
        }
      }

      // 處理最後一行
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }

      return rows;
    }
  },
  mounted() {
    this.loadUserEngines();
    this.loadUserTemplates();
    this.loadModels(); // Load models on mount
  },
  methods: {
    // Load available AI models from backend
    async loadModels() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/msw-with-file/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success && data.models) {
          this.models = data.models;
          // Set default model if not already set or if current selection is invalid
          if (!this.selectedModel || !this.models.find(m => m.id === this.selectedModel)) {
             this.selectedModel = this.models[0].id;
          }
        } else {
          console.error('Failed to load models:', data.message);
          // Fallback models if API fails
          this.models = [
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Default)' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'DeepSeek R1 0528', name: 'DeepSeek R1 0528' }
          ];
        }
      } catch (error) {
        console.error('Error loading models:', error);
        // Fallback models on error
        this.models = [
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Default)' },
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
          { id: 'DeepSeek R1 0528', name: 'DeepSeek R1 0528' }
        ];
      }
    },

    // Export functionality
    exportFile() {
      // Prefer AI response if available, otherwise use generated synopsis string
      const content = this.aiResponse || this.generatedSynopsisString || 'No content generated yet.';
      // Fallback to .txt if .docx is not available (simple implementation)
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `synopsis_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    // Save to Cloud functionality
    async saveToCloud() {
      if (!this.generatedSynopsisString) {
        alert('No content to save.');
        return;
      }
      this.isSavingToCloud = true;
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/cloud/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: this.generatedSynopsisString,
            filename: `synopsis_${Date.now()}.txt`,
            bucket: 'motion_expert_generated_data'
          }),
        });

        if (response.ok) {
          alert('Successfully saved to cloud!');
        } else {
          throw new Error('Failed to save to cloud');
        }
      } catch (error) {
        console.error('Error saving to cloud:', error);
        alert('Error saving to cloud: ' + error.message);
      } finally {
        this.isSavingToCloud = false;
      }
    },

    // RAG functionality
    openRagModal() {
      if (!this.generatedSynopsisString) {
        alert('No content to add to RAG.');
        return;
      }
      this.targetRagId = this.selectedEngineId || (this.userEngines.length > 0 ? this.userEngines[0].id : '');
      this.showRagModal = true;
    },

    async addToRag() {
      if (!this.targetRagId) return;
      this.isAddingToRag = true;
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/rag/add-content', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: this.generatedSynopsisString,
            ragId: this.targetRagId,
            filename: `synopsis_rag_${Date.now()}.txt`
          }),
        });

        if (response.ok) {
          alert('Successfully added to RAG Engine!');
          this.showRagModal = false;
        } else {
          throw new Error('Failed to add to RAG');
        }
      } catch (error) {
        console.error('Error adding to RAG:', error);
        alert('Error adding to RAG: ' + error.message);
      } finally {
        this.isAddingToRag = false;
      }
    },

    // 提交劇情概要，合併輸入並呼叫後端 API
    async submitSynopsis() {
      if (this.isGenerating) return; // 防止重複提交

      this.isGenerating = true; // 開始 loading

      let parts = [];

      // 如果有動態模板，使用動態模板生成
      if (this.currentTemplate && this.currentTemplate.sections) {
        const sortedSections = [...this.currentTemplate.sections].sort((a, b) => a.order - b.order);

        sortedSections.forEach(section => {
          parts.push(`\n${section.title}`);

          section.fields.forEach(field => {
            const value = this.formData[field.id];
            let displayValue;

            if (field.type === 'checkbox') {
              displayValue = value ? `(${field.label})` : '';
            } else {
              displayValue = value || '';
            }

            if (displayValue) {
              parts.push(`  ${field.label}: ${displayValue}`);
            }
          });
        });
      } else {
        // 如果沒有動態模板，使用原有的 hardcoded 結構
        parts.push("Act 1: Setup");
        parts.push(`  Opening Scene: ${this.formData.act1?.openingScene || ''}`);
        parts.push(`  Initiation: ${this.formData.act1?.initiation || ''}`);

        parts.push("\nAct 2: Confrontation and Barrier");
        parts.push(`  Process and Achievements: ${this.formData.act2?.processAndAchievements || ''}`);
        parts.push(`  Obstacles and Challenges: ${this.formData.act2?.obstaclesAndChallenges || ''}`);

        parts.push("\nAct 3A: Climax");
        parts.push(`  Turning Point and Discovery: ${this.formData.act3a?.turningPointAndDiscovery || ''}`);
        parts.push(`  Inmost Cave: ${this.formData.act3a?.inmostCave || ''}`);

        parts.push("\nAct 3B: Aftermath");
        parts.push(`  Final Battle: ${this.formData.act3b?.finalBattle || ''}`);
        parts.push(`  Ending Scene: ${this.formData.act3b?.endingScene || ''}`);
        if (this.formData.act3b?.isAntiClimax) {
          parts.push("    (Anti-climax)");
        }

        parts.push("\nAdditional Details:");
        parts.push(`  Theme and Message: ${this.formData.themeAndMessage || ''}`);
        parts.push(`  One-liner: ${this.formData.oneLiner || ''}`);
        parts.push(`  Period of Scene: ${this.formData.periodOfScene || ''}`);
        parts.push(`  Teasing Action: ${this.formData.teasingAction || ''}`);
        parts.push(`  Teasing Dialogue: ${this.formData.teasingDialogue || ''}`);
      }

      this.generatedSynopsisString = parts.join('\n');
      this.aiResponse = `Sending synopsis to backend...\n\n--- Generated String Sent to Backend ---\n${this.generatedSynopsisString}`;

      if (!this.selectedEngineId) {
        this.aiResponse = '請先選擇 RAG Engine';
        this.isGenerating = false; // 結束 loading
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/msw-with-file/askai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            synopsisString: this.generatedSynopsisString,
            engineId: this.selectedEngineId,
            templateId: this.selectedTemplateId, // 添加模板 ID
            model: this.selectedModel, // Add selected model
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || response.statusText}`);
        }

        const backendResponse = await response.json();
        this.aiResponse = backendResponse.aiProcessedOutput || 'No AI output received.';

      } catch (error) {
        console.error('Error submitting synopsis to backend:', error);
        this.aiResponse = `Error submitting synopsis: ${error.message}. Check console for details.`;
      } finally {
        this.isGenerating = false; // 結束 loading
      }
    },
    // 載入用戶 RAG engine 列表
    async loadUserEngines() {
      const token = localStorage.getItem('token');
      // 改用 authService.getUser() 取得 userId
      let userId = null;
      try {
        // 動態載入 authService
        const authService = (await import('@/services/authService')).authService;
        const user = authService.getUser();
        userId = user?.userid || user?.userId || null;


      // eslint-disable-next-line no-unused-vars
      } catch (error) {
        userId = localStorage.getItem('userId');
      }
      console.log('userId:', userId, 'token:', token);
      if (!userId) return;
      const response = await fetch(`/api/rag/users/${userId}/engines`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      console.log('engine list response:', data);
      if (data.success) {
        this.userEngines = data.engines || [];
        if (this.userEngines.length > 0) {
          this.selectedEngineId = this.userEngines[0].id;
        }
      }
    },
    // 載入用戶模板
    async loadUserTemplates() {
      this.loading = true;
      this.error = null;

      const token = localStorage.getItem('token');
      let userId = null;

      try {
        const authService = (await import('@/services/authService')).authService;
        const user = authService.getUser();
        userId = user?.userid || user?.userId || null;
      } catch (error) {
        console.log('Auth service error:', error);
        userId = localStorage.getItem('userId');
      }

      if (!userId) {
        this.loading = false;
        console.log('No userId found, skipping template loading');
        return;
      }

      try {
        const response = await fetch(`/api/templates/users/${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('未授權 - 請重新登入');
          } else if (response.status === 404) {
            // API 路由不存在，使用預設模板
            console.log('Template API not available, using fallback');
            this.createFallbackTemplate();
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Templates API response:', data);

        if (data.success && data.templates) {
          this.userTemplates = data.templates || [];

          // 載入預設模板或第一個模板
          if (this.userTemplates.length > 0) {
            const defaultTemplate = this.userTemplates.find(t => t.is_default) || this.userTemplates[0];
            this.selectedTemplateId = defaultTemplate.id;
            await this.loadTemplate();
          }
        } else {
          // 如果沒有模板數據，使用預設模板
          this.createFallbackTemplate();
        }
      } catch (error) {
        console.error('Error loading templates:', error);
        this.error = `Failed to load templates: ${error.message}`;
        // 創建備用模板
        this.createFallbackTemplate();
      } finally {
        this.loading = false;
      }
    },

    // 載入選中的模板
    async loadTemplate() {
      if (!this.selectedTemplateId) return;

      this.loading = true;
      this.error = null;

      try {
        const template = this.userTemplates.find(t => t.id === this.selectedTemplateId);
        if (template) {
          console.log('Found template:', template);
          console.log('Template structure type:', typeof template.template_structure);
          console.log('Template structure content:', template.template_structure);

          // 檢查 template_structure 是否已經是對象還是字符串
          let templateStructure;
          if (typeof template.template_structure === 'string') {
            try {
              templateStructure = JSON.parse(template.template_structure);
            } catch (parseError) {
              console.error('JSON parse error:', parseError);
              console.log('Raw template_structure:', template.template_structure);
              throw new Error(`Invalid JSON in template: ${parseError.message}`);
            }
          } else if (typeof template.template_structure === 'object') {
            templateStructure = template.template_structure;
          } else {
            throw new Error('Invalid template structure format');
          }

          this.currentTemplate = templateStructure;
          this.initializeFormData();
          console.log('Successfully loaded template:', this.currentTemplate);
        } else {
          throw new Error('Template not found');
        }
      } catch (error) {
        console.error('Error loading template:', error);
        this.error = `Failed to load template: ${error.message}`;
        // 使用備用模板
        this.createFallbackTemplate();
      } finally {
        this.loading = false;
      }
    },

    // 創建備用模板（當 API 不可用時）
    createFallbackTemplate() {
      console.log('Creating fallback template');
      this.currentTemplate = {
        id: 'fallback',
        templateName: 'Default Structure',
        sections: [
          {
            id: 'act1',
            type: 'section',
            title: 'Act 1: Setup',
            order: 1,
            layoutClass: 'half-width',
            fields: [
              {
                id: 'openingScene',
                type: 'textarea',
                label: 'Opening Scene',
                placeholder: 'Describe the opening scene...',
                required: false,
                order: 1
              },
              {
                id: 'initiation',
                type: 'textarea',
                label: 'Initiation',
                placeholder: 'How does the story begin for the protagonist?',
                required: false,
                order: 2
              }
            ]
          },
          {
            id: 'act2',
            type: 'section',
            title: 'Act 2: Confrontation and Barrier',
            order: 2,
            layoutClass: 'half-width',
            fields: [
              {
                id: 'processAndAchievements',
                type: 'textarea',
                label: 'Process and Achievements',
                placeholder: "Detail the protagonist's journey and successes...",
                required: false,
                order: 1
              },
              {
                id: 'obstaclesAndChallenges',
                type: 'textarea',
                label: 'Obstacles and Challenges',
                placeholder: 'What hurdles does the protagonist face?',
                required: false,
                order: 2
              }
            ]
          },
          {
            id: 'act3a',
            type: 'section',
            title: 'Act 3A: Climax',
            order: 3,
            layoutClass: 'half-width',
            fields: [
              {
                id: 'turningPointAndDiscovery',
                type: 'textarea',
                label: 'Turning Point and Discovery',
                placeholder: 'What is the major turning point or discovery?',
                required: false,
                order: 1
              },
              {
                id: 'inmostCave',
                type: 'textarea',
                label: 'Inmost Cave',
                placeholder: "Describe the protagonist's lowest point or greatest challenge...",
                required: false,
                order: 2
              }
            ]
          },
          {
            id: 'act3b',
            type: 'section',
            title: 'Act 3B: Aftermath',
            order: 4,
            layoutClass: 'half-width',
            fields: [
              {
                id: 'finalBattle',
                type: 'textarea',
                label: 'Final Battle',
                placeholder: 'Detail the final confrontation...',
                required: false,
                order: 1
              },
              {
                id: 'endingScene',
                type: 'textarea',
                label: 'Ending Scene',
                placeholder: 'Describe the resolution and ending...',
                required: false,
                order: 2
              },
              {
                id: 'isAntiClimax',
                type: 'checkbox',
                label: 'Anti-climax',
                placeholder: '',
                required: false,
                order: 3
              }
            ]
          },
          {
            id: 'additionalDetails',
            type: 'section',
            title: 'Additional Details',
            order: 5,
            layoutClass: 'full-width',
            fields: [
              {
                id: 'themeAndMessage',
                type: 'textarea',
                label: 'Theme and Message',
                placeholder: 'What is the core theme or message?',
                required: false,
                order: 1
              },
              {
                id: 'oneLiner',
                type: 'textarea',
                label: 'One-liner',
                placeholder: 'Summarize the story in one sentence.',
                required: false,
                order: 2
              },
              {
                id: 'periodOfScene',
                type: 'textarea',
                label: 'Period of Scene',
                placeholder: 'e.g., Present day, 1950s, Distant future',
                required: false,
                order: 3
              },
              {
                id: 'teasingAction',
                type: 'textarea',
                label: 'Teasing Action',
                placeholder: 'A hint of an exciting action sequence...',
                required: false,
                order: 4
              },
              {
                id: 'teasingDialogue',
                type: 'textarea',
                label: 'Teasing Dialogue',
                placeholder: 'A memorable line of dialogue...',
                required: false,
                order: 5
              }
            ]
          }
        ]
      };

      this.userTemplates = [{
        id: 'fallback',
        scriptname: 'Default Structure (Fallback)',
        is_default: true
      }];
      this.selectedTemplateId = 'fallback';
      this.initializeFormData();
    },

    // 初始化表單數據
    initializeFormData() {
      console.log('Initializing form data with template:', this.currentTemplate);
      const newFormData = { ...this.formData }; // 保持原有數據

      if (this.currentTemplate && this.currentTemplate.sections) {
        this.currentTemplate.sections.forEach(section => {
          if (section.fields) {
            section.fields.forEach(field => {
              // 只有當欄位不存在時才初始化
              if (!(field.id in newFormData)) {
                newFormData[field.id] = field.type === 'checkbox' ? false : '';
              }
            });
          }
        });
      }

      this.formData = newFormData;
      console.log('Form data initialized:', this.formData);
    },

    // 根據 row 中的 sections 決定 CSS 類別
    getRowClass(rowSections) {
      if (rowSections.length === 1 && rowSections[0].layoutClass === 'full-width') {
        return 'full-width';
      }
      return 'row';
    },

    // 編輯當前模板
    editCurrentTemplate() {
      if (!this.selectedTemplateId || this.selectedTemplateId === 'fallback') {
        return;
      }

      // 找到當前選中的模板
      const template = this.userTemplates.find(t => t.id === this.selectedTemplateId);
      if (template) {
        // 準備編輯數據 - 將數據庫格式轉換為編輯器格式
        let templateStructure;

        try {
          // 檢查 template_structure 是否已經是對象還是字符串
          if (typeof template.template_structure === 'string') {
            templateStructure = JSON.parse(template.template_structure);
          } else if (typeof template.template_structure === 'object') {
            templateStructure = template.template_structure;
          } else {
            throw new Error('Invalid template structure format');
          }

          // 設置編輯模板數據
          this.editingTemplate = {
            id: template.id,
            templateName: template.scriptname || templateStructure.templateName || 'Unnamed Template',
            sections: templateStructure.sections || [],
            is_default: template.is_default || false
          };

          console.log('Setting editing template:', this.editingTemplate);
          this.showTemplateEditor = true;

        } catch (error) {
          console.error('Error preparing template for editing:', error);
          alert('無法載入模板進行編輯，數據格式錯誤');
        }
      } else {
        alert('找不到選中的模板');
      }
    },

    // 創建新模板
    createNewTemplate() {
      this.editingTemplate = {
        id: null,
        templateName: 'New Template',
        sections: [
          {
            id: `section_${Date.now()}`,
            type: 'section',
            title: 'New Section',
            order: 1,
            layoutClass: 'full-width',
            fields: [
              {
                id: `field_${Date.now()}`,
                type: 'textarea',
                label: 'New Field',
                placeholder: 'Enter placeholder...',
                required: false,
                order: 1
              }
            ]
          }
        ]
      };
      this.showTemplateEditor = true;
    },

    // 保存模板
    async saveTemplate(templateData) {
      const token = localStorage.getItem('token');
      let userId = null;

      try {
        const authService = (await import('@/services/authService')).authService;
        const user = authService.getUser();
        userId = user?.userid || user?.userId || null;
      } catch (error) {
        console.log('Auth service error:', error);
        userId = localStorage.getItem('userId');
      }

      if (!userId) {
        alert('無法取得用戶ID');
        return;
      }

      try {
        const url = templateData.id ? `/api/templates/${templateData.id}` : '/api/templates';
        const method = templateData.id ? 'PUT' : 'POST';

        console.log('Saving template:', templateData);
        console.log('Using URL:', url, 'Method:', method);

        const response = await fetch(url, {
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            userid: userId,
            scriptname: templateData.templateName || templateData.scriptname,
            template_structure: JSON.stringify(templateData),
            is_default: templateData.is_default || false
          }),
        });

        const result = await response.json();
        console.log('Save result:', result);

        if (result.success) {
          // 重新載入模板列表
          await this.loadUserTemplates();

          // 如果是編輯現有模板，保持選中狀態
          if (templateData.id) {
            this.selectedTemplateId = templateData.id;
            await this.loadTemplate();
          }

          this.showTemplateEditor = false;
          alert(templateData.id ? '模板更新成功！' : '模板創建成功！');
        } else {
          throw new Error(result.message || 'Save failed');
        }
      } catch (error) {
        console.error('Error saving template:', error);
        alert(`保存模板失敗: ${error.message}`);
      }
    },

    // 處理模板刪除
    async handleTemplateDelete(deletedTemplateId) {
      console.log('Template deleted:', deletedTemplateId);

      // 重新載入模板列表
      await this.loadUserTemplates();

      // 如果刪除的是當前選中的模板，切換到第一個可用模板或備用模板
      if (this.selectedTemplateId === deletedTemplateId) {
        if (this.userTemplates.length > 0) {
          this.selectedTemplateId = this.userTemplates[0].id;
          await this.loadTemplate();
        } else {
          // 如果沒有模板了，使用備用模板
          this.createFallbackTemplate();
        }
      }
    },

    // 發送後續指令給 AI (現在使用與主要生成相同的完整提示詞)
    async sendFollowUp() {
      if (this.isSendingFollowUp) return; // 防止重複提交

      if (!this.followUpPrompt.trim()) {
        alert('Please enter a follow-up prompt.');
        return;
      }

      if (!this.selectedEngineId) {
        alert('請先選擇 RAG Engine');
        return;
      }

      this.isSendingFollowUp = true; // 開始 loading

      const previousAIResponse = this.aiResponse;
      const userPrompt = this.followUpPrompt.trim();

      // 立即顯示用戶發送的訊息並清空輸入框
      this.aiResponse = `${previousAIResponse}\n\n--- User Follow-up ---\n${userPrompt}\n\n`;
      this.followUpPrompt = ''; // 立即清空輸入框

      const token = localStorage.getItem('token');

      try {
        const response = await fetch('/api/synopsis/follow-up', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            followUpString: userPrompt,
            engineId: this.selectedEngineId,
            previousResponse: previousAIResponse,
            templateId: this.selectedTemplateId  // 新增：傳送當前使用的模板 ID
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || response.statusText}`);
        }

        const backendFollowUpResponse = await response.json();

        // 顯示回應，簡化格式
        let responseMessage = `${previousAIResponse}\n\n--- User Follow-up ---\n${userPrompt}\n\n`;
        responseMessage += backendFollowUpResponse.aiProcessedOutput || 'No AI output received.';

        this.aiResponse = responseMessage;

      } catch (error) {
        console.error('Error sending follow-up to backend:', error);
        this.aiResponse = `${previousAIResponse}\n\n--- User Follow-up ---\n${userPrompt}\n\n❌ Error processing follow-up: ${error.message}`;
      } finally {
        this.isSendingFollowUp = false; // 結束 loading
      }
    },
    handleFileChange(event) {
      this.file = event.target.files[0] || null;
    },
  }
}
</script>

<style>
@import '@/assets/SynopsisEditorPage.css';

/* 新增模板選擇器樣式 */
.template-selector {
  margin-bottom: 20px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.selector-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.selector-controls label {
  font-weight: 600;
  color: #333;
  min-width: 70px;
}

.selector-controls select {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

/* 支援動態表單中的 select 元素 */
.input-group select {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.3s ease;
  box-sizing: border-box;
  background: white;
  cursor: pointer;
}

.input-group select:focus {
  outline: none;
  border-color: #4CAF50;
}

.btn-edit-template, .btn-new-template {
  padding: 8px 15px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-edit-template {
  background: #2196F3;
  color: white;
}

.btn-edit-template:hover:not(:disabled) {
  background: #1976D2;
}

.btn-edit-template:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.btn-new-template {
  background: #4CAF50;
  color: white;
}

.btn-new-template:hover {
  background: #45a049;
}

/* 載入和錯誤狀態樣式 */
.loading-state, .error-state {
  text-align: center;
  padding: 40px 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 20px;
}

.loading-state p {
  color: #666;
  font-size: 16px;
}

/* Action Buttons */
.btn-action {
  padding: 8px 15px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 5px;
  background: #673AB7;
  color: white;
}

.btn-action:hover:not(:disabled) {
  background: #5E35B1;
}

.btn-action:disabled {
  background: #B39DDB;
  cursor: not-allowed;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.btn-cancel {
  padding: 8px 15px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.btn-confirm {
  padding: 8px 15px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.error-state p {
  color: #d32f2f;
  margin-bottom: 10px;
}

.error-info {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid #ff9800;
  border-radius: 4px;
  padding: 10px;
  margin-top: 10px;
}

.error-info p {
  color: #e65100;
  margin: 5px 0;
  font-size: 14px;
}

.error-info small {
  color: #bf360c;
  font-style: italic;
}

.retry-btn {
  padding: 8px 16px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.retry-btn:hover {
  background: #d32f2f;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .selector-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .selector-controls select {
    min-width: 100%;
  }

  .selector-controls label {
    min-width: auto;
  }
}
</style>
