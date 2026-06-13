// ==========================================================================
// FinTabula - App Logic
// ==========================================================================

// Global Application State
let appState = {
    selectedFile: null,
    selectedUrl: null,
    tables: [], // List of {name: str, data: List[List[str]]}
    activeSheetIndex: 0,
    selectedCell: { row: null, col: null },
    serverHasApiKey: false
};

// PDF Previewer State
let pdfDoc = null;
let currentPageNum = 1;
let totalPageCount = 0;
let isRenderingPage = false;
let pageNumPending = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const urlInput = document.getElementById('url-input');
const urlSubmitBtn = document.getElementById('url-submit-btn');
const fileBadge = document.getElementById('file-badge');
const fileNameSpan = document.getElementById('file-name');
const removeFileBtn = document.getElementById('remove-file-btn');
const extractBtn = document.getElementById('extract-btn');

const modeRadios = document.getElementsByName('extraction-mode');
const apiKeyGroup = document.getElementById('api-key-group');
const apiKeyInput = document.getElementById('api-key');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const adminCredentialsGroup = document.getElementById('admin-credentials-group');
const adminUserInput = document.getElementById('admin-user');
const adminPassInput = document.getElementById('admin-pass');
const toggleAdminPasswordBtn = document.getElementById('toggle-admin-password-btn');
const pageRangeInput = document.getElementById('page-range');

const logCard = document.getElementById('log-card');
const logConsole = document.getElementById('log-console');

const activeWorkspace = document.getElementById('active-workspace');
const tablesCountBadge = document.getElementById('tables-count');
const sheetTabs = document.getElementById('sheet-tabs');
const sheetRenameInput = document.getElementById('sheet-rename');
const spreadsheetGrid = document.getElementById('spreadsheet-grid');

const btnAddSheet = document.getElementById('btn-add-sheet');
const btnDeleteSheet = document.getElementById('btn-delete-sheet');
const btnAddRow = document.getElementById('btn-add-row');
const btnAddCol = document.getElementById('btn-add-col');
const btnDelRow = document.getElementById('btn-del-row');
const btnDelCol = document.getElementById('btn-del-col');

const btnExportCsv = document.getElementById('btn-export-csv');
const btnExportXlsx = document.getElementById('btn-export-xlsx');

// Theme Toggle & PDF Preview UI Elements
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const previewCard = document.getElementById('preview-card');
const previewCanvas = document.getElementById('pdf-preview-canvas');
const htmlPreviewFrame = document.getElementById('html-preview-frame');
const previewLoading = document.getElementById('preview-loading');
const pageIndicator = document.getElementById('page-indicator');
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const previewControls = document.querySelector('.preview-controls');
const btnAddCurrentPage = document.getElementById('btn-add-current-page');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const zoomIndicator = document.getElementById('zoom-indicator');
let zoomScale = 1.0;

// Step Containers & Guided Flow Elements
const stepUpload = document.getElementById('step-upload');
const stepConfig = document.getElementById('step-config');
const stepWorkspace = document.getElementById('step-workspace');
const btnBackToConfig = document.getElementById('btn-back-to-config');
const currentPageNumIndicator = document.getElementById('current-page-num-indicator');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Restore Gemini API Key from LocalStorage
    const savedKey = localStorage.getItem('fintabula_gemini_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
    
    // Initialize light/dark theme
    initTheme();
    
    setupEventListeners();
    checkServerConfig();
});

// Check if server already has a Gemini API key loaded
async function checkServerConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (config.has_api_key) {
            appState.serverHasApiKey = true;
            apiKeyInput.placeholder = '•••••••••••• (configured on server)';
            log('Gemini API Key is permanently configured on the backend server.', 'success');
        }
    } catch (err) {
        console.error('Error fetching server config:', err);
    }
}

