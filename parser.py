import os
import json
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import pdfplumber

# Pydantic schemas for Gemini Structured Output
class TableModel(BaseModel):
    name: str = Field(description="Name of the financial table or section (e.g. 'Balance Sheet', 'Income Statement', 'Note 5')")
    data: List[List[str]] = Field(description="2D array representing rows and columns of the table. Every cell must be a string.")

class FinancialTablesModel(BaseModel):
    tables: List[TableModel]

def parse_pages_string(pages_str: Optional[str], total_pages: int) -> List[int]:
    """
    Parses a page range string (e.g., '1-3, 5, 7-10') into a list of 0-based page indices.
    If pages_str is empty or None, returns all page indices.
    """
    if not pages_str or not pages_str.strip():
        return list(range(total_pages))
    
    pages = set()
    parts = re.split(r'[,\s]+', pages_str.strip())
    for part in parts:
        if not part:
            continue
        if '-' in part:
            try:
                start, end = part.split('-')
                start_idx = max(1, int(start)) - 1
                end_idx = min(total_pages, int(end)) - 1
                for i in range(start_idx, end_idx + 1):
                    pages.add(i)
            except ValueError:
                pass  # Ignore malformed ranges
        else:
            try:
                page_num = int(part)
                if 1 <= page_num <= total_pages:
                    pages.add(page_num - 1)
            except ValueError:
                pass
                
    return sorted(list(pages)) if pages else list(range(total_pages))

def clean_table_data(table: List[List[Optional[str]]]) -> List[List[str]]:
    """
    Cleans extracted table data by replacing None values with empty strings,
    stripping whitespace, and removing entirely empty rows/columns.
    """
    if not table:
        return []
        
    cleaned = []
    for row in table:
        # Convert None to "" and strip whitespace
        cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
        # Only add row if it's not entirely empty
        if any(cell != "" for cell in cleaned_row):
            cleaned.append(cleaned_row)
            
    # Remove entirely empty columns
    if not cleaned:
        return []
        
    num_cols = len(cleaned[0])
    cols_to_keep = []
    for col_idx in range(num_cols):
        col_has_data = False
        for row in cleaned:
            if col_idx < len(row) and row[col_idx] != "":
                col_has_data = True
                break
        if col_has_data:
            cols_to_keep.append(col_idx)
            
    final_table = []
    for row in cleaned:
        final_row = [row[idx] if idx < len(row) else "" for idx in cols_to_keep]
        final_table.append(final_row)
        
    return final_table

