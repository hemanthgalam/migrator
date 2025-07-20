class MigrationApp {
    constructor() {
        this.sqlConnectionKey = null;
        this.mongoConnectionKey = null;
        this.selectedTable = null;
        this.availableColumns = [];
        this.selectedColumns = [];
        this.cdcJobs = new Map();
        this.cdcRefreshInterval = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // SQL Connection Form
        document.getElementById('sqlConnectionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.connectToSQL();
        });

        // MongoDB Connection Form
        document.getElementById('mongoConnectionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.connectToMongo();
        });

        // Table Selection
        document.getElementById('tableSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadTableColumns(e.target.value);
            }
        });

        // Column Selection Buttons
        document.getElementById('selectAllColumns').addEventListener('click', () => {
            this.selectAllColumns(true);
        });

        document.getElementById('deselectAllColumns').addEventListener('click', () => {
            this.selectAllColumns(false);
        });

        // Preview Data Button
        document.getElementById('previewData').addEventListener('click', () => {
            this.previewData();
        });

        // Start Migration Button
        document.getElementById('startMigration').addEventListener('click', () => {
            this.startMigration();
        });

        // CDC Event Listeners
        document.getElementById('cdcTableSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadCdcTableColumns(e.target.value);
            }
        });

        document.getElementById('testCdcConfig').addEventListener('click', () => {
            this.testCdcConfiguration();
        });

        document.getElementById('cdcSetupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startCdcJob();
        });
    }

    async connectToSQL() {
        const formData = {
            type: document.getElementById('sqlType').value,
            host: document.getElementById('sqlHost').value,
            port: document.getElementById('sqlPort').value || null,
            database: document.getElementById('sqlDatabase').value,
            username: document.getElementById('sqlUsername').value,
            password: document.getElementById('sqlPassword').value
        };

        this.showLoading('sqlConnectionForm');
        
        try {
            const response = await fetch('/api/sql/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.sqlConnectionKey = result.connectionKey;
                this.showStatus('sqlStatus', 'Connected successfully!', 'success');
                await this.loadTables();
                this.checkMigrationReady();
            } else {
                this.showStatus('sqlStatus', result.error, 'error');
            }
        } catch (error) {
            this.showStatus('sqlStatus', `Connection failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading('sqlConnectionForm');
        }
    }

    async connectToMongo() {
        const formData = {
            host: document.getElementById('mongoHost').value,
            port: document.getElementById('mongoPort').value || null,
            database: document.getElementById('mongoDatabase').value,
            username: document.getElementById('mongoUsername').value || null,
            password: document.getElementById('mongoPassword').value || null,
            authSource: document.getElementById('mongoAuthSource').value || null
        };

        this.showLoading('mongoConnectionForm');
        
        try {
            const response = await fetch('/api/mongo/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.mongoConnectionKey = result.connectionKey;
                this.showStatus('mongoStatus', 'Connected successfully!', 'success');
                this.checkMigrationReady();
            } else {
                this.showStatus('mongoStatus', result.error, 'error');
            }
        } catch (error) {
            this.showStatus('mongoStatus', `Connection failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading('mongoConnectionForm');
        }
    }

    async loadTables() {
        try {
            const response = await fetch(`/api/sql/tables/${this.sqlConnectionKey}`);
            const result = await response.json();
            
            if (result.tables) {
                const tableSelect = document.getElementById('tableSelect');
                tableSelect.innerHTML = '<option value="">Select a table</option>';
                
                result.tables.forEach(table => {
                    const option = document.createElement('option');
                    option.value = table;
                    option.textContent = table;
                    tableSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load tables:', error);
        }
    }

    async loadTableColumns(tableName) {
        this.selectedTable = tableName;
        
        try {
            const response = await fetch(`/api/sql/columns/${this.sqlConnectionKey}/${tableName}`);
            const result = await response.json();
            
            if (result.columns) {
                this.availableColumns = result.columns;
                this.renderColumnCheckboxes();
                document.getElementById('columnSelection').classList.remove('d-none');
                
                // Auto-fill collection name
                document.getElementById('collectionName').value = tableName;
            }
        } catch (error) {
            console.error('Failed to load columns:', error);
        }
    }

    renderColumnCheckboxes() {
        const container = document.getElementById('columnCheckboxes');
        container.innerHTML = '';
        
        this.availableColumns.forEach(column => {
            const colDiv = document.createElement('div');
            colDiv.className = 'col-md-4 column-checkbox';
            
            colDiv.innerHTML = `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${column.name}" 
                           id="col_${column.name}" checked>
                    <label class="form-check-label" for="col_${column.name}">
                        ${column.name} <small class="text-muted">(${column.type})</small>
                    </label>
                </div>
            `;
            
            container.appendChild(colDiv);
        });
        
        // Update selected columns when checkboxes change
        container.addEventListener('change', () => {
            this.updateSelectedColumns();
        });
        
        this.updateSelectedColumns();
    }

    updateSelectedColumns() {
        const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]');
        this.selectedColumns = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    selectAllColumns(select) {
        const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = select);
        this.updateSelectedColumns();
    }

    async previewData() {
        if (!this.selectedTable || this.selectedColumns.length === 0) {
            alert('Please select a table and at least one column');
            return;
        }

        try {
            const response = await fetch(`/api/sql/preview/${this.sqlConnectionKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tableName: this.selectedTable,
                    selectedColumns: this.selectedColumns,
                    limit: 10
                })
            });

            const result = await response.json();
            
            if (result.data) {
                this.renderPreviewTable(result.data);
                document.getElementById('dataPreview').classList.remove('d-none');
            }
        } catch (error) {
            console.error('Failed to preview data:', error);
            alert('Failed to preview data');
        }
    }

    renderPreviewTable(data) {
        const table = document.getElementById('previewTable');
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        
        // Clear existing content
        thead.innerHTML = '';
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%" class="text-center">No data found</td></tr>';
            return;
        }
        
        // Create header
        const headerRow = document.createElement('tr');
        Object.keys(data[0]).forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        
        // Create rows
        data.forEach(row => {
            const tr = document.createElement('tr');
            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                td.textContent = value !== null ? value : 'NULL';
                if (value === null) td.classList.add('text-muted');
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    async startMigration() {
        if (!this.validateMigrationInputs()) return;
        
        const migrationData = {
            sqlConnectionKey: this.sqlConnectionKey,
            mongoConnectionKey: this.mongoConnectionKey,
            tableName: this.selectedTable,
            selectedColumns: this.selectedColumns,
            collectionName: document.getElementById('collectionName').value,
            whereClause: document.getElementById('whereClause').value,
            batchSize: parseInt(document.getElementById('batchSize').value) || 1000
        };

        this.showMigrationProgress();
        
        try {
            const response = await fetch('/api/migration/migrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(migrationData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showMigrationSuccess(result);
            } else {
                this.showMigrationError(result.error);
            }
        } catch (error) {
            this.showMigrationError(`Migration failed: ${error.message}`);
        }
    }

    validateMigrationInputs() {
        if (!this.sqlConnectionKey) {
            alert('Please connect to SQL database first');
            return false;
        }
        
        if (!this.mongoConnectionKey) {
            alert('Please connect to MongoDB first');
            return false;
        }
        
        if (!this.selectedTable) {
            alert('Please select a table');
            return false;
        }
        
        if (this.selectedColumns.length === 0) {
            alert('Please select at least one column');
            return false;
        }
        
        if (!document.getElementById('collectionName').value.trim()) {
            alert('Please enter a collection name');
            return false;
        }
        
        return true;
    }

    showMigrationProgress() {
        const progressDiv = document.getElementById('migrationProgress');
        const statusDiv = document.getElementById('migrationStatus');
        
        progressDiv.classList.remove('d-none');
        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Migration in progress...';
        
        document.getElementById('startMigration').disabled = true;
    }

    showMigrationSuccess(result) {
        const statusDiv = document.getElementById('migrationStatus');
        statusDiv.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> ${result.message}
                <br><small>Migrated ${result.migratedCount} records in ${result.totalBatches} batches</small>
            </div>
        `;
        
        document.getElementById('startMigration').disabled = false;
    }

    showMigrationError(error) {
        const statusDiv = document.getElementById('migrationStatus');
        statusDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i> ${error}
            </div>
        `;
        
        document.getElementById('startMigration').disabled = false;
    }

    checkMigrationReady() {
        if (this.sqlConnectionKey && this.mongoConnectionKey) {
            document.getElementById('migrationSection').classList.remove('d-none');
            document.getElementById('cdcSection').classList.remove('d-none');
            this.loadCdcTables();
            this.startCdcJobsRefresh();
        }
    }

    // CDC Methods
    async loadCdcTables() {
        try {
            const response = await fetch(`/api/sql/tables/${this.sqlConnectionKey}`);
            const result = await response.json();
            
            if (result.tables) {
                const cdcTableSelect = document.getElementById('cdcTableSelect');
                cdcTableSelect.innerHTML = '<option value="">Select a table</option>';
                
                result.tables.forEach(table => {
                    const option = document.createElement('option');
                    option.value = table;
                    option.textContent = table;
                    cdcTableSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load CDC tables:', error);
        }
    }

    async loadCdcTableColumns(tableName) {
        try {
            const response = await fetch(`/api/sql/columns/${this.sqlConnectionKey}/${tableName}`);
            const result = await response.json();
            
            if (result.columns) {
                const timestampSelect = document.getElementById('timestampColumn');
                const primaryKeySelect = document.getElementById('primaryKeyColumn');
                
                // Clear existing options
                timestampSelect.innerHTML = '<option value="">Select timestamp column</option>';
                primaryKeySelect.innerHTML = '<option value="">Select primary key</option>';
                
                result.columns.forEach(column => {
                    // Add to timestamp column dropdown (look for common timestamp column names)
                    const timestampOption = document.createElement('option');
                    timestampOption.value = column.name;
                    timestampOption.textContent = `${column.name} (${column.type})`;
                    timestampSelect.appendChild(timestampOption);
                    
                    // Add to primary key dropdown
                    const pkOption = document.createElement('option');
                    pkOption.value = column.name;
                    pkOption.textContent = `${column.name} (${column.type})`;
                    primaryKeySelect.appendChild(pkOption);
                });
                
                // Auto-select common timestamp columns
                const commonTimestampNames = ['updated_at', 'modified_at', 'last_modified', 'timestamp', 'created_at'];
                for (const name of commonTimestampNames) {
                    const option = timestampSelect.querySelector(`option[value="${name}"]`);
                    if (option) {
                        timestampSelect.value = name;
                        break;
                    }
                }
                
                // Auto-select common primary key columns
                const commonPkNames = ['id', 'pk', 'primary_key', `${tableName}_id`];
                for (const name of commonPkNames) {
                    const option = primaryKeySelect.querySelector(`option[value="${name}"]`);
                    if (option) {
                        primaryKeySelect.value = name;
                        break;
                    }
                }
                
                // Auto-fill collection name
                document.getElementById('cdcCollectionName').value = tableName;
            }
        } catch (error) {
            console.error('Failed to load CDC table columns:', error);
        }
    }

    async testCdcConfiguration() {
        const tableName = document.getElementById('cdcTableSelect').value;
        const timestampColumn = document.getElementById('timestampColumn').value;
        const primaryKeyColumn = document.getElementById('primaryKeyColumn').value;
        
        if (!tableName || !timestampColumn || !primaryKeyColumn) {
            alert('Please select table, timestamp column, and primary key column');
            return;
        }

        try {
            const response = await fetch('/api/cdc/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sqlConnectionKey: this.sqlConnectionKey,
                    tableName,
                    timestampColumn,
                    primaryKeyColumn,
                    selectedColumns: this.selectedColumns,
                    whereClause: document.getElementById('cdcWhereClause').value
                })
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`CDC Configuration Test Passed!\n\nFound ${result.sampleData.length} sample records.\nTimestamp column: ${result.timestampColumnValid ? '✓' : '✗'}\nPrimary key column: ${result.primaryKeyColumnValid ? '✓' : '✗'}`);
            } else {
                alert(`CDC Configuration Test Failed:\n${result.error}`);
            }
        } catch (error) {
            alert(`Test failed: ${error.message}`);
        }
    }

    async startCdcJob() {
        const cdcData = {
            sqlConnectionKey: this.sqlConnectionKey,
            mongoConnectionKey: this.mongoConnectionKey,
            tableName: document.getElementById('cdcTableSelect').value,
            collectionName: document.getElementById('cdcCollectionName').value,
            selectedColumns: this.selectedColumns,
            timestampColumn: document.getElementById('timestampColumn').value,
            primaryKeyColumn: document.getElementById('primaryKeyColumn').value,
            pollingInterval: parseInt(document.getElementById('pollingInterval').value) || 5000,
            batchSize: parseInt(document.getElementById('cdcBatchSize').value) || 1000,
            whereClause: document.getElementById('cdcWhereClause').value
        };

        // Validate inputs
        if (!cdcData.tableName || !cdcData.collectionName || !cdcData.timestampColumn || !cdcData.primaryKeyColumn) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const response = await fetch('/api/cdc/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cdcData)
            });

            const result = await response.json();
            
            if (result.success) {
                alert(`CDC Job started successfully!\nJob ID: ${result.jobId}`);
                this.refreshCdcJobs();
                document.getElementById('cdcSetupForm').reset();
            } else {
                alert(`Failed to start CDC job: ${result.error}`);
            }
        } catch (error) {
            alert(`Failed to start CDC job: ${error.message}`);
        }
    }

    async refreshCdcJobs() {
        try {
            const response = await fetch('/api/cdc/jobs');
            const result = await response.json();
            
            if (result.jobs) {
                this.renderCdcJobs(result.jobs);
            }
        } catch (error) {
            console.error('Failed to refresh CDC jobs:', error);
        }
    }

    renderCdcJobs(jobs) {
        const container = document.getElementById('cdcJobsList');
        
        if (jobs.length === 0) {
            container.innerHTML = '<p class="text-muted">No active CDC jobs</p>';
            return;
        }

        container.innerHTML = '';
        
        jobs.forEach(job => {
            const jobCard = document.createElement('div');
            jobCard.className = 'card mb-2';
            jobCard.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="card-title mb-1">${job.tableName} → ${job.collectionName}</h6>
                            <small class="text-muted">
                                Status: <span class="badge bg-${job.isActive ? 'success' : 'secondary'}">${job.isActive ? 'Active' : 'Paused'}</span>
                                | Processed: ${job.stats.totalProcessed}
                                | Interval: ${job.pollingInterval}ms
                            </small>
                            <br>
                            <small class="text-muted">
                                Last run: ${job.stats.lastRun ? new Date(job.stats.lastRun).toLocaleString() : 'Never'}
                                | Errors: ${job.stats.errors}
                            </small>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-warning" onclick="app.pauseResumeJob('${job.jobId}', ${job.isActive})">
                                <i class="fas fa-${job.isActive ? 'pause' : 'play'}"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="app.stopCdcJob('${job.jobId}')">
                                <i class="fas fa-stop"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(jobCard);
        });
    }

    async pauseResumeJob(jobId, isActive) {
        const action = isActive ? 'pause' : 'resume';
        
        try {
            const response = await fetch(`/api/cdc/${action}/${jobId}`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                this.refreshCdcJobs();
            } else {
                alert(`Failed to ${action} job: ${result.error}`);
            }
        } catch (error) {
            alert(`Failed to ${action} job: ${error.message}`);
        }
    }

    async stopCdcJob(jobId) {
        if (!confirm('Are you sure you want to stop this CDC job?')) {
            return;
        }

        try {
            const response = await fetch(`/api/cdc/stop/${jobId}`, {
                method: 'POST'
            });

            const result = await response.json();
            
            if (result.success) {
                this.refreshCdcJobs();
            } else {
                alert(`Failed to stop job: ${result.error}`);
            }
        } catch (error) {
            alert(`Failed to stop job: ${error.message}`);
        }
    }

    startCdcJobsRefresh() {
        // Refresh CDC jobs every 10 seconds
        if (this.cdcRefreshInterval) {
            clearInterval(this.cdcRefreshInterval);
        }
        
        this.cdcRefreshInterval = setInterval(() => {
            this.refreshCdcJobs();
        }, 10000);
        
        // Initial load
        this.refreshCdcJobs();
    }

    showStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.innerHTML = `<div class="status-${type}"><i class="fas fa-${type === 'success' ? 'check' : 'exclamation-triangle'}"></i> ${message}</div>`;
    }

    showLoading(formId) {
        const form = document.getElementById(formId);
        form.classList.add('loading');
        const button = form.querySelector('button[type="submit"]');
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Connecting...';
        button.disabled = true;
    }

    hideLoading(formId) {
        const form = document.getElementById(formId);
        form.classList.remove('loading');
        const button = form.querySelector('button[type="submit"]');
        const originalText = formId === 'sqlConnectionForm' ? 
            '<i class="fas fa-plug"></i> Connect to SQL Database' : 
            '<i class="fas fa-plug"></i> Connect to MongoDB';
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MigrationApp();
});