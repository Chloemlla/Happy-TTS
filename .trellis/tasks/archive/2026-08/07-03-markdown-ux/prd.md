# Optimize Markdown Rendering UX

## Goal

Improve the user experience for Markdown reading across the project, with special attention to the LibreChat chat/history surfaces. The work should remove interaction pain points such as hidden controls, cramped scroll containers, inconsistent raw/rendered views, and duplicated Markdown preview behavior while preserving existing APIs and data flows.

## What I Already Know

* The user asked to optimize UX, remove LibreChat pain points, redesign where necessary, implement related functionality, and improve Markdown rendering UX project-wide.
* The frontend already has a shared `MarkdownRenderer` component with GFM, math, Mermaid, code copy, heading anchors, image lazy loading, and lightbox support.
* LibreChat currently defines `ReadOnlyMarkdownRenderer` and `InteractiveMarkdownRenderer` inside `LibreChatPage`, creating chat-specific UX outside the shared renderer.
* LibreChat history has a global rendered/source toggle, per-message copy/edit/retry/delete actions, and both standard history and realtime dialog surfaces.
* `LibreChatAdminPage` wraps Markdown messages in a very short `max-h-40` container with a separate hidden copy button, making long Markdown hard to read.
* `MarkdownExportPage/MarkdownPreview.tsx` still renders precomputed HTML with `dangerouslySetInnerHTML` instead of the shared Markdown renderer.
* Project constraints: no dependency installation; no local build/test execution; code identifiers and documentation should be English.

## Assumptions

* "删除 librechat 槽点" means remove UX pain points in the LibreChat-facing UI rather than deleting LibreChat functionality.
* Backend behavior, route names, persistence format, and export API should stay unchanged.
* A focused frontend redesign is preferable to a broad full-app visual redesign.

## Requirements

* Extend the shared Markdown renderer so it can provide reusable reading controls:
  * copy full Markdown content,
  * switch between rendered and source view,
  * collapse/expand long content,
  * keep code-copy feedback via the existing callback.
* Add a compact mode for chat/admin surfaces so Markdown typography fits message bubbles without oversized article-style headings.
* Keep full article-style Markdown rendering for public articles and content pages.
* Update LibreChat history and realtime dialog to use shared Markdown controls instead of page-local renderer wrappers.
* Improve LibreChat message layout so actions are accessible, reading flow is calmer, and long assistant responses are easier to scan.
* Update LibreChat admin message preview to use the shared Markdown controls and avoid the fixed tiny preview height.
* Replace legacy Markdown export preview HTML injection with shared Markdown rendering where feasible.
* Preserve existing edit, retry, delete, select, export, and copy workflows.

## Acceptance Criteria

* [ ] Shared Markdown rendering supports controlled source/rendered display, content copy, and expand/collapse behavior.
* [ ] Chat-style Markdown can be rendered in a compact visual mode without breaking standard article rendering.
* [ ] LibreChat history messages no longer rely on duplicated page-local Markdown renderer wrappers.
* [ ] Realtime LibreChat dialog uses the same Markdown reading behavior as history messages.
* [ ] LibreChat admin history previews use the shared renderer controls and are not locked to a cramped 40-height viewport.
* [ ] Markdown export preview uses the shared renderer for Markdown content instead of raw HTML injection.
* [ ] Existing route/API behavior is unchanged.

## Definition of Done

* Code changes are scoped to frontend UX/rendering.
* No dependencies are installed.
* No local build/test commands are run; verification is limited to static inspection because project instructions require build/test execution inside GitHub workflow.
* A conventional commit is created for the implementation, excluding unrelated pre-existing dirty files.

## Technical Approach

Enhance `frontend/src/components/MarkdownRenderer.tsx` as the shared UX layer, using optional props for density and reading controls. Then simplify LibreChat wrappers to use this component directly and update the legacy preview/admin call sites that currently work around it.

## Decision (ADR-lite)

**Context**: Markdown UX issues are repeated across LibreChat history, realtime dialog, admin previews, and export previews. Local fixes in each page would keep behavior inconsistent.

**Decision**: Promote reading controls and compact density into the shared Markdown renderer, then make affected pages consume those options.

**Consequences**: The renderer becomes slightly more capable, but future Markdown consumers get the same controls and typography without duplicating wrappers. Backend and persistence remain untouched.

## Out of Scope

* Renaming LibreChat APIs, database collections, or backend services.
* Replacing the Markdown parser stack or adding new dependencies.
* Full visual redesign of unrelated product pages.
* Local build/test execution.

## Technical Notes

* Shared renderer: `frontend/src/components/MarkdownRenderer.tsx`
* Markdown styles: `frontend/src/index.css`
* LibreChat main surface: `frontend/src/components/LibreChatPage.tsx`
* LibreChat realtime dialog: `frontend/src/components/LibreChatRealtimeDialog.tsx`
* LibreChat admin preview: `frontend/src/components/LibreChatAdminPage.tsx`
* Markdown export preview: `frontend/src/components/MarkdownExportPage/MarkdownPreview.tsx`
* Relevant specs: `.trellis/spec/frontend/index.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/quality-guidelines.md`, `.trellis/spec/frontend/type-safety.md`