def extract_custom_grid(page) -> Optional[List[List[str]]]:
    """
    Intelligently extracts financial tables by identifying horizontal text rows (y-coordinates)
    and vertical number columns (x-coordinates) to segment the page into a clean grid.
    This prevents word-splitting in descriptions and consolidates rows.
    """
    words = page.extract_words()
    if not words:
        return None
        
    # 1. Find vertical dividers (x-coordinates) by clustering numeric words
    num_coords = []
    for w in words:
        text = w['text'].strip()
        # Match numeric values, dashes, and parens
        if re.match(r'^[\$\d,\.\(\)\—\-]+$', text) and any(c.isdigit() or c == '—' for c in text):
            num_coords.append(w)
            
    if not num_coords:
        return None
        
    right_edges = sorted([w['x1'] for w in num_coords])
    
    # Simple proximity-based clustering for right alignments
    clusters = []
    current = []
    for edge in right_edges:
        if not current:
            current.append(edge)
        elif edge - current[-1] < 15:
            current.append(edge)
        else:
            clusters.append(current)
            current = [edge]
    if current:
        clusters.append(current)
        
    centers = []
    for c in clusters:
        avg_x = sum(c) / len(c)
        # Dynamic check based on page width
        if len(c) >= 3 and avg_x > page.width * 0.3:
            centers.append(avg_x)
            
    centers = sorted(centers)
    if not centers:
        return None
        
    col_starts = []
    for idx, center in enumerate(centers):
        # Filter: ONLY use numeric words to define the column's horizontal span
        col_words = []
        for w in words:
            text = w['text'].strip()
            if abs(w['x1'] - center) < 25:
                if re.match(r'^[\$\d,\.\(\)\—\-]+$', text) and any(c.isdigit() or c == '—' for c in text):
                    col_words.append(w)
                    
        leftmost_coords = []
        # Dynamic search space for $: idx > 0 respects previous center; idx == 0 uses larger of 120 or 22% of page width
        left_limit = centers[idx - 1] if idx > 0 else (center - max(120.0, page.width * 0.22))
        
        for cw in col_words:
            leftmost_coords.append(cw['x0'])
            row_words = [w for w in words if abs(w['top'] - cw['top']) < 4 and w['x0'] < cw['x0'] and w['x0'] > left_limit]
            for rw in row_words:
                if rw['text'].strip() == '$':
                    leftmost_coords.append(rw['x0'])
                    
        col_start = min(leftmost_coords) if leftmost_coords else (center - 80)
        col_starts.append(col_start)
        
    # Place dividers to the left of each column group
    v_dividers = []
    v_dividers.append(max(1.0, col_starts[0] - 15))
    for i in range(len(centers) - 1):
        # Divider between column i and column i+1
        # Place it midway between the end of column i (centers[i]) and the start of column i+1 (col_starts[i+1])
        mid = (centers[i] + col_starts[i+1]) / 2
        v_dividers.append(mid)
        
    v_dividers = [0.0] + v_dividers + [page.width]
    
    # 2. Find horizontal dividers (y-coordinates) by grouping words into rows
    words_sorted = sorted(words, key=lambda w: w['top'])
    rows = []
    current_row = []
    for w in words_sorted:
        if not current_row:
            current_row.append(w)
        elif abs(w['top'] - current_row[0]['top']) < 6:
            current_row.append(w)
        else:
            rows.append(current_row)
            current_row = [w]
    if current_row:
        rows.append(current_row)
        
    # Calculate row boundary lines
    h_dividers = [0.0]
    for i in range(len(rows) - 1):
        current_bottom = max(w['bottom'] for w in rows[i])
        next_top = min(w['top'] for w in rows[i+1])
        mid = (current_bottom + next_top) / 2
        h_dividers.append(mid)
    h_dividers.append(page.height)
    
    # Deduplicate and sort divider lists
    v_dividers = sorted(list(set(v_dividers)))
    h_dividers = sorted(list(set(h_dividers)))
    
    # Reconstruct the grid cell text from page words directly, to prevent word-slicing
    num_rows = len(h_dividers) - 1
    num_cols = len(v_dividers) - 1
    
    grid = [[[] for _ in range(num_cols)] for _ in range(num_rows)]
    
    for w in words:
        cx = (w['x0'] + w['x1']) / 2
        cy = (w['top'] + w['bottom']) / 2
        
        # Find row index
        r_idx = -1
        for r in range(num_rows):
            if h_dividers[r] <= cy < h_dividers[r+1]:
                r_idx = r
                break
        if r_idx == -1:
            if cy < h_dividers[0]:
                r_idx = 0
            else:
                r_idx = num_rows - 1
                
        # Find col index
        c_idx = -1
        for c in range(num_cols):
            if v_dividers[c] <= cx < v_dividers[c+1]:
                c_idx = c
                break
        if c_idx == -1:
            if cx < v_dividers[0]:
                c_idx = 0
            else:
                c_idx = num_cols - 1
                
        grid[r_idx][c_idx].append(w)
        
    table = []
    for r in range(num_rows):
        row = []
        # Group first 3 rows of the statement into a single Column 0 cell to prevent split titles
        is_title_row = (r < 3)
        
        if is_title_row:
            all_row_words = []
            for c in range(num_cols):
                all_row_words.extend(grid[r][c])
            
            if all_row_words:
                all_row_words_sorted = sorted(all_row_words, key=lambda w: w['x0'])
                cell_text = " ".join(w['text'].strip() for w in all_row_words_sorted)
                row.append(cell_text)
            else:
                row.append('')
                
            # Rest of the columns in the title row are empty
            for _ in range(1, num_cols):
                row.append('')
        else:
            for c in range(num_cols):
                cell_words = grid[r][c]
                if not cell_words:
                    row.append('')
                else:
                    cell_words_sorted = sorted(cell_words, key=lambda w: w['x0'])
                    cell_text = " ".join(w['text'].strip() for w in cell_words_sorted)
                    row.append(cell_text)
        table.append(row)
        
    if not table:
        return None
        
    # Post-process to clean up cells (strip currency symbols and apply indentation spaces)
    cleaned_table = []
    for r_idx, row in enumerate(table):
        cleaned_row = []
        
        # Calculate indentation spaces for description column
        indent_spaces = ""
        if r_idx < len(rows):
            desc_words = [w for w in rows[r_idx] if w['x0'] < v_dividers[1]]
            if desc_words:
                first_w = desc_words[0]
                row_min_x0 = first_w['x0']
                # Check if it's not a centered header (using coordinate boundary)
                if row_min_x0 < 100:
                    if 20 < row_min_x0 <= 30:
                        indent_spaces = "   "  # 3 spaces (Level 1)
                    elif row_min_x0 > 30:
                        indent_spaces = "      "  # 6 spaces (Level 2)
                        
        for c_idx, cell in enumerate(row):
            if cell is None:
                cleaned_row.append('')
            else:
                val = cell.strip()
                if c_idx == 0:
                    val = val.replace('$', '').strip()
                    if val:
                        val = indent_spaces + val
                cleaned_row.append(val)
        if any(c != '' for c in cleaned_row):
            cleaned_table.append(cleaned_row)
            
    return cleaned_table

