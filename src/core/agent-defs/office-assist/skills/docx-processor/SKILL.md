---
name: docx-processor
description: |
  Guide for creating Word documents (.docx).
  Use when:
  - Creating reports, documents, or long-form content
  - Generating Word files with TypeScript (docx library)
---

# DOCX Creation Guide

## Key Principle: Write in Sections

**NEVER generate entire long documents in a single code block.** A single syntax error will fail the entire output.

### Recommended Approach

1. **Create document structure first** (empty sections)
2. **Add content section by section** (each in separate code execution)
3. **Save incrementally** to verify each step works

## Section-by-Section Pattern

```typescript
// Step 1: Create base document with structure
(async () => {
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
  const fs = await import('fs');

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Report Title', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: 'Section 1 placeholder' }),
        new Paragraph({ text: 'Section 2 placeholder' }),
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('report.docx', buffer);
  console.log('Base document created');
})();
```

```typescript
// Step 2: Add Section 1 content (separate execution)
(async () => {
  // Read existing, add content, save
  // ... section 1 content
})();
```

## Benefits of Incremental Writing

| Approach | Risk | Recovery |
|----------|------|----------|
| All at once | High - one error fails everything | Must regenerate entire document |
| Section by section | Low - error affects only one section | Fix and retry that section only |

## Long Content Strategy

For documents with 5+ pages:

1. **Outline first** - Create headings and structure
2. **Fill sections** - Add content to each section separately
3. **Review and adjust** - Fix formatting issues incrementally

## Error Prevention

- Test each section's code before moving to next
- Use simple text first, add formatting later
- Keep each code block focused on one section

## Quick Example: Report with Multiple Sections

```typescript
// Use arrays to build content, easier to debug
(async () => {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const fs = await import('fs');

  // Define sections as data (easier to modify)
  const sections = [
    { title: 'Introduction', content: 'Introduction text here...' },
    { title: 'Methodology', content: 'Method description...' },
    { title: 'Results', content: 'Results summary...' },
    { title: 'Conclusion', content: 'Final thoughts...' },
  ];

  // Build paragraphs from data
  const children = [];
  for (const section of sections) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: section.content }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('report.docx', buffer);
  console.log('Report created with', sections.length, 'sections');
})();
```
