# Cross-format Workflows

## Data to workbook to presentation

1. Preserve raw source data separately.
2. Clean and calculate in a reproducible workbook or script.
3. Build summary tables and charts from defined ranges.
4. Transfer only presentation-ready evidence to PPTX.
5. Verify every displayed number against the workbook.
6. Deliver the workbook as evidence when appropriate and the PPTX/PDF as communication artifacts.

## Template plus spreadsheet data

1. Inspect both the template and data schema.
2. Define an explicit mapping between source fields and target placeholders/cells.
3. Validate missing, duplicate, and malformed values before filling.
4. Preserve the template's layout, styles, formulas, and protected regions.
5. Generate to a new path and compare representative records or pages.

## Office document to PDF

1. Validate the editable source first.
2. Recalculate spreadsheets and refresh required fields/links.
3. Convert using LibreOffice or the native Office application.
4. Compare page/slide count and render the PDF.
5. Inspect page breaks, fonts, images, charts, headers, and links.
6. Keep the editable source unless fixed-output-only delivery was requested.

## PDF to editable document

1. Inspect whether the PDF contains embedded text or scanned images.
2. Convert only when editing is truly required.
3. Compare structure, tables, images, headers, and reading order against rendered pages.
4. Rebuild complex layouts rather than pretending the conversion is lossless.
5. Preserve the original PDF as the reference source.

## Repeated batch workflow

- Test on a representative small sample before processing all files.
- Use deterministic filenames and avoid source overwrite.
- Log success, failure, skipped files, and validation results.
- Stop or quarantine individual failures rather than silently producing partial outputs.
- Spot-check edge cases and a random sample after the batch completes.