// ==========================================================================
// Event Listeners Setup
// ==========================================================================
function setupEventListeners() {
    // File upload change
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });
    
    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });
    
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFileSelect(file);
    });
    
    // Remove selected file
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFileInput();
    });

    // URL submit action
    urlSubmitBtn.addEventListener('click', () => {
        handleUrlSelect(urlInput.value.trim());
    });
    
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleUrlSelect(urlInput.value.trim());
        }
    });
    
    // Engine mode toggle
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateEngineView();
        });
    });
    
    // API Key input change -> Save key
    apiKeyInput.addEventListener('input', (e) => {
        localStorage.setItem('fintabula_gemini_key', e.target.value.trim ? e.target.value.trim() : e.target.value);
    });
    
    // Toggle Password Visibility
    togglePasswordBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            togglePasswordBtn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        } else {
            apiKeyInput.type = 'password';
            togglePasswordBtn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
    });

    // Toggle Admin Password Visibility
    toggleAdminPasswordBtn.addEventListener('click', () => {
        if (adminPassInput.type === 'password') {
            adminPassInput.type = 'text';
            toggleAdminPasswordBtn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        } else {
            adminPassInput.type = 'password';
            toggleAdminPasswordBtn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
    });
    
    // Extract Action
    extractBtn.addEventListener('click', runExtraction);
    
    // Sheet Renaming
    sheetRenameInput.addEventListener('input', (e) => {
        updateActiveSheetName(e.target.value);
    });
    
    // Toolbar Actions
    btnAddSheet.addEventListener('click', createNewSheet);
    btnDeleteSheet.addEventListener('click', deleteActiveSheet);
    btnAddRow.addEventListener('click', appendRow);
    btnAddCol.addEventListener('click', appendColumn);
    btnDelRow.addEventListener('click', removeLastRow);
    btnDelCol.addEventListener('click', removeLastColumn);
    
    // Export Actions
    btnExportCsv.addEventListener('click', () => exportData('csv'));
    btnExportXlsx.addEventListener('click', () => exportData('xlsx'));

    // Theme Switcher & PDF Preview Actions
    themeToggleBtn.addEventListener('click', toggleTheme);
    btnPrevPage.addEventListener('click', onPrevPage);
    btnNextPage.addEventListener('click', onNextPage);
    btnAddCurrentPage.addEventListener('click', addCurrentPageToRange);
    btnZoomIn.addEventListener('click', onZoomIn);
    btnZoomOut.addEventListener('click', onZoomOut);
    
    // Back to config action
    btnBackToConfig.addEventListener('click', () => {
        document.body.classList.remove('workspace-active');
        stepWorkspace.classList.add('hidden');
        stepConfig.classList.remove('hidden');
        log('Returned to configuration view.', 'info');
    });

    // Window resize handler for PDF preview re-fit
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (pdfDoc && !stepConfig.classList.contains('hidden')) {
                renderPreviewPage(currentPageNum);
            }
        }, 250);
    });
}

// ==========================================================================
// Control Panel & Form UI Handlers
// ==========================================================================
function handleFileSelect(file) {
    if (!file) return;
    
    const nameLower = file.name.toLowerCase();
    const isPDF = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
    const isHTML = file.type === 'text/html' || nameLower.endsWith('.html') || nameLower.endsWith('.htm');
    
    if (!isPDF && !isHTML) {
        log('Error: Only PDF and HTML documents are allowed.', 'error');
        alert('Please select a valid PDF or HTML file.');
        return;
    }
    
    appState.selectedFile = file;
    fileNameSpan.textContent = file.name;
    
    extractBtn.disabled = false;
    log(`Selected file: ${file.name} (${formatBytes(file.size)})`, 'info');
    
    // Switch view: Hide upload step, show configuration step
    stepUpload.classList.add('hidden');
    stepConfig.classList.remove('hidden');
    stepWorkspace.classList.add('hidden');
    
    if (isPDF) {
        previewCanvas.classList.remove('hidden');
        htmlPreviewFrame.classList.add('hidden');
        htmlPreviewFrame.srcdoc = '';
        previewControls.classList.remove('hidden');
        // Load PDF Preview!
        loadPDF(file);
    } else {
        // Load HTML Preview by first converting it to PDF on the server!
        previewLoading.classList.remove('hidden');
        previewCard.classList.remove('hidden');
        log('Converting HTML file to PDF for preview...', 'info');
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/api/convert-html-to-pdf', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.detail || 'HTML conversion failed'); });
            }
            return response.blob();
        })
        .then(blob => {
            const pdfFileName = file.name.replace(/\.[^/.]+$/, "") + ".pdf";
            const convertedFile = new File([blob], pdfFileName, { type: 'application/pdf' });
            
            appState.selectedFile = convertedFile;
            fileNameSpan.textContent = convertedFile.name;
            
            previewCanvas.classList.remove('hidden');
            htmlPreviewFrame.classList.add('hidden');
            htmlPreviewFrame.srcdoc = '';
            previewControls.classList.remove('hidden');
            
            log('HTML converted to PDF successfully. Loading preview...', 'success');
            loadPDF(convertedFile);
        })
        .catch(err => {
            log(`Error converting HTML to PDF: ${err.message}`, 'error');
            alert(`Failed to convert HTML to PDF: ${err.message}`);
            previewLoading.classList.add('hidden');
            previewCard.classList.add('hidden');
            resetFileInput();
        });
    }
}

