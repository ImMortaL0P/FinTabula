# FinTabula - Financial Statement Table Extractor

FinTabula is a modern, light, and beautiful web application designed to extract tabular data from financial statements (like Balance Sheets, Income Statements, and Cash Flow Statements) in PDF format and convert them into beautifully styled Excel workbooks or CSV files.

---

## 🚀 Key Features

*   **Dual Extraction Engines**:
    *   **Local Engine (Offline & Free)**: Powered by `pdfplumber` to instantly parse vector-text PDF statements locally.
    *   **Gemini AI Engine (Highly Intelligent)**: Uses Google Gemini 1.5 Flash to intelligently scan and rebuild complex, multi-page, or scanned (image-only) tables into structured formats.
*   **Interactive Spreadsheet Editor**: 
    *   Preview all extracted sheets inside a sleek, dark-themed browser grid.
    *   **Double-click to edit** cell values directly in the browser.
    *   Add/remove rows, columns, rename sheets, and delete sheets before exporting.
*   **Premium Excel Exporting**:
    *   **Zebra striping** for alternate row readability.
    *   **Bold, navy-filled headers** with white text.
    *   **Auto-fitted column widths** (no text truncations!).
    *   **Intelligent cell alignment** (numbers align right, text aligns left).
    *   Gridlines displayed by default.

---

## 🛠️ Quick Start

### 1. Requirements
*   Python 3.10+
*   Google Chrome, Safari, or Firefox browser

### 2. Launching the App
The dependencies have already been set up in your virtual environment. Simply open your terminal and run:

```bash
# 1. Navigate to the project directory
cd "/Users/mangalam/Desktop/Data Scraper"

# 2. Activate the virtual environment
source .venv/bin/activate

# 3. Start the FastAPI server
python -m uvicorn main:app --reload
```

After launching, open your browser and navigate to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 📖 How to Use

1.  **Upload a PDF**: Drag and drop your financial statement PDF into the upload zone or click to select.
2.  **Choose Engine**:
    *   Select **Local Engine** for standard digital statements.
    *   Select **Gemini AI** for complex, multi-page, or scanned statements.
3.  **Authentication for Gemini AI**:
    *   To unlock the Gemini AI mode, enter the Admin credentials:
        *   **Admin Username**: `Admin`
        *   **Admin Password**: `Kukku404#`
    *   Get a free Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey) and enter it in the API Key field.
4.  **Specify Pages (Optional)**: Input page numbers (e.g. `1-3, 5`) to parse only specific pages.
5.  **Extract & Edit**: Click **Extract Tables**. Once loaded, edit in the spreadsheet, and download as Excel or CSV.

---

## 💡 Gemini AI vs. Local Engine: Why Gemini AI is Superior

For high-volume, complex, or official corporate disclosures (like SEC 10-K filings), **Gemini AI** is highly recommended over the Local Engine:

| Feature | Local Engine | Gemini AI Engine |
| :--- | :--- | :--- |
| **Grid Rebuilding** | Uses strict coordinates (susceptible to misalignment if borders are absent) | Semantically parses structured cells based on reading flow |
| **Scanned Documents (OCR)**| Fails or returns garbage text on scanned/image-only PDFs | Extracts text and structure perfectly using multi-modal AI vision |
| **Split Word Prevention** | Minimizes word cuts but can split text on highly dense columns | Word-splitting is impossible since text elements are understood semantically |
| **Hierarchical Headers** | Places multi-level column titles across separate cells | Intelligently handles spanned column headers and merges cells correctly |
| **Footnotes & Disclosures**| Extracts footnotes into disjointed cells across the grid | Reconstructs footnote sentences across margins back into a clean footer |

To transition from Local to Gemini AI, toggle the engine selector in the application, input the Admin credentials (`Admin` / `Kukku404#`), paste your API key, and run the extraction.
