---
name: excel-processor
description: Create, edit, analyze, validate, and convert Excel workbooks for operational and presentation use. Use for XLSX/XLS/CSV data, registers and ledgers, Japanese business forms, applications, estimates and invoices, schedules, checklists, analysis, dashboards, template filling, print-ready sheets, and formatting-preserving workbook changes.
---

# Excel Processing

## Start with intent, not a fixed style

Classify the workbook before designing it:

- Decide whether it is for data exchange, repeated entry, operational tracking, calculation, analysis, management communication, or printing.
- Identify the audience, update frequency, screen/print use, collaboration needs, and template constraints.
- Preserve an existing organization-provided format unless the user requests redesign.

Read [workbook-modes.md](references/workbook-modes.md) to select the closest common mode. Combine modes when necessary, such as a register with a management summary.

For Japanese business use, read [japan-office-conventions.md](references/japan-office-conventions.md). Do not assume that a minimalist dashboard is better than a dense but usable 帳票.

## Choose the tool path

1. Inspect existing `.xlsx` files with `mcp__xlsx__xlsx` using `get-info` before reading cells.
2. Use pandas for analysis, filtering, reshaping, joins, and large tabular data.
3. Use openpyxl for formatting-preserving edits to existing `.xlsx`/`.xlsm` workbooks.
4. Use ExcelJS for new styled `.xlsx` workbooks when TypeScript is the better fit.
5. Convert legacy `.xls` to `.xlsx` with `mcp__convert__convert` before structured editing. Do not pass `.xls` to the XLSX inspector.
6. Use Excel desktop automation when recalculation, macros, external links, advanced charts, or exact Excel rendering matter.

Never iterate every cell of an unknown workbook. Inspect dimensions first and load only necessary sheets, columns, and rows. Avoid sending complete large tables back to the model.

## Preserve workbook semantics

- Treat one record per row and one stable field per column as the default for machine-readable data.
- Separate raw data, calculations, lookup/master data, and presentation summaries when maintainability matters.
- Preserve formulas, named ranges, tables, validations, conditional formatting, hidden sheets, print settings, and external links unless the task targets them.
- Write numbers and dates as typed values, not formatted strings. Apply display formats separately.
- Keep IDs, postal codes, account codes, and other leading-zero fields as text.
- Avoid hard-coded totals, tax rates, dates, and business assumptions when they can be inputs or formulas.
- Do not claim formula results were recalculated by openpyxl or ExcelJS. Open and recalculate in Excel/LibreOffice when current cached values are required.
- Save to a new file by default.

## Apply fit-for-purpose design

Read [visual-and-print-quality.md](references/visual-and-print-quality.md) before creating or redesigning a user-facing workbook.

Use hierarchy, alignment, number formats, spacing, and restrained color to clarify function. Allow compact layouts, borders, merged cells, and fixed print areas for forms; avoid them in sortable data tables. Make input, formula, reference, and output regions distinguishable without turning the workbook into a color legend.

## Validate before delivery

Follow [validation-checklist.md](references/validation-checklist.md). At minimum:

1. Reopen the saved workbook and verify expected sheets, dimensions, formulas, and styles.
2. Check formula errors, broken links, accidental type conversion, truncated text, and damaged print areas.
3. Recalculate with Excel/LibreOffice when formulas changed.
4. Visually inspect every user-facing sheet in its intended view, including print preview for printed artifacts.
5. Confirm the source file remains unchanged and report any unsupported feature or fidelity risk.
