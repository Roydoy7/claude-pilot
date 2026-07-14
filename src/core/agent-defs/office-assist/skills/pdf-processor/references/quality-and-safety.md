# PDF Quality and Safety

## Visual quality

- Render pages at a dimension sufficient to inspect text and diagrams.
- Check margins, crop, orientation, page size, blank pages, clipping, overlap, and missing glyphs.
- Check image sharpness, chart labels, table boundaries, headers, footers, and page numbering.
- Compare section transitions and pages created from different source files.
- Inspect every page when the PDF is short, externally delivered, legally significant, or produced from a presentation.

## Content fidelity

- Compare page count and representative content against the source.
- Confirm merge order and split ranges explicitly.
- Verify names, dates, numbers, signatures, stamps, and form fields visually where relevant.
- Preserve page-number references used in summaries or extracted evidence.
- Treat converted DOCX content as a reconstruction that requires review, not a lossless edit.

## Text and scanned content

- Check whether text extraction returns meaningful reading order.
- Render pages with missing, garbled, or suspiciously sparse extracted text.
- Distinguish OCR/visual interpretation from embedded text extraction.
- Do not silently omit pages that could not be read.

## Security and privacy

- Preserve encryption, permissions, digital signatures, and source files unless explicitly authorized to change them.
- Do not call a black rectangle or removed annotation a secure redaction.
- Inspect metadata, hidden attachments, comments, and links when confidentiality matters and tooling permits.
- Avoid uploading confidential documents or pages to external services without authorization.
- Report password protection, signature invalidation, or unverifiable security properties.

## Accessibility

- Check whether text is selectable and reading order is meaningful.
- Preserve or add document title, language, bookmarks, and tagged structure when the authoring path supports them.
- Ensure color is not the sole carrier of meaning and links have descriptive text.
- Report when a generated PDF is visually correct but accessibility was not verified.