function resetFileInput() {
    appState.selectedFile = null;
    appState.selectedUrl = null;
    fileInput.value = '';
    urlInput.value = '';
    extractBtn.disabled = false;
    pageRangeInput.value = '';
    
    // Switch view back to upload step
    stepUpload.classList.remove('hidden');
    stepConfig.classList.add('hidden');
    stepWorkspace.classList.add('hidden');
    
    // Restore default preview card states
    previewCard.classList.remove('hidden');
    previewCanvas.classList.remove('hidden');
    htmlPreviewFrame.classList.add('hidden');
    htmlPreviewFrame.srcdoc = '';
    previewControls.classList.remove('hidden');
    
    document.body.classList.remove('workspace-active');
    
    pdfDoc = null;
    currentPageNum = 1;
    totalPageCount = 0;
    zoomScale = 1.0;
    
    log('Selection cleared.', 'info');
}

async function handleUrlSelect(url) {
    if (!url) {
        alert('Please enter a valid URL.');
        return;
    }
    
    // Simple URL validation
    try {
        new URL(url);
    } catch (_) {
        alert('Please enter a valid, absolute URL (e.g., https://example.com/document.pdf or .html).');
        return;
    }
    
    // Show Loading
    urlSubmitBtn.disabled = true;
    urlSubmitBtn.innerHTML = `<span class="spinner"></span> <span>Fetching...</span>`;
    log(`Attempting to fetch remote document from URL: ${url}`, 'info');
    
    // Show loading on preview card
    previewLoading.classList.remove('hidden');
    previewCard.classList.remove('hidden');
    
    try {
        const formData = new FormData();
        formData.append('url', url);
        
        const response = await fetch('/api/fetch-doc', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.detail || 'Failed to fetch the document from URL.');
        }
        
        const contentType = response.headers.get('content-type') || '';
        const isPdf = contentType.toLowerCase().includes('application/pdf');
        
        appState.selectedUrl = url;
        appState.selectedFile = null;
        fileInput.value = '';
        fileNameSpan.textContent = url;
        extractBtn.disabled = false;
        
        // Switch view: Hide upload step, show configuration step
        stepUpload.classList.add('hidden');
        stepConfig.classList.remove('hidden');
        stepWorkspace.classList.add('hidden');
        
        if (isPdf) {
            log('PDF document fetched successfully. Loading preview...', 'info');
            previewCanvas.classList.remove('hidden');
            htmlPreviewFrame.classList.add('hidden');
            htmlPreviewFrame.srcdoc = '';
            previewControls.classList.remove('hidden');
            
            const blob = await response.blob();
            // Call standard loadPDF with the downloaded PDF blob!
            await loadPDF(blob);
        } else {
            log('HTML document fetched successfully. Loading preview...', 'info');
            previewCanvas.classList.add('hidden');
            htmlPreviewFrame.classList.remove('hidden');
            previewControls.classList.add('hidden');
            
            const htmlText = await response.text();
            htmlPreviewFrame.srcdoc = htmlText;
            previewLoading.classList.add('hidden');
        }
    } catch (err) {
        log(`Error fetching URL: ${err.message}`, 'error');
        alert(`Failed to fetch document: ${err.message}`);
        previewCard.classList.add('hidden');
        previewLoading.classList.add('hidden');
    } finally {
        urlSubmitBtn.disabled = false;
        urlSubmitBtn.innerHTML = `<span>Fetch URL</span>`;
    }
}