def extract_tables_local(pdf_path: str, pages_str: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Extracts tables from a PDF file using pdfplumber locally.
    Uses the optimized custom grid strategy first, falling back to standard extraction if needed.
    """
    extracted_tables = []
    
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        target_pages = parse_pages_string(pages_str, total_pages)
        
        for page_idx in target_pages:
            page = pdf.pages[page_idx]
            
            # Try custom grid extraction (highly optimized for financial tables)
            custom_table = None
            try:
                custom_table = extract_custom_grid(page)
            except Exception as e:
                print(f"Custom grid extraction failed on page {page_idx + 1}: {e}")
                
            if custom_table:
                extracted_tables.append({
                    "name": f"Page {page_idx + 1}",
                    "data": custom_table,
                    "page": page_idx + 1,
                    "source": "local_custom_grid"
                })
            else:
                # Fallback to standard pdfplumber extraction
                page_tables = page.extract_tables()
                for t_idx, table in enumerate(page_tables):
                    cleaned = clean_table_data(table)
                    if cleaned:
                        extracted_tables.append({
                            "name": f"Page {page_idx + 1} - Table {t_idx + 1}",
                            "data": cleaned,
                            "page": page_idx + 1,
                            "source": "local_fallback"
                        })
                        
    return extracted_tables

def extract_tables_ai(pdf_path: str, api_key: str, pages_str: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Extracts tables from a PDF file using Gemini 1.5 Flash API with structured JSON output.
    """
    # Import google-generativeai dynamically to avoid startup error if not configured
    import google.generativeai as genai
    
    genai.configure(api_key=api_key)
    
    # We upload the PDF to Gemini File API
    # Note: File API is recommended for documents, especially larger ones
    print(f"Uploading {pdf_path} to Gemini File API...")
    uploaded_file = genai.upload_file(path=pdf_path, mime_type="application/pdf")
    
    # Check if a subset of pages is requested
    # Wait: Gemini API upload file contains the whole document, but we can specify page range in prompt
    page_constraint = ""
    if pages_str and pages_str.strip():
        page_constraint = f" Only extract tables from the following pages: {pages_str}."
        
    prompt = (
        "You are an expert financial analyst. Analyze this financial statement PDF and extract all structured tables "
        "such as the Balance Sheet, Income Statement, Cash Flow Statement, notes disclosures, and other tabular financial data."
        f"{page_constraint}\n\n"
        "For each table you find:\n"
        "1. Identify its name clearly (e.g. 'Consolidated Balance Sheet', 'Segment Revenues', 'Note 4 - Inventory').\n"
        "2. Extract the table contents exactly as rows and columns. Do not omit rows, totals, or notes within the tables. "
        "Ensure all cells, numbers, headers, and labels are fully preserved as strings. Clean up any weird symbols but keep the numbers intact."
    )
    
    try:
        # We use gemini-2.5-flash as it is fast, highly capable, and low cost
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        print("Sending request to Gemini 2.5 Flash...")
        response = model.generate_content(
            [uploaded_file, prompt],
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=FinancialTablesModel,
                temperature=0.1,  # Low temp for deterministic extraction
            )
        )
        
        # Parse the JSON response
        result = json.loads(response.text)
        
        tables = []
        for idx, table in enumerate(result.get("tables", [])):
            name = table.get("name", f"Table {idx + 1}")
            data = table.get("data", [])
            # Clean data rows
            cleaned_data = clean_table_data(data)
            if cleaned_data:
                tables.append({
                    "name": name,
                    "data": cleaned_data,
                    "page": "AI Extracted",
                    "source": "gemini"
                })
        return tables
        
    finally:
        # Always clean up the uploaded file from Google's servers
        print("Cleaning up file from Gemini File API...")
        try:
            uploaded_file.delete()
        except Exception as e:
            print(f"Error deleting temporary file: {e}")

