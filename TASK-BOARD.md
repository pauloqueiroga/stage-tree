# Task Board

A lightweight Kanban-style board, version-controlled alongside the code.

## Stages

| Stage | Meaning |
| --- | --- |
| Wish List | Ideas worth keeping, not yet committed to |
| To Do | Agreed upon, ready to be picked up |
| In Progress | Actively being worked on |
| Won't Do | Considered and consciously declined |

## Wish List

- Support export formats beyond Drawio/mxGraph
- CSV input filtering/configuration built into `tree-from-csv`, instead of requiring users to reshape their spreadsheet

## To Do

- Flesh out the empty sections of the root `README.md` (Links, Tags, Stages, Outcomes) with the same level of detail as the Nodes section
- Add automated tests for `stage-tree.go`, `godraw-styling.go`, and `tree-from-csv/main.go` (none exist yet)
- **WYSIWYG stage-tree editor** — a dependency-light, interactive website for building and editing stage tree diagrams from scratch or from a CSV, and saving back to CSV. Breakdown (does not touch the existing Go code, which is reference-only):
  - Define the editor's in-memory graph/data model in JS, matching the CSV schema used by `tree-from-csv` (`id, tag, sourceId1-3, stage, outcome`) so files stay interchangeable with the CLI
  - Add CSV import: parse a file into that in-memory graph, following the column format documented in `tree-from-csv/readme.md`
  - Reconcile "outcome" semantics on import/export: `tree-from-csv/main.go` synthesizes a separate leaf node (stage `outcome`) for each row's `outcome` value, so the editor needs to fold those back into a single `outcome` field per source node on export rather than round-tripping them as ordinary child nodes
  - Port the auto-layout logic from `stage-tree.go` (stage-column widths via `probeDepth`, node placement via `addNodes`) to JS so imported/edited trees lay out consistently, and re-run it as the graph changes
  - Render the graph as SVG: stage header bars and ellipse nodes colored per stage per `godraw-styling.go`'s palette/style, with orthogonal elbow connectors between nodes — use `tree-from-csv/example/*.svg` as the visual reference
  - Add interactive editing directly on the SVG canvas: create a node, drag to reposition, click to select/edit a node's `tag`/`stage`/`outcome`, draw a link between two nodes to set a source relationship, delete a node or link
  - Add a stage manager (add/rename/reorder/recolor stages), since stage identity drives both layout columns and node color
  - Validate edits against the CSV schema's constraints (max 3 sources per node, no source cycles, single root)
  - Add CSV export: serialize the in-memory graph back into the same CSV column format, so it can round-trip through `tree-from-csv`
  - Add undo/redo for edit operations
  - Add local persistence (e.g. `localStorage` autosave) so in-progress edits survive a page reload
  - Build minimal UI chrome: a toolbar (New, Import CSV, Export CSV, Add Node, Add Stage) and a properties panel for the selected node
  - Keep the stack dependency-light: plain HTML/CSS/JS (or a minimal bundler-free setup), no UI framework, native SVG DOM APIs for rendering and hit-testing
  - Manually verify round-tripping using `tree-from-csv/example/example1.csv` and `example2.csv` (import, edit, export, diff against source)
  - Document the editor (its own README, plus a pointer from the root `README.md`)

## In Progress

(nothing right now)

## Won't Do

(nothing right now)

## Usage Notes

- Move items between sections as work progresses. Completed work lives in git log, not here.
- Keep In Progress short (ideally 1–2 items at a time).
- Add a brief note or issue reference next to items when helpful, e.g. `- Fix tile color bug (#12)`.
- Commit this file with the same PR/commit as the work it describes.