function updateEngineView() {
    const selectedMode = getSelectedMode();
    if (selectedMode === 'gemini') {
        apiKeyGroup.classList.remove('hidden');
        adminCredentialsGroup.classList.remove('hidden');
        log('Engine switched to Gemini AI. Requires Google Gemini API Key and Admin Login.', 'warning');
    } else {
        apiKeyGroup.classList.add('hidden');
        adminCredentialsGroup.classList.add('hidden');
        log('Engine switched to Local PDF Engine.', 'info');
    }
}

function getSelectedMode() {
    let mode = 'local';
    modeRadios.forEach(radio => {
        if (radio.checked) mode = radio.value;
    });
    return mode;
}

// ==========================================================================
// Log Console Helpers
// ==========================================================================
function log(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'log-entry timestamp';
    timestampSpan.textContent = `[${timeStr}]`;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    
    entry.appendChild(timestampSpan);
    entry.appendChild(textSpan);
    
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function clearLogs() {
    logConsole.innerHTML = '';
}

// ==========================================================================
// API Operations
// ==========================================================================
async function runExtraction() {
    if (!appState.selectedFile && !appState.selectedUrl) return;
    
    const mode = getSelectedMode();
    const apiKey = apiKeyInput.value.trim();
    const pageRange = pageRangeInput.value.trim();
    const adminUser = adminUserInput.value.trim();
    const adminPass = adminPassInput.value;
    
    if (mode === 'gemini') {
        if (!apiKey && !appState.serverHasApiKey) {
            alert('Please enter a valid Gemini API Key to run the AI engine.');
            log('Error: API key is missing for Gemini engine.', 'error');
            apiKeyInput.focus();
            return;
        }
        if (!adminUser || !adminPass) {
            alert('Please enter Admin credentials to use the Gemini AI engine.');
            log('Error: Admin credentials are required for Gemini AI.', 'error');
            if (!adminUser) adminUserInput.focus();
            else adminPassInput.focus();
            return;
        }
    }
    
    // UI State Loading
    logCard.classList.remove('hidden');
    clearLogs();
    log(`Starting table extraction using ${mode === 'gemini' ? 'Gemini AI' : 'Local PDFplumber'}...`, 'info');
    
    if (appState.selectedFile) {
        log(`Document: ${appState.selectedFile.name}`, 'info');
    } else if (appState.selectedUrl) {
        log(`Document URL: ${appState.selectedUrl}`, 'info');
    }
    
    if (pageRange) log(`Page constraint: ${pageRange}`, 'info');
    
    setExtractButtonLoading(true);
    
    // Build Form Data
    const formData = new FormData();
    if (appState.selectedFile) {
        formData.append('file', appState.selectedFile);
    } else if (appState.selectedUrl) {
        formData.append('url', appState.selectedUrl);
    }
    formData.append('mode', mode);
    if (pageRange) formData.append('pages', pageRange);
    if (mode === 'gemini' && apiKey) formData.append('api_key', apiKey);
    if (mode === 'gemini') {
        formData.append('admin_user', adminUser);
        formData.append('admin_pass', adminPass);
    }
    
    try {
        log('Sending document to parsing server...', 'info');
        const response = await fetch('/api/extract', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || 'Extraction request failed.');
        }
        
        log(`Extraction completed successfully! Found ${result.tables.length} tables.`, 'success');
        
        appState.tables = result.tables;
        appState.activeSheetIndex = 0;
        
        // Switch view: Hide config step, show workspace step, and hide logs
        stepConfig.classList.add('hidden');
        logCard.classList.add('hidden');
        stepWorkspace.classList.remove('hidden');
        document.body.classList.add('workspace-active');
        
        // Show Workspace
        renderWorkspace();
        
    } catch (err) {
        log(`Error: ${err.message}`, 'error');
        alert(`Failed to extract tables: ${err.message}`);
    } finally {
        setExtractButtonLoading(false);
    }
}

