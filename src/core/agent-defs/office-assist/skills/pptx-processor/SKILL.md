---
name: pptx-processor
description: Create, edit, inspect, and validate PowerPoint presentations (.pptx) for status reporting, decisions, proposals, analysis, training, manuals, sales, events, and Japanese corporate communication. Use for new decks, template-based presentations, slide changes, data storytelling, visual redesign, and presentation quality review.
---

# PPTX Processing

## Select the communication mode

Determine the presentation's job, audience, delivery setting, speaking context, and reuse needs before selecting a visual style. Read [presentation-modes.md](references/presentation-modes.md) and choose the closest mode. Combine modes intentionally, such as a decision deck with a detailed appendix.

Do not force every deck into a sparse keynote style. A projected talk, a Japanese internal decision document, a training manual, and a recurring status deck need different information density.

## Choose a safe workflow

### Create a new deck

Use PptxGenJS for a presentation created from scratch. Define the slide size, theme fonts, palette, spacing, and reusable layout helpers before creating slides. Build each slide from structured content and reusable components.

Normalize its CommonJS default export before constructing it. The tsx/ESM runtime can expose an additional nested `default` wrapper:

```typescript
import importedPptxGenJS from 'pptxgenjs';

type PptxGenJSConstructor = typeof importedPptxGenJS;
const PptxGenJS =
  (importedPptxGenJS as unknown as { default?: PptxGenJSConstructor }).default ??
  importedPptxGenJS;

const pptx = new PptxGenJS();
```

Do not use `import * as PptxGenJS`, `const PptxGenJS = await import('pptxgenjs')`, or assume the static default import is directly constructable. These can bind a module object rather than the constructor and cause `TypeError: PptxGenJS is not a constructor`. Apply the same `nested default ?? imported value` normalization after a dynamic import.

### Create from an existing template

1. Run `mcp__pptx__pptx` with `get-info` to inspect dimensions, theme, layouts, and slides.
2. Run `create-template` only when clearing the selected template slides is intended.
3. Reuse the template's masters, layouts, theme, and placeholders instead of approximating them.
4. Preserve branding and validate every produced slide visually.

### Modify an existing deck

1. Copy the original to a new output path.
2. Run `get-info`, then use `unpack` for targeted OOXML edits or PowerPoint desktop automation for layout-sensitive changes.
3. Modify only the requested slides and relationships.
4. Run `pack`, reopen the deck, and validate it.

### Add slides to an existing deck

Preserve every existing slide reference and file. Prefer PowerPoint desktop automation or a proven template-aware workflow. When editing OOXML, add a unique slide part, presentation entry, relationship, content-type entry, layout relationship, and all media/notes dependencies required by the cloned slide.

Never delete old slide relationships or files merely to add a slide. Only clear the entire slide list for an explicitly requested full-deck replacement, and do so on a copy.

## Design the story and slides

1. State the audience outcome: inform, decide, approve, teach, persuade, or align.
2. Draft a narrative and slide outline before coding layouts.
3. Give each slide one primary communication job.
4. Write takeaway titles when the evidence supports a conclusion; use neutral topic titles for reference or instructional slides.
5. Choose a layout pattern from [layout-and-visual-system.md](references/layout-and-visual-system.md).
6. Apply the chart guidance in [charts-and-data-storytelling.md](references/charts-and-data-storytelling.md) when presenting data.

Prefer hierarchy, alignment, contrast, and whitespace over decoration. Keep branding, typography, image treatment, and component behavior consistent while varying composition enough to support the story.

## Handle content responsibly

- Separate facts, assumptions, interpretation, and recommendations.
- Preserve source notes, dates, units, and definitions for important claims.
- Use high-resolution, relevant images with appropriate usage rights; do not use arbitrary stock imagery as filler.
- Keep speaker-dependent slides readable at projection distance; provide an appendix or companion document for necessary detail.
- Add alternative descriptions or descriptive captions where the delivery format supports accessibility.
- Escape XML text when performing OOXML edits and preserve whitespace deliberately.

## Validate before delivery

Follow [validation-checklist.md](references/validation-checklist.md). At minimum:

1. Reopen the PPTX and confirm slide count, order, dimensions, and theme.
2. Convert the deck to PDF, then use PDF `to-images` on all pages for visual inspection.
3. Check overflow, overlap, clipping, missing media, font substitution, alignment, contrast, and chart readability.
4. Review the deck as a sequence for narrative gaps, repetitive composition, inconsistent density, and unsupported conclusions.
5. Confirm the original remains unchanged and remove unpacked or temporary files from delivery.
