# Workbook Validation Checklist

Apply checks proportional to the workbook's risk and purpose.

## Structural checks

- Reopen the saved file successfully.
- Confirm expected sheet names, order, visibility, used ranges, tables, and named ranges.
- Confirm no unintended sheets, rows, columns, or temporary data remain.
- Compare the original and output when editing an existing workbook.

## Data and formula checks

- Check required fields, row counts, totals, uniqueness, and sample records against the source.
- Check types, dates, leading zeros, decimal precision, blanks, and error values.
- Inspect formulas for shifted ranges, hard-coded assumptions, circular references, and inconsistent copying.
- Recalculate in Excel/LibreOffice after formula changes; libraries may preserve stale cached results.
- Check external links, connections, pivots, and macros when present and report anything not refreshed.

## Interaction checks

- Test filters, frozen panes, validation lists, protected cells, editable cells, and conditional formatting.
- Confirm new rows inherit formulas, styles, and validations when the workbook is meant to grow.
- Verify sorting does not detach labels, totals, or related data.

## Visual checks

- Inspect every user-facing sheet at a realistic zoom.
- Check truncation, wrapping, overlaps, inconsistent formats, weak contrast, and ambiguous inputs.
- Check charts for correct ranges, legible labels, meaningful scales, and accurate titles.
- Check key sheets in Excel/LibreOffice rather than trusting library output alone.

## Print checks

- Inspect print preview or converted PDF for each printable sheet.
- Verify paper size, orientation, margins, page breaks, repeated headers, scaling, and page order.
- Confirm signatures, totals, notes, and approval blocks are not split incorrectly.

## Delivery checks

- Preserve the source unless overwrite was requested.
- Use a clear output filename and remove temporary artifacts.
- State whether recalculation, macro execution, external refresh, or exact Excel rendering was not verified.