function setExtractButtonLoading(isLoading) {
    if (isLoading) {
        extractBtn.disabled = true;
        extractBtn.innerHTML = `<span class="spinner"></span> <span>Extracting...</span>`;
    } else {
        extractBtn.disabled = false;
        extractBtn.innerHTML = `<span>Extract Tables</span> <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
    }
}

// ==========================================================================
// Workspace Renderer & Controllers
// ==========================================================================
function renderWorkspace() {
    if (!appState.tables || appState.tables.length === 0) {
        activeWorkspace.classList.add('hidden');
        return;
    }
    
    activeWorkspace.classList.remove('hidden');
    
    tablesCountBadge.textContent = `${appState.tables.length} Sheet${appState.tables.length > 1 ? 's' : ''}`;
    
    renderTabs();
    renderActiveGrid();
}

function renderTabs() {
    sheetTabs.innerHTML = '';
    
    appState.tables.forEach((table, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `sheet-tab ${index === appState.activeSheetIndex ? 'active' : ''}`;
        
        // Tab Text
        const textSpan = document.createElement('span');
        textSpan.textContent = table.name || `Table ${index + 1}`;
        tab.appendChild(textSpan);
        
        // Switch tab action
        tab.addEventListener('click', () => {
            appState.activeSheetIndex = index;
            renderWorkspace();
        });
        
        sheetTabs.appendChild(tab);
    });
    
    // Set rename input value
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (activeTable) {
        sheetRenameInput.value = activeTable.name;
    }
}

function renderActiveGrid() {
    spreadsheetGrid.innerHTML = '';
    const activeTable = appState.tables[appState.activeSheetIndex];
    
    if (!activeTable || !activeTable.data || activeTable.data.length === 0) {
        spreadsheetGrid.innerHTML = '<tr><td style="padding: 1.5rem; text-align: center; color: var(--text-muted);">This sheet is empty.</td></tr>';
        return;
    }
    
    const data = activeTable.data;
    
    // Find the max number of columns in any row
    let maxCols = 0;
    data.forEach(row => {
        if (row.length > maxCols) maxCols = row.length;
    });
    
    // 1. Render Header Row (Letters A, B, C...)
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Top-left corner cell (empty)
    const cornerTh = document.createElement('th');
    cornerTh.className = 'row-index';
    cornerTh.textContent = '';
    headerRow.appendChild(cornerTh);
    
    for (let c = 0; c < maxCols; c++) {
        const colTh = document.createElement('th');
        colTh.textContent = getColLetter(c);
        headerRow.appendChild(colTh);
    }
    thead.appendChild(headerRow);
    spreadsheetGrid.appendChild(thead);
    
    // 2. Render Body Rows
    const tbody = document.createElement('tbody');
    data.forEach((row, rIdx) => {
        const tr = document.createElement('tr');
        
        // Index cell
        const indexTd = document.createElement('td');
        indexTd.className = 'row-index-cell';
        indexTd.textContent = rIdx + 1;
        tr.appendChild(indexTd);
        
        // Data cells
        for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const td = document.createElement('td');
            const val = cIdx < row.length ? row[cIdx] : '';
            td.textContent = val;
            td.contentEditable = 'true';
            
            // Align cell contents based on whether it is a number
            applyAlignmentClass(td, val);
            
            // Sync content back to state on blur/edit
            td.addEventListener('blur', (e) => {
                const newVal = e.target.textContent;
                updateCellValue(rIdx, cIdx, newVal);
                applyAlignmentClass(td, newVal);
            });
            
            // Save cell coordinates on click
            td.addEventListener('focus', () => {
                appState.selectedCell = { row: rIdx, col: cIdx };
                highlightActiveRowCol(rIdx, cIdx);
            });
            
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });
    
    spreadsheetGrid.appendChild(tbody);
}

// Convert 0 -> A, 1 -> B, 26 -> AA...
function getColLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

function applyAlignmentClass(element, text) {
    element.className = ''; // reset
    const val = text.trim();
    if (!val) return;
    
    // Numeric check (including negatives in parens, currencies, % symbols)
    const isNum = /^\(?[$\-]?\d+([,.]\d+)?%?\)?$/.test(val);
    if (isNum) {
        element.classList.add('align-right');
    } else {
        element.classList.add('align-left');
    }
}

function updateCellValue(row, col, value) {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable) return;
    
    // Make sure the row exists
    if (!activeTable.data[row]) {
        activeTable.data[row] = [];
    }
    
    // Fill in columns with empty strings if necessary
    while (activeTable.data[row].length <= col) {
        activeTable.data[row].push('');
    }
    
    activeTable.data[row][col] = value;
}

function updateActiveSheetName(newName) {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable) return;
    
    activeTable.name = newName;
    
    // Update Tab Text dynamically without fully rebuilding grid
    const activeTab = sheetTabs.children[appState.activeSheetIndex];
    if (activeTab) {
        activeTab.querySelector('span').textContent = newName || `Table ${appState.activeSheetIndex + 1}`;
    }
}

function highlightActiveRowCol(activeRow, activeCol) {
    const rows = spreadsheetGrid.querySelectorAll('tbody tr');
    rows.forEach((tr, rIdx) => {
        const tds = tr.querySelectorAll('td');
        tds.forEach((td, cIdx) => {
            // Check if cell matches indices (adjusting by +1 due to row index cell in html table)
            if (rIdx === activeRow || cIdx === (activeCol + 1)) {
                td.classList.add('selected-cell');
            } else {
                td.classList.remove('selected-cell');
            }
        });
    });
}

// ==========================================================================
// Toolbar Functions (Add / Delete / Row / Column)
// ==========================================================================
function createNewSheet() {
    const newIdx = appState.tables.length;
    const newTable = {
        name: `Sheet ${newIdx + 1}`,
        data: [
            ['Header A', 'Header B', 'Header C'],
            ['', '', ''],
            ['', '', '']
        ]
    };
    appState.tables.push(newTable);
    appState.activeSheetIndex = newIdx;
    
    log(`Created new sheet: ${newTable.name}`, 'info');
    renderWorkspace();
}

function deleteActiveSheet() {
    if (appState.tables.length === 0) return;
    
    const sheetName = appState.tables[appState.activeSheetIndex].name;
    
    if (confirm(`Are you sure you want to delete "${sheetName}"?`)) {
        appState.tables.splice(appState.activeSheetIndex, 1);
        
        // Adjust active index
        if (appState.activeSheetIndex >= appState.tables.length) {
            appState.activeSheetIndex = Math.max(0, appState.tables.length - 1);
        }
        
        log(`Deleted sheet: ${sheetName}`, 'warning');
        renderWorkspace();
    }
}

function appendRow() {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable || !activeTable.data) return;
    
    // Determine column length
    let colLen = 3; // default
    if (activeTable.data.length > 0) {
        colLen = activeTable.data[0].length;
    }
    
    const newRow = Array(colLen).fill('');
    activeTable.data.push(newRow);
    
    renderActiveGrid();
    log('Added row.', 'info');
}

function appendColumn() {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable || !activeTable.data) return;
    
    activeTable.data.forEach(row => {
        row.push('');
    });
    
    renderActiveGrid();
    log('Added column.', 'info');
}

function removeLastRow() {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable || !activeTable.data || activeTable.data.length <= 1) {
        alert('Cannot remove the last remaining row.');
        return;
    }
    
    // If a cell was selected, we could remove that specific row, 
    // but for simplicity we remove the last row.
    activeTable.data.pop();
    renderActiveGrid();
    log('Removed row.', 'info');
}

function removeLastColumn() {
    const activeTable = appState.tables[appState.activeSheetIndex];
    if (!activeTable || !activeTable.data || activeTable.data.length === 0) return;
    
    if (activeTable.data[0].length <= 1) {
        alert('Cannot remove the last remaining column.');
        return;
    }
    
    activeTable.data.forEach(row => {
        row.pop();
    });
    
    renderActiveGrid();
    log('Removed column.', 'info');
}

// ==========================================================================
// Exports Operations
// ==========================================================================
async function exportData(format = 'xlsx') {
    if (!appState.tables || appState.tables.length === 0) return;
    
    log(`Exporting tables as ${format.toUpperCase()}...`, 'info');
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tables: appState.tables,
                format: format
            })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Export failed.');
        }
        
        // Grab blob and trigger browser download
        const blob = await response.blob();
        
        // Try to read filename from Content-Disposition header
        let filename = `financial_tables_${Date.now()}.${format}`;
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        log(`Download triggered successfully: ${filename}`, 'success');
        
    } catch (err) {
        log(`Export Error: ${err.message}`, 'error');
        alert(`Failed to export data: ${err.message}`);
    }
}

// ==========================================================================
// Miscellaneous Utility Helpers
// ==========================================================================
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ==========================================================================
// Light/Dark Theme Switcher Logic
// ==========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('fintabula_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('fintabula_theme', newTheme);
    updateThemeIcon(newTheme);
    log(`Theme switched to ${newTheme} mode.`, 'info');
}

function updateThemeIcon(theme) {
    if (theme === 'light') {
        // Show moon icon for light mode (meaning: click to switch to dark)
        themeToggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        `;
    } else {
        // Show sun icon for dark mode (meaning: click to switch to light)
        themeToggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        `;
    }
}

// ==========================================================================
// PDF.js Previewer integration
// ==========================================================================
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

async function loadPDF(file) {
    if (!window.pdfjsLib) {
        log('Error: PDF.js is not loaded correctly.', 'error');
        return;
    }
    
    previewLoading.classList.remove('hidden');
    previewCard.classList.remove('hidden');
    
    try {
        const fileURL = URL.createObjectURL(file);
        pdfDoc = await pdfjsLib.getDocument({ url: fileURL }).promise;
        totalPageCount = pdfDoc.numPages;
        currentPageNum = 1;
        zoomScale = 1.0; // Reset zoom to default on new file load
        
        log(`PDF successfully loaded in previewer. Pages: ${totalPageCount}`, 'success');
        await renderPreviewPage(currentPageNum);
        
    } catch (err) {
        console.error('Error loading PDF preview:', err);
        log(`Failed to render PDF preview: ${err.message}`, 'error');
        previewCard.classList.add('hidden');
    } finally {
        previewLoading.classList.add('hidden');
    }
}

async function renderPreviewPage(num) {
    if (!pdfDoc) return;
    
    isRenderingPage = true;
    previewLoading.classList.remove('hidden');
    
    try {
        const page = await pdfDoc.getPage(num);
        const canvas = previewCanvas;
        const context = canvas.getContext('2d');
        
        // Compute base scale to fit container width and height, and apply zoom factor
        const containerWidth = canvas.parentElement.clientWidth - 40 || 300;
        const containerHeight = canvas.parentElement.clientHeight - 40 || 500;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const baseScale = Math.min(containerWidth / unscaledViewport.width, containerHeight / unscaledViewport.height);
        const scale = baseScale * zoomScale;
        const viewport = page.getViewport({ scale: scale });
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        isRenderingPage = false;
        
        // Update labels and indicators
        pageIndicator.textContent = `Page ${num} of ${totalPageCount}`;
        currentPageNumIndicator.textContent = num;
        btnPrevPage.disabled = (num <= 1);
        btnNextPage.disabled = (num >= totalPageCount);
        
        // Update zoom percentage text
        zoomIndicator.textContent = `${Math.round(zoomScale * 100)}%`;
        
        // Process any pending pages
        if (pageNumPending !== null) {
            const nextNum = pageNumPending;
            pageNumPending = null;
            renderPreviewPage(nextNum);
        }
    } catch (err) {
        console.error('Error rendering page:', err);
        isRenderingPage = false;
    } finally {
        previewLoading.classList.add('hidden');
    }
}

function queueRenderPage(num) {
    if (isRenderingPage) {
        pageNumPending = num;
    } else {
        renderPreviewPage(num);
    }
}

function onPrevPage() {
    if (!pdfDoc || currentPageNum <= 1) return;
    currentPageNum--;
    queueRenderPage(currentPageNum);
}

function onNextPage() {
    if (!pdfDoc || currentPageNum >= totalPageCount) return;
    currentPageNum++;
    queueRenderPage(currentPageNum);
}

function addCurrentPageToRange() {
    if (!pdfDoc) return;
    
    const currentVal = pageRangeInput.value.trim();
    if (!currentVal) {
        pageRangeInput.value = currentPageNum;
    } else {
        const parts = currentVal.split(',').map(p => p.trim());
        if (!parts.includes(String(currentPageNum))) {
            pageRangeInput.value = currentVal + `, ${currentPageNum}`;
        }
    }
    log(`Added page ${currentPageNum} to extraction page ranges.`, 'info');
}

function onZoomIn() {
    if (!pdfDoc) return;
    if (zoomScale >= 3.0) return; // Cap zoom at 300%
    zoomScale *= 1.25;
    renderPreviewPage(currentPageNum);
}

function onZoomOut() {
    if (!pdfDoc) return;
    if (zoomScale <= 0.5) return; // Cap zoom at 50%
    zoomScale /= 1.25;
    renderPreviewPage(currentPageNum);
}
