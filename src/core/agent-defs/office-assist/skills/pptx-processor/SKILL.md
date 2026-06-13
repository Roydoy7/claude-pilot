---
name: pptx-processor
description: |
  Guide for creating and editing PowerPoint (.pptx) files.
  Use when:
  - Creating new presentations from scratch (using pptxgenjs)
  - Adding/removing slides or modifying existing PPTX content
---

# PPTX Editing Guide

## Workflows

### Editing existing PPTX (Recommended)
1. **pptx tool** `unpack` → extracts to folder
2. **Read/Grep** → find content to modify
3. **Edit** → directly edit XML files
4. **pptx tool** `pack` → reassemble to PPTX

### Creating new from template
1. **pptx tool** `create-template` → outputs template.pptx + template_xml/
2. **Read** XML files from template_xml/ to understand structure
3. **TypeScript + AdmZip** to edit template.pptx

## Critical: Adding/Replacing Slides

When adding slides, **must update THREE files in sync**:

1. `ppt/presentation.xml` - sldIdLst
2. `ppt/_rels/presentation.xml.rels` - Relationships
3. `[Content_Types].xml` - Override declarations

**Must clean old references BEFORE adding new ones**.

## Correct Pattern

```typescript
// === STEP 1: Clean old references (CRITICAL!) ===
relsXml = relsXml.replace(/<Relationship[^>]*Target="slides\/slide\d+\.xml"[^>]*\/>/g, '');
contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
presentationXml = presentationXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst></p:sldIdLst>');

// Delete old slide files
for (const entry of zip.getEntries()) {
  if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName) ||
      /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entry.entryName)) {
    zip.deleteFile(entry.entryName);
  }
}

// === STEP 2: Find max rId (after cleaning) ===
let maxRId = 0;
for (const m of relsXml.match(/rId(\d+)/g) || []) {
  const n = parseInt(m.replace('rId', ''), 10);
  if (n > maxRId) maxRId = n;
}

// === STEP 3: Add new slides ===
// For each slide, add to all three places:
sldIdList += `<p:sldId id="${255 + num}" r:id="rId${rId}"/>`;
newRels += `<Relationship Id="rId${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${num}.xml"/>`;
newTypes += `<Override PartName="/ppt/slides/slide${num}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;

// === STEP 4: Update files ===
presentationXml = presentationXml.replace('<p:sldIdLst></p:sldIdLst>', `<p:sldIdLst>${sldIdList}</p:sldIdLst>`);
relsXml = relsXml.replace('</Relationships>', `${newRels}</Relationships>`);
contentTypes = contentTypes.replace('</Types>', `${newTypes}</Types>`);
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "File needs repair" | Old refs not cleaned | Clean ALL old slide refs before adding new |
| Duplicate rId | rId conflict | Find maxRId AFTER cleaning old refs |
| Garbled text | No XML escaping | Use `escapeXml()` for all text |

## Helper Functions

```typescript
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function formatContent(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return '<a:p><a:endParaRPr lang="zh-CN"/></a:p>';
  return lines.map(l => `<a:p><a:r><a:rPr lang="zh-CN" sz="2400"/><a:t>${escapeXml(l)}</a:t></a:r></a:p>`).join('');
}
```

## Free Images for Slides

Use **Unsplash** for free images (no API key needed):

```
https://images.unsplash.com/photo-{PHOTO_ID}?w=600&q=80
```

Browse photos at [unsplash.com](https://unsplash.com), copy the photo ID from URL, then use `mcp__image__process` tool with `download` operation.
