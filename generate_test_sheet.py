import io
import openpyxl
from parser import extract_tables_local
from main import format_excel_workbook

print("Extracting tables from PDF...")
tables = extract_tables_local('/Users/mangalam/Downloads/10-K PL Cons.pdf', '49-50')

print("Generating Excel workbook...")
wb = openpyxl.Workbook()
wb.remove(wb.active)

for idx, table in enumerate(tables):
    sheet_name = table["name"].strip()[:30]
    ws = wb.create_sheet(title=sheet_name)
    for row in table["data"]:
        ws.append(row)

out = io.BytesIO()
wb.save(out)
out.seek(0)

print("Applying formatting...")
formatted_out = format_excel_workbook(out)

output_path = '/Users/mangalam/Desktop/Data Scraper /test_extracted.xlsx'
with open(output_path, 'wb') as f:
    f.write(formatted_out.getvalue())

print(f"Excel sheet saved successfully to {output_path}!")
