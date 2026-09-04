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
- Allow user to select name of files when saving CSV and SVG from the editor.
- Make the stage title panel at the top word-wrap and resize if needed to fit its contents neatly.

## In Progress

(nothing right now)

## Won't Do

(nothing right now)

## Usage Notes

- Move items between sections as work progresses. Completed work lives in git log, not here.
- Keep In Progress short (ideally 1–2 items at a time).
- Add a brief note or issue reference next to items when helpful, e.g. `- Fix tile color bug (#12)`.
- Commit this file with the same PR/commit as the work it describes.
