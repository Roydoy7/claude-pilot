# Workbook Modes

Choose a primary mode from the workbook's job. Combine modes deliberately rather than applying every convention at once.

## Register or operational list

Examples: customer register, case tracker, asset inventory, inquiry log.

- Keep one record per row and stable fields per column.
- Use an Excel Table, filters, frozen headers, validation lists, and normalized status fields.
- Avoid merged cells, blank separator rows, decorative totals, and color-only status encoding.
- Make ownership, due dates, status, and exceptions easy to scan.

## Form, application, or inspection sheet

Examples: 申請書, 稟議書, 作業報告書, 点検票.

- Design for the target paper size and submission process first.
- Distinguish instructions, editable fields, calculated fields, and approval areas.
- Permit merges and detailed borders when they improve the fixed form.
- Protect formulas and fixed labels; set print area, page breaks, and repeating content deliberately.

## Estimate, invoice, order, or delivery note

Examples: 見積書, 請求書, 注文書, 納品書.

- Include document number, parties, issue/due dates, payment terms, line items, totals, and notes as required.
- Calculate subtotal, discounts, taxes, and total with traceable formulas.
- Keep rates and rounding rules configurable; never infer legal or company-specific requirements silently.
- Optimize the customer-facing sheet for print while keeping item data maintainable.

## Schedule, roster, or progress plan

Examples: shift roster, project schedule, reservation chart, Gantt view.

- Store dates and status as real values, not only colored cells.
- Make owners, dependencies, deadlines, weekends, holidays, and exceptions explicit.
- Use conditional formatting for the visual schedule and retain accessible text/status fields.
- Support periodic extension without requiring manual restyling of every new period.

## Checklist, survey, or evaluation

- Use validation, check fields, required-state cues, and consistent answer scales.
- Separate questions, responses, evidence, reviewer notes, and scoring logic.
- Protect fixed prompts and formulas.
- Keep raw responses separate from aggregate results.

## Analysis or management summary

- Separate source data, calculations, and summary presentation.
- Show each KPI with context: current value, target/baseline, variance, trend, and definition.
- Use charts only where comparison, trend, distribution, or relationship is easier to see than in a table.
- State source, period, filters, refresh time, and metric definitions.

## Template filling or constrained editing

- Treat fidelity as the primary quality criterion.
- Change only intended cells and preserve formulas, styles, merged regions, print settings, and named ranges.
- Do not modernize or normalize the template without permission.
- Compare key cells and printed pages before and after editing.

## Data exchange or system import

- Prefer a rectangular table with stable headers, no merges, no decorative rows, and deterministic types.
- Preserve codes and leading zeros.
- Follow the receiving system's exact schema, date representation, encoding, and delimiter rules.
- Remove formulas and formatting only when the contract requires raw values.
