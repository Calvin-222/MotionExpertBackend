<template>
  <div class="rag-container">
    <h1><i class="fas fa-cube"></i>RAG System</h1>

    <!-- RAG Engine Management -->
    <div class="section">
      <h2><i class="fas fa-cog"></i>RAG Engine Management</h2>
      <div class="section-content">
        <!-- Create RAG Engine -->
        <div class="subsection">
          <h3>Create New RAG Engine</h3>
          <form @submit.prevent="createEngine">
            <div class="form-group">
              <label for="engineName">Engine Name:</label>
              <input type="text" id="engineName" v-model="engineForm.name" required>
            </div>
            <div class="form-group">
              <label for="engineDescription">Description (Optional):</label>
              <input type="text" id="engineDescription" v-model="engineForm.description">
            </div>
            <button
              type="submit"
              class="btn"
              :disabled="isCreatingEngine"
            >
              <i class="fas fa-spinner fa-spin" v-if="isCreatingEngine"></i>
              <i class="fas fa-plus" v-else></i>
              {{ isCreatingEngine ? '正在創建中...' : 'Create RAG Engine' }}
            </button>
          </form>
        </div>

        <!-- List User's RAG Engines -->
        <div class="subsection">
          <h3>My RAG Engines</h3>
          <button @click="listEngines" class="btn">Refresh List</button>

          <div class="table-container" v-if="userEngines.length > 0">
            <table>
              <thead>
                <tr>
                  <th>RAG Name</th>
                  <th>Change Visibility</th>
                  <th>Created at</th>
                  <th>Originated From</th>
                  <th>Direct Sharing</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="engine in userEngines" :key="engine.id">
                  <td><strong>{{ engine.name }}</strong></td>
                  <td v-if="engine.isOwner">
                    <div class="visibility-controls">
                      <select
                        v-model="engineVisibilities[engine.id]"
                        :disabled="!engine.isOwner"
                      >
                        <option value="Private">Private</option>
                        <option value="Public">Public</option>
                        <option value="Friend">Friends only</option>
                      </select>
                      <button
                        @click="updateVisibility(engine.id, engineVisibilities[engine.id])"
                        class="btn btn-small"
                      >
                        Save
                      </button>
                      <span v-if="updatingVisibility[engine.id]" class="status-text">Updating...</span>
                    </div>
                  </td>
                  <td v-else>
                    <span class="status-text">Cannot Change</span>
                  </td>
                  <td>{{ formatDate(engine.createdAt) }}</td>
                  <td>
                      <span v-if="engine.isOwner" class="badge owner-badge">
                        {{ engine.comingFrom || engine.createdBy || 'Self Created' }}
                      </span>
                      <span v-else class="badge shared-badge">
                        {{ engine.comingFrom || engine.sharedBy || engine.originalOwner || 'Shared' }}
                      </span>
                    </td>
                  <td>
                    <div class="sharing-controls" v-if="engine.isOwner">
                      <input
                        type="text"
                        v-model="shareTargets[engine.id]"
                        placeholder="Username"
                      >
                      <button
                        @click="shareEngine(engine.id)"
                        :disabled="sharingStates[engine.id]"
                        class="btn btn-small"
                      >
                        {{ sharingStates[engine.id] ? 'Sharing...' : 'Share' }}
                      </button>
                    </div>
                    <span v-else>-</span>
                  </td>
                  <td>
                    <button v-if="engine.isOwner" @click="deleteEngine(engine.id)" class="btn btn-danger btn-small">
                      Delete
                    </button>
                    <span v-else>-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Management -->
    <div class="section">
      <h2><i class="fas fa-file-alt"></i>Document Management</h2>
      <div class="section-content">
        <!-- Upload Files -->
        <div class="subsection">
          <h3>Upload Files to RAG Engine</h3>
          <form @submit.prevent="uploadFile">
            <div class="form-group">
              <label for="engineForUpload">Select RAG Engine:</label>
              <select id="engineForUpload" v-model="selectedEngineForUpload" required>
                <option value="">Choose an engine...</option>
                <option v-for="engine in userEngines.filter(e => e.isOwner)" :key="engine.id" :value="engine.id">
                  {{ engine.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>Select Files (Multiple files supported):</label>
              <div class="custom-file-input">
                <input type="file" id="fileToUpload" ref="fileInput" @change="handleFileSelection" multiple style="display: none;">
                <button type="button" @click="$refs.fileInput.click()" class="btn">Choose Files</button>
                <span>{{ selectedFilesText }}</span>
              </div>
            </div>
            <button
              type="submit"
              class="btn"
              :disabled="isUploadingFiles"
            >
              <i class="fas fa-spinner fa-spin" v-if="isUploadingFiles"></i>
              <i class="fas fa-upload" v-else></i>
              {{ isUploadingFiles ? '正在上傳中...' : 'Upload Files' }}
            </button>
          </form>
        </div>

        <!-- List Engine Documents -->
        <div class="subsection">
          <h3>View Files in RAG Engine</h3>
          <div class="form-row">
            <div class="form-group">
              <label for="engineForDocuments">Select RAG Engine:</label>
              <select id="engineForDocuments" v-model="selectedEngineForDocuments">
                <option value="">Choose an engine...</option>
                <option v-for="engine in userEngines.filter(e => e.isOwner)" :key="engine.id" :value="engine.id">
                  {{ engine.name }}
                </option>
              </select>
            </div>
            <button
              @click="listDocuments"
              class="btn"
              :disabled="isListingDocuments"
            >
              <i class="fas fa-spinner fa-spin" v-if="isListingDocuments"></i>
              <i class="fas fa-list" v-else></i>
              {{ isListingDocuments ? '正在載入中...' : 'Get Document List' }}
            </button>
          </div>

          <div class="table-container" v-if="documents.length > 0">
            <table>
              <thead>
                <tr>
                  <th>Original Filename</th>
                  <th>Upload Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="doc in documents" :key="doc.fileId || doc.id">
                  <td>{{ doc.originalFileName || doc.displayName || doc.filename || doc.name || 'Unknown' }}</td>
                  <td>{{ formatDate(doc.created_at) || 'N/A' }}</td>
                  <td>
                    <button @click="deleteDocument(doc.fileId || doc.id)" class="btn btn-danger btn-small">
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Cloud File Management -->
    <div class="section">
      <h2><i class="fas fa-cloud"></i>Cloud File Management</h2>
      <div class="section-content">
        <div class="subsection">
          <h3>Files in Google Cloud Storage</h3>
          <button @click="fetchCloudFiles" class="btn" :disabled="isLoadingCloudFiles">
            <i class="fas fa-sync" :class="{ 'fa-spin': isLoadingCloudFiles }"></i> Refresh List
          </button>
          
          <div class="table-container" v-if="cloudFiles.length > 0">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in cloudFiles" :key="file.name">
                  <td>{{ file.name }}</td>
                  <td>{{ formatDate(file.timeCreated) }}</td>
                  <td>
                    <button @click="openUploadModal(file)" class="btn btn-small">
                      Upload to RAG
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="!isLoadingCloudFiles" class="no-data">
            No files found in cloud storage.
          </div>
        </div>
      </div>
    </div>

    <!-- Query Function -->
    <div class="section">
      <h2><i class="fas fa-search"></i>RAG Query</h2>
      <div class="section-content">
        <form @submit.prevent="queryEngine">
          <div class="form-group">
            <label for="engineForQuery">Select RAG Engine:</label>
            <select id="engineForQuery" v-model="selectedEngineForQuery">
              <option value="">Choose an engine...</option>
              <option v-for="engine in userEngines" :key="engine.id" :value="engine.id">
                {{ engine.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="question">Question:</label>
            <textarea id="question" v-model="queryForm.question" rows="4" placeholder="Enter your question here..." required></textarea>
          </div>
          <button
            type="submit"
            class="btn"
            :disabled="isQuerying"
          >
            <i class="fas fa-spinner fa-spin" v-if="isQuerying"></i>
            <i class="fas fa-search" v-else></i>
            {{ isQuerying ? '正在查詢中...' : 'Send Query' }}
          </button>
        </form>
        <div class="response" :class="queryResponseClass" v-html="queryResponse" v-if="queryResponse"></div>
      </div>
    </div>

    <!-- Cloud Upload Modal -->
    <div v-if="showCloudUploadModal" class="modal-overlay">
      <div class="modal-content">
        <h3>Upload Cloud File to RAG</h3>
        <div class="form-group">
          <label>File Name:</label>
          <input type="text" v-model="uploadFileName" placeholder="Enter file name">
        </div>
        <div class="form-group">
          <label>Select Target RAG Engine:</label>
          <select v-model="uploadRagId">
            <option v-for="engine in userEngines.filter(e => e.isOwner)" :key="engine.id" :value="engine.id">
              {{ engine.name }}
            </option>
          </select>
        </div>
        <div class="modal-actions">
          <button @click="showCloudUploadModal = false" class="btn-cancel">Cancel</button>
          <button @click="uploadCloudFileToRag" class="btn-confirm" :disabled="isUploadingCloudFile || !uploadRagId || !uploadFileName">
            {{ isUploadingCloudFile ? 'Uploading...' : 'Confirm Upload' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import '@/assets/ragtest.css'
import {authService} from '@/services/authService'
export default {
  name: 'RagTestInterface',
  data() {
    return {
      // Auth state
      Tokenoken: localStorage.getItem('token'),
      engineVisibilities: {},
      // Forms
      engineForm: {
        name: '',
        description: ''
      },
      queryForm: {
        question: ''
      },

      // Data
      userEngines: [],
      documents: [],
      cloudFiles: [], // New: Cloud files list

      // Selected values
      selectedEngineForUpload: '',
      selectedEngineForDocuments: '',
      selectedEngineForQuery: '',

      // Cloud Upload Modal
      showCloudUploadModal: false,
      selectedCloudFile: null,
      uploadFileName: '',
      uploadRagId: '',
      isUploadingCloudFile: false,
      isLoadingCloudFiles: false,

      // File selection
      selectedFiles: [],

      // Share functionality
      shareTargets: {},
      sharingStates: {},

      updatingVisibility: {},

      // Loading states
      isCreatingEngine: false,
      isUploadingFiles: false,
      isListingDocuments: false,
      isQuerying: false,

      // Response messages and classes
      loginResponse: '',
      loginResponseClass: '',
      registerResponse: '',
      registerResponseClass: '',
      createEngineResponse: '',
      createEngineResponseClass: '',
      listEnginesResponse: '',
      listEnginesResponseClass: '',
      uploadFileResponse: '',
      uploadFileResponseClass: '',
      listDocumentsResponse: '',
      listDocumentsResponseClass: '',
      queryResponse: '',
      queryResponseClass: ''
    }
  },
  computed: {
    selectedFilesText() {
      if (!this.selectedFiles || this.selectedFiles.length === 0) {
        return 'No files selected';
      }
      if (this.selectedFiles.length === 1) {
        return this.selectedFiles[0].name;
      }
      return `${this.selectedFiles.length} files selected: ${this.selectedFiles.map(f => f.name).join(', ')}`;
    },
    username() {
      const user = authService.getUser()
      return user?.username || 'Loading...'
    },
    currentUserId(){
      const user = authService.getUser()
      return user?.userid || 'Loading...'
    }
  },
  mounted() {
    this.listEngines();
  },
  methods: {
    // Cloud File Management
    async fetchCloudFiles() {
      this.isLoadingCloudFiles = true;
      try {
        const response = await fetch('/api/cloud/files?bucket=motion_expert_generated_data', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
        });
        const data = await response.json();
        if (data.success) {
          this.cloudFiles = data.files || [];
        } else {
          console.error('Failed to fetch cloud files:', data.message);
        }
      } catch (error) {
        console.error('Error fetching cloud files:', error);
      } finally {
        this.isLoadingCloudFiles = false;
      }
    },

    openUploadModal(file) {
      this.selectedCloudFile = file;
      this.uploadFileName = file.name;
      this.uploadRagId = this.userEngines.length > 0 ? this.userEngines[0].id : '';
      this.showCloudUploadModal = true;
    },

    async uploadCloudFileToRag() {
      if (!this.selectedCloudFile || !this.uploadRagId) return;
      
      this.isUploadingCloudFile = true;
      try {
        const response = await fetch('/api/rag/index-cloud-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
          body: JSON.stringify({
            fileName: this.uploadFileName,
            cloudFileName: this.selectedCloudFile.name,
            ragId: this.uploadRagId,
            bucket: 'motion_expert_generated_data'
          }),
        });

        const data = await response.json();
        if (data.success) {
          alert('Successfully indexed cloud file to RAG!');
          this.showCloudUploadModal = false;
        } else {
          alert('Failed to index file: ' + data.message);
        }
      } catch (error) {
        console.error('Error indexing cloud file:', error);
        alert('Error indexing file: ' + error.message);
      } finally {
        this.isUploadingCloudFile = false;
      }
    },

    // Handle file selection
    handleFileSelection(event) {
      this.selectedFiles = Array.from(event.target.files);
    },

    async updateVisibility(engineId, newVisibility) {
      this.updatingVisibility[engineId] = true;

      try {
        const response = await fetch(`/api/rag/users/engines/${engineId}/visibility`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.Tokenoken
          },
          body: JSON.stringify({ visibility: newVisibility })
        });

        const result = await response.json();

        if (result.success) {
          const engine = this.userEngines.find(e => e.id === engineId);
          if (engine) {
            engine.visibility = newVisibility;
          }
        }
      } catch (error) {
        console.error('Error updating visibility:', error);
      } finally {
        this.updatingVisibility[engineId] = false;
      }
    },

    // Logout functionality
    logout() {
      authService.logout()
      this.$router.push('/login')
    },

    // Create RAG Engine
    async createEngine() {
      if (this.isCreatingEngine) return; // 防止重複提交

      this.isCreatingEngine = true; // 開始 loading

      try {
        const response = await fetch('/api/rag/users/engines', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
          body: JSON.stringify({
            engineName: this.engineForm.name,
            description: this.engineForm.description
          }),
        });

        const data = await response.json();
        this.createEngineResponse = JSON.stringify(data, null, 2);

        if (data.success) {
          this.createEngineResponseClass = 'success';
          this.engineForm.name = '';
          this.engineForm.description = '';
          this.listEngines();
          alert('RAG Engine created successfully');
        } else {
          this.createEngineResponseClass = 'error';
        }
      } catch (error) {
        this.createEngineResponse = 'Error: ' + error.message;
        this.createEngineResponseClass = 'error';
      } finally {
        this.isCreatingEngine = false; // 結束 loading
      }
    },

    // List user's RAG Engines
    async listEngines() {
      try {
        const response = await fetch('/api/rag/users/' + this.currentUserId + '/engines', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
        });

        const data = await response.json();
        this.listEnginesResponse = JSON.stringify(data, null, 2);

        if (data.success) {
          this.userEngines = data.engines;
          this.listEnginesResponseClass = 'success';

          // Initialize share targets, states, and visibility values
          this.userEngines.forEach(engine => {
            this.shareTargets[engine.id] = '';
            this.sharingStates[engine.id] = false;
            this.engineVisibilities[engine.id] = engine.visibility;
            console.log(engine.visibility);
            this.updatingVisibility[engine.id] = false;
          });
        } else {
          this.listEnginesResponseClass = 'error';
        }
      } catch (error) {
        this.listEnginesResponse = 'Error: ' + error.message;
        this.listEnginesResponseClass = 'error';
      }
    },

    // Delete RAG Engine
    async deleteEngine(engineId) {
      if (!confirm('Are you sure you want to delete the RAG Engine with ID ' + engineId + '?')) {
        return;
      }

      try {
        const response = await fetch('/api/rag/users/' + this.currentUserId + '/engines/' + engineId, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
        });

        const data = await response.json();

        if (data.success) {
          alert('RAG Engine deleted successfully');
          this.listEngines();
        } else {
          alert('Delete failed: ' + data.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    },

    // Share Engine
    async shareEngine(engineId) {
      const targetUsername = this.shareTargets[engineId]?.trim();
      if (!targetUsername) {
        alert('Please enter target username');
        return;
      }

      this.sharingStates[engineId] = true;

      try {
        const response = await fetch('/api/rag/users/engines/' + engineId + '/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
          body: JSON.stringify({ targetUsername: targetUsername }),
        });

        const data = await response.json();

        if (data.success) {
          alert(`Successfully shared with user ${targetUsername}!`);
          // Clear input field
          this.shareTargets[engineId] = '';
        } else {
          alert('Share failed: ' + (data.error || data.message || 'Unknown error'));
        }
      } catch (error) {
        alert('Share error: ' + error.message);
      }

      this.sharingStates[engineId] = false;
    },

    // Upload file function
    async uploadFile() {
      if (this.isUploadingFiles) return; // 防止重複提交

      if (!this.selectedEngineForUpload) {
        alert('Please select a RAG Engine');
        return;
      }

      if (this.selectedFiles.length === 0) {
        alert('Please select at least one file');
        return;
      }

      this.isUploadingFiles = true; // 開始 loading

      const totalFiles = this.selectedFiles.length;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];

        try {
          this.uploadFileResponse = 'Uploading file ' + (i + 1) + '/' + totalFiles + ': ' + file.name + ', please wait...';

          const formData = new FormData();
          formData.append('file', file);
          formData.append('ragId', this.selectedEngineForUpload);

          const response = await fetch('/api/rag/users/' + this.currentUserId + '/upload', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + this.Tokenoken,
            },
            body: formData,
          });

          const data = await response.json();

          if (data.success) {
            successCount++;
            this.uploadFileResponse += '\n✅ ' + file.name + ' uploaded successfully';
            this.uploadFileResponseClass = 'success';
            alert('File' + file.name + ' added successfully');

          } else {
            failCount++;
            this.uploadFileResponse += '\n❌ ' + file.name + ' upload failed: ' + data.error;
            this.uploadFileResponseClass = 'error';
          }
        } catch (error) {
          failCount++;
          this.uploadFileResponse += '\n❌ ' + file.name + ' upload error: ' + error.message;
          this.uploadFileResponseClass = 'error';
        }
      }

      // Clear the file selection
      this.selectedFiles = [];
      this.$refs.fileInput.value = '';
      this.uploadFileResponse += '\n\n📊 Upload complete! Processed ' + totalFiles + ' files (Success: ' + successCount + ', Failed: ' + failCount + ')';
      this.isUploadingFiles = false; // 結束 loading
    },

    // List documents
    async listDocuments() {
      if (this.isListingDocuments) return; // 防止重複提交

      if (!this.selectedEngineForDocuments) {
        alert('Please select a RAG Engine');
        return;
      }

      this.isListingDocuments = true; // 開始 loading

      try {
        const response = await fetch('/api/rag/users/' + this.currentUserId + '/engines/' + this.selectedEngineForDocuments + '/documents', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
        });

        const data = await response.json();
        this.listDocumentsResponse = JSON.stringify(data, null, 2);

        if (data.success) {
          let documentsList = [];

          if (Array.isArray(data.documents)) {
            documentsList = data.documents.map(doc => ({
              ...doc,
              fileId: doc.id,
              originalFileName: doc.name,
              created_at: doc.created_at
            }));
          } else if (data.documents && typeof data.documents === 'object') {
            // Fix this part - entry[1] is the object with filename and created_at
            documentsList = Object.entries(data.documents).map(entry => ({
              id: entry[0],
              fileId: entry[0],
              originalFileName: entry[1].filename,    // ← Was entry[1], should be entry[1].filename
              displayName: entry[1].filename,         // ← Was entry[1], should be entry[1].filename
              filename: entry[1].filename,            // ← Was entry[1], should be entry[1].filename
              created_at: entry[1].created_at         // ← Add this line!
            }));
          } else {
            documentsList = [];
          }

          this.documents = documentsList;
          this.listDocumentsResponseClass = 'success';
        } else {
          this.listDocumentsResponseClass = 'error';
        }
      } catch (error) {
        this.listDocumentsResponse = 'Error: ' + error.message;
        this.listDocumentsResponseClass = 'error';
      } finally {
        this.isListingDocuments = false; // 結束 loading
      }
    },

    // Delete document
    async deleteDocument(fileId) {
      if (!confirm('Are you sure you want to delete the file with ID ' + fileId + '?')) {
        return;
      }

      try {
        const response = await fetch('/api/rag/users/documents/' + fileId + '?ragId=' + this.selectedEngineForDocuments, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
        });

        const data = await response.json();

        if (data.success) {
          alert('File deleted successfully');
          this.listDocuments();
        } else {
          alert('Delete failed: ' + data.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    },

    // Query RAG Engine
    async queryEngine() {
      if (this.isQuerying) return; // 防止重複提交

      if (!this.selectedEngineForQuery) {
        alert('Please select a RAG Engine');
        return;
      }

      if (!this.queryForm.question.trim()) {
        alert('Please enter a question');
        return;
      }

      this.isQuerying = true; // 開始 loading

      try {
        this.queryResponse = 'Processing, please wait...';

        const response = await fetch('/api/rag/users/' + this.currentUserId + '/engines/' + this.selectedEngineForQuery + '/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.Tokenoken,
          },
          body: JSON.stringify({ question: this.queryForm.question }),
        });

        const data = await response.json();

        if (data.success) {
          let formattedResponse = 'Question: ' + this.queryForm.question + '\n\nAnswer: ' + data.answer + '\n\nSources:';

          if (data.sources && data.sources.length > 0) {
            data.sources.forEach((source, index) => {
              formattedResponse += '\n' + (index + 1) + '. ' + (source.title || source.name || 'Unknown');
            });
          } else {
            formattedResponse += '\nNo specific sources';
          }

          formattedResponse += '\n\nTimestamp: ' + new Date(data.timestamp).toLocaleString();
          this.queryResponse = formattedResponse;
          this.queryResponseClass = 'success';
        } else {
          this.queryResponse = 'Error: ' + data.error;
          this.queryResponseClass = 'error';
        }
      } catch (error) {
        this.queryResponse = 'Error: ' + error.message;
        this.queryResponseClass = 'error';
      } finally {
        this.isQuerying = false; // 結束 loading
      }
    },

    // Utility method to format dates
    formatDate(dateString) {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      // Add 8 hours (8 * 60 * 60 * 1000 milliseconds)
      const utcPlus8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
      return utcPlus8Date.toLocaleString('en-US');
    }
  }
}
</script>
