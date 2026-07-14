# Japanese Office Conventions

Use these as questions and defaults, not universal mandates. Preserve organization templates and ask only when an unresolved choice materially changes the result.

## Language and typography

- Prefer a Japanese-capable font already used by the template; otherwise use Yu Gothic or Meiryo with sensible fallbacks.
- Check Japanese line wrapping, vertical alignment, punctuation, full-width/half-width characters, and mixed Latin/Japanese text.
- Keep names, company, department, title, and honorific fields separate when they may be reused or sorted.
- Preserve codes, postal codes, phone numbers, and employee numbers as text when leading zeros matter.

## Dates and periods

- Determine whether the artifact uses Gregorian dates, Japanese era dates, or both.
- Determine the fiscal-year start instead of assuming January; April-start fiscal years are common.
- Distinguish calendar days, business days, deadlines, and accounting periods.
- Make weekends and Japanese holidays visible in schedules when relevant; do not hard-code a holiday list without a reliable source.

## Money, tax, and accounting

- Use yen formats consistently and omit decimals only when the business rule calls for it.
- Make tax category, rate, rounding unit, and rounding direction explicit inputs or documented formulas.
- Do not hard-code current tax or invoice-system rules into a reusable workbook.
- Choose a clear convention for negative amounts, zeros, and totals and apply it consistently.

## Print-centered work

- Expect A4/A3, page scaling, repeating titles, explicit print areas, and manual page breaks to matter.
- Inspect both Excel view and printed/PDF output; they may differ because of font substitution and scaling.
- Allow approval, confirmation, seal, and routing fields when the business process needs them.
- Avoid shrinking a sheet until text becomes unreadable merely to force it onto one page.

## Existing workbook culture

- Expect hidden sheets, external links, macros, copied formulas, manual color conventions, and long-lived templates.
- Preserve opaque structures until their role is understood.
- Prefer a minimal targeted edit over a broad cleanup.
- Warn before removing macros, links, protection, validation, or print definitions.
