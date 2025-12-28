---
name: excel-processor
description: |
  Guide for Excel file processing.
  Use when:
  - Reading or writing Excel files (.xlsx, .xls)
  - Processing large spreadsheets efficiently
  - Converting Excel column references (e.g., XA, AA, BZ)
---

# Excel File Processing Guide

## Getting File Info

Before processing, use the `xlsx` MCP tool to get file metadata:

```
xlsx tool:
  operation: "get-info"
  xlsxFile: "path/to/file.xlsx"
```

This returns: sheet names, row/column counts, formulas presence, and more.

## Large File Handling

- Use `xlsx get-info` to obtain file information (size, sheets, rows, columns) before processing
- NEVER iterate through all cells of an unknown-size Excel file directly
- For files with 500+ columns or 1000+ rows, prefer pandas over openpyxl cell-by-cell operations

## Excel Column Reference Conversion

When users specify columns using Excel notation (e.g., XA, XR, AA, BZ):

```python
def excel_col_to_num(col: str) -> int:
    """Convert Excel column letter to 0-based index. A=0, B=1, ..., Z=25, AA=26"""
    result = 0
    for char in col.upper():
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1

def num_to_excel_col(n: int) -> str:
    """Convert 0-based index to Excel column letter."""
    result = ""
    n += 1
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(65 + remainder) + result
    return result
```

ALWAYS clarify with user if column reference is ambiguous (column name vs column position).

## Performance Optimization

Use pandas parameters to limit data range:

```python
# Specify exact columns needed
df = pd.read_excel(file, usecols=[0, 1, 5, 10], skiprows=29, nrows=1000)

# Or use column letters
df = pd.read_excel(file, usecols="A:C,E,G:J")
```

## Token Efficiency

- Avoid reading large data and passing back to LLM
- Limit preview output to essential confirmation messages
- Avoid printing full dataframes unless debugging

```python
# Good: Summary only
print(f"Loaded {len(df)} rows, {len(df.columns)} columns")
print(df.head(3))

# Bad: Full dataframe
print(df)  # Avoid this for large files
```

## Common Operations

### Read with specific sheet
```python
df = pd.read_excel(file, sheet_name="Sheet1")
```

### Write preserving formatting
```python
from openpyxl import load_workbook

# Load existing workbook to preserve formatting
wb = load_workbook(file)
ws = wb.active

# Modify specific cells
ws['A1'] = "New Value"

wb.save(file)
```

### Multiple sheets
```python
# Read all sheets
dfs = pd.read_excel(file, sheet_name=None)  # Returns dict

# Write multiple sheets
with pd.ExcelWriter(file) as writer:
    df1.to_excel(writer, sheet_name="Data")
    df2.to_excel(writer, sheet_name="Summary")
```
