# Accessibility and Localization

## Accessibility

- Use semantic headings, table headers, reading order, and descriptive links.
- Provide alternative descriptions or captions for meaningful images and diagrams when supported.
- Maintain sufficient contrast and do not encode status through color alone.
- Use readable type sizes and avoid rasterizing text unnecessarily.
- Keep instructions understandable without relying only on spatial position or visual styling.
- Report when accessibility tags or screen-reader behavior could not be verified.

## Language and locale

- Match language, date, time, number, currency, paper size, and address formats to the audience.
- Use fonts that cover every required script and inspect fallback rendering.
- Preserve IDs and codes independently from localized display values.
- Allow room for translation expansion and different line-breaking behavior.
- Keep terminology and proper names consistent across all files.

## Japanese deliverables

- Inspect mixed Japanese/Latin typography, line breaks, punctuation, and vertical alignment.
- Determine whether dates use Gregorian years, Japanese eras, or fiscal-year notation.
- Treat A4/A3 printing, page scaling, approval fields, and established templates as functional requirements when present.
- Preserve leading zeros, full-width/half-width conventions, and organization-specific wording.
- Do not assume that a dense internal document should be redesigned as a sparse presentation.

## Privacy and distribution

- Remove hidden comments, notes, tracked changes, metadata, and embedded source data when the delivery context requires it.
- Avoid external image, font, or data dependencies that recipients cannot access.
- Confirm whether the file is internal, confidential, public, or intended for archival use.
