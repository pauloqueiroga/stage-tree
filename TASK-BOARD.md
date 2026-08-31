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
- Make `tree-from-csv` output deterministic. `addNodes` in `stage-tree.go` orders siblings with `sort.Slice` (not stable) over a child list built by ranging over a map, so siblings tied on both stage and tag come out in an arbitrary order that changes between runs. Six runs over `example1.csv` placed node 9 at y=85, 85, 45, 45, 85, 125 — meaning the committed example `.drawio`/`.svg` files cannot be regenerated reliably. Fix by making `makeTree` build children in CSV row order and using `sort.SliceStable`, then regenerate the examples.

## In Progress

- **WYSIWYG stage-tree editor** in `editor/` — dependency-free HTML/CSS/ES modules, no build step. Serve the repo root and open `/editor/`; see [`editor/readme.md`](editor/readme.md). Landed so far: the CSV round-trip, the data model with its schema limits, the layout ported from `stage-tree.go` (asserted against `example1.svg`), the SVG renderer, canvas editing (drag to link, add, delete, select), the stage panel, validation checks, undo/redo, `localStorage` autosave, CSV + standalone SVG export, and 33 tests in `editor/test/run-tests.mjs`. Remaining:
  - Add a committed browser-level test for the pointer interactions (drag-to-link, pan, zoom, delete). They are currently only verified by hand; two bugs found that way — pointer capture breaking drop-target hit-testing, and debounced autosave losing edits on reload — would both have been caught by one.
  - Make the canvas usable without a mouse: nothing is focusable or reachable by keyboard, and the SVG carries no ARIA roles or labels
  - Check touch and trackpad behaviour: pointer events are used throughout, but pinch-zoom and drag-to-link on a touchscreen are untested
  - Let the editor write `.drawio` directly, so a tree can go from the editor to Drawio without a trip through the CLI (overlaps the "export formats beyond Drawio/mxGraph" wish-list item)
  - Allow deleting an unused stage from the Stages panel; today a stage can be renamed but only disappears when the last node leaves it
  - Re-render incrementally instead of rebuilding every node and link on each change, once graphs get big enough to notice (the examples are far too small to)
  - Decide whether a stage created in the panel but never assigned should survive a save — a CSV can only record stages that some row carries, so today it does not

(nothing right now)

## Won't Do

(nothing right now)

## Usage Notes

- Move items between sections as work progresses. Completed work lives in git log, not here.
- Keep In Progress short (ideally 1–2 items at a time).
- Add a brief note or issue reference next to items when helpful, e.g. `- Fix tile color bug (#12)`.
- Commit this file with the same PR/commit as the work it describes.