def extract_tables_from_html_ai(html_content: str, api_key: str) -> List[Dict[str, Any]]:
    """
    Extracts tables from HTML content using Gemini 1.5 Flash API with structured JSON output.
    """
    import google.generativeai as genai
    import json
    
    genai.configure(api_key=api_key)
    
    if len(html_content) > 1500000:
        html_content = html_content[:1500000] + "\n... [HTML Content Truncated due to size] ..."
        
    prompt = (
        "You are an expert financial analyst. Analyze the following HTML document and extract all structured financial tables "
        "such as the Balance Sheet, Income Statement, Cash Flow Statement, notes disclosures, and other tabular financial data.\n\n"
        "Here is the HTML content:\n"
        "```html\n"
        f"{html_content}\n"
        "```\n\n"
        "For each table you find:\n"
        "1. Identify its name clearly (e.g. 'Consolidated Balance Sheet', 'Segment Revenues', 'Note 5 - Inventory').\n"
        "2. Extract the table contents exactly as rows and columns. Do not omit rows, totals, or notes within the tables. "
        "Ensure all cells, numbers, headers, and labels are fully preserved as strings. Clean up any weird symbols but keep the numbers intact."
    )
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        print("Sending HTML request to Gemini 2.5 Flash...")
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=FinancialTablesModel,
                temperature=0.1,
            )
        )
        
        result = json.loads(response.text)
        
        tables = []
        for idx, table in enumerate(result.get("tables", [])):
            name = table.get("name", f"Table {idx + 1}")
            data = table.get("data", [])
            cleaned_data = clean_table_data(data)
            if cleaned_data:
                tables.append({
                    "name": name,
                    "data": cleaned_data,
                    "page": "AI HTML Extracted",
                    "source": "gemini"
                })
        return tables
    except Exception as e:
        print(f"Error extracting tables from HTML: {e}")
        raise e

from html.parser import HTMLParser

class TableOrientationParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.max_cols = 0
        self.current_row_cols = 0
        self.in_row = False
        self.in_style = False
        self.style_content = []
        self.has_landscape_keyword = False

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower == 'tr':
            self.in_row = True
            self.current_row_cols = 0
        elif tag_lower in ('td', 'th') and self.in_row:
            colspan = 1
            for name, value in attrs:
                if name.lower() == 'colspan':
                    try:
                        colspan = int(value)
                    except ValueError:
                        pass
            self.current_row_cols += colspan
        elif tag_lower == 'style':
            self.in_style = True
            
        for name, value in attrs:
            if value and 'landscape' in value.lower():
                self.has_landscape_keyword = True

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower == 'tr':
            self.in_row = False
            if self.current_row_cols > self.max_cols:
                self.max_cols = self.current_row_cols
        elif tag_lower == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.style_content.append(data)

def detect_html_orientation(html_content: str) -> str:
    """
    Detects whether the HTML document should be printed in 'landscape' or 'portrait'.
    """
    # 1. Check if the HTML explicitly asks for landscape or contains landscape css
    if 'landscape' in html_content.lower():
        parser = TableOrientationParser()
        try:
            parser.feed(html_content)
            if parser.has_landscape_keyword:
                return 'landscape'
            
            style_text = "".join(parser.style_content).lower()
            if re.search(r'@page[^}]*size\s*:\s*landscape', style_text):
                return 'landscape'
        except Exception:
            pass

    # 2. Check table columns
    parser = TableOrientationParser()
    try:
        parser.feed(html_content)
        # If any table has 6 or more columns, select landscape orientation
        if parser.max_cols >= 6:
            print(f"Detected wide table with {parser.max_cols} columns. Selecting landscape orientation.")
            return 'landscape'
    except Exception as e:
        print(f"Error parsing HTML structure for orientation: {e}")
        
    return 'portrait'

def convert_html_to_pdf_local(html_content: str, output_pdf_path: str) -> str:
    """
    Converts HTML content to a PDF file using headless Google Chrome.
    Determines page orientation (landscape vs portrait) dynamically.
    """
    import subprocess
    import tempfile
    
    orientation = detect_html_orientation(html_content)
    
    # Inject print stylesheet to force orientation and margins
    print_style = f"""
    <style type="text/css">
    @media print {{
        @page {{
            size: {orientation};
            margin: 0.3in 0.3in 0.3in 0.3in;
        }}
        body {{
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }}
        table {{
            page-break-inside: auto !important;
        }}
        tr {{
            page-break-inside: avoid !important;
            page-break-after: auto !important;
        }}
        thead {{
            display: table-header-group !important;
        }}
        tfoot {{
            display: table-footer-group !important;
        }}
    }}
    </style>
    """
    
    if "</head>" in html_content:
        html_content = html_content.replace("</head>", f"{print_style}</head>", 1)
    elif "<body>" in html_content:
        html_content = html_content.replace("<body>", f"<body>{print_style}", 1)
    else:
        html_content = print_style + html_content

    temp_html_fd, temp_html_path = tempfile.mkstemp(suffix=".html")
    try:
        with os.fdopen(temp_html_fd, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
        chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if not os.path.exists(chrome_path):
            raise FileNotFoundError("Google Chrome was not found at the standard macOS path.")
            
        cmd = [
            chrome_path,
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={output_pdf_path}",
            temp_html_path
        ]
        
        print(f"Running Chrome headless command: {' '.join(cmd)}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        
        if result.returncode != 0:
            raise RuntimeError(f"Chrome PDF generation failed: {result.stderr}")
            
        if not os.path.exists(output_pdf_path) or os.path.getsize(output_pdf_path) == 0:
            raise RuntimeError("Chrome PDF generation completed but output file is empty or missing.")
            
        print(f"Successfully generated PDF: {output_pdf_path} (orientation: {orientation})")
        return orientation
        
    finally:
        if os.path.exists(temp_html_path):
            try:
                os.remove(temp_html_path)
            except Exception as e:
                print(f"Error removing temp HTML file: {e}")

