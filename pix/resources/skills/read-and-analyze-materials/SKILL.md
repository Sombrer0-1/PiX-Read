---
name: read-and-analyze-materials
description: Read and analyze the currently open PDF or library materials. Use when answering questions about the document, explaining a page, summarizing nearby pages, or interpreting an attached page-region screenshot.
---

# Read and analyze materials

## Page-check procedure

1. Prefer the current document, the current page, and immediate neighbor pages (current-1, current, current+1).
2. Call `pdf_read_pages` with the document path and those page numbers. Do not use `read` on PDF files. Do not dump the whole PDF.
3. If you need structure (sections, chapters), call `pdf_outline` first, then read only the relevant pages.
4. If a page-region screenshot is attached, treat it as the user's selection over the page (circles, underlines, arrows). Do not use it as the OCR source of truth. Extract body text with `pdf_read_pages` and use the image only to locate what the user marked.
5. Distinguish PDF body text from attached page-region screenshots. Quote body text from `pdf_read_pages`. Describe a screenshot as the user's selection.
6. Answer in the user's language.

## Citing pages

When your answer refers to a specific PDF page, mark it as `[[pN]]` (for example `[[p12]]`) so the reading UI can render a clickable page badge. Use `[[pN]]` for every concrete page reference. Page numbers must come from `pdf_read_pages` results or `<reading_context>`; never invent page numbers.

Example: "The method is introduced on [[p12]] and the proof continues on [[p13]]."
