# Stage Tree Editor

A WYSIWYG editor for stage tree diagrams. It builds a tree from scratch or from a
CSV, edits it visually, and saves it back as CSV — the same seven-column CSV that
[`tree-from-csv`](../tree-from-csv/readme.md) reads.

Plain HTML, CSS and ES modules. No framework, no build step, no dependencies.

## Running it

ES modules are not allowed to load over `file://`, so serve the repository root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/editor/>. Any static file server works.

## Editing

| Action | How |
| --- | --- |
| Select | Click a node or a connector |
| Link two nodes | Drag from the source node onto the target node |
| Add a node | `Enter`, the **Add node** button, or double-click empty space |
| Delete | `Del` or `Backspace` removes the selected node or link |
| Edit a node | Use the **Selection** panel: id, tag, stage, outcome, sources |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Save | **Export CSV**, or `Ctrl+S` |
| Navigate | Drag the background to pan, wheel to zoom, **Fit** to frame everything |
| Share outcome nodes | The **Merge outcomes** toggle (see [Merge outcomes](#merge-outcomes)) |

Work in progress is kept in `localStorage`, so closing the tab does not lose it.
That is a convenience, not a filing system: **Export CSV** is how work leaves the
editor.

### Positions are computed, not stored

The CSV has no coordinate columns, so there is nothing for hand-placed positions
to round-trip through. Instead, the layout is derived on every change by the same
rules as `stage-tree.go`: stages become columns ordered by sorting their names,
each generation moves one column to the right, and siblings stack downward. This
is why nodes cannot be dragged around — dragging creates links instead.

### Stages and colors

A stage is just a string on a node. Columns are laid out in **sorted stage order**,
and that same order picks each stage's color from the ten-color palette in
`godraw-styling.go`. That is why the examples prefix stage names with a number:
`1 initialize`, `2 brew`, `3 rest`. Rename a stage in the **Stages** panel to move
its column.

`outcome` is reserved: it is the stage name given to the leaves synthesized from
the outcome column.

### Outcomes

An outcome is a field on a node, not a node of its own — exactly as the CSV stores
it. When drawing, the editor synthesizes one leaf per outcome (id = row id +
outcome, stage = `outcome`), which is what `readEvents` in `tree-from-csv/main.go`
does. Those leaves are drawn but not directly editable: clicking one selects the
node it belongs to. Because they are synthesized rather than stored, they never
leak into the CSV as rows of their own.

#### Merge outcomes

The **Merge outcomes** toggle in the toolbar switches to a second way of drawing
them: one node per *distinct* outcome value (id = `outcome:` + outcome), with an
arrow from every node that carries it. In `example1.csv`, nodes 6 and 9 both end in
`pass`, so they point at the same `pass` node instead of each getting their own.

- It is a view setting, kept with the autosave but not in the CSV, which is the
  same either way. `tree-from-csv` always draws one outcome node per row.
- A shared outcome sits on the row of the first node that reaches it in the layout.
  The arrows from the others run along their own row and turn in the empty lane just
  before the outcome column, so they meet in one trunk and never pass through a
  node. (Any connector spanning more than one column turns there, for the same reason.)
- Clicking a shared outcome selects the outcome value: the **Selection** panel lists
  every node with it, and `Del` clears it from all of them. To change a single
  node's outcome, select that node.
- Outcomes are matched exactly, after the import trims whitespace, so `Pass` and
  `pass` stay two nodes.

## What round-trips, and what does not

Importing and exporting an untouched file returns the same rows in the same order,
with the same header names, with two deliberate differences:

- **Whitespace is trimmed.** Spreadsheet exports often carry a space after a comma
  (`example1.csv` has `16,sample 2,15,,,4 test, inconclusive`). Keeping it would
  split ` inconclusive` and `inconclusive` into two different values.
- **Stages with no nodes are not saved.** A CSV can only record a stage that some
  row carries, so a stage added in the panel but never assigned lives only in the
  session.

## Tests

```bash
node editor/test/run-tests.mjs
```

No test framework. The layout tests are checked against
`tree-from-csv/example/example1.svg`, the committed output of the Go tool for
`example1.csv`: the stage columns, the colors and the node coordinates are asserted
against the values in that file.

### One known difference from the Go tool

`example1.csv` has three siblings (ids 6, 7 and 8) that share both a stage and a
tag. `addNodes` in `stage-tree.go` orders siblings with `sort.Slice`, which is not
stable, over a child list built by ranging over a map — so for nodes tied on both
keys the order is arbitrary *and varies between runs of the same input*. Running
the Go tool six times on `example1.csv` put node 9 at y=85, 85, 45, 45, 85 and 125.

The editor sorts stably over document order, so the same document always lays out
the same way. It agrees with the committed SVG on every node whose order is
actually determined — 22 of the 23 — and picks one of the arrangements the Go tool
itself produces for the tie.

## Layout of the code

| File | What it holds |
| --- | --- |
| `js/csv.js` | Parsing and serializing the seven-column format |
| `js/model.js` | The document, mutations, and the schema's limits (three sources, no cycles) |
| `js/layout.js` | The port of `probeDepth`, `PlotStages` and `addNodes` |
| `js/style.js` | The palette and spacing constants from `godraw-styling.go` |
| `js/render.js` | Drawing the SVG, and the standalone SVG export |
| `js/app.js` | Toolbar, panels, history, autosave, pointer handling |

`js/csv.js`, `js/model.js`, `js/layout.js`, `js/style.js` and `js/render.js` are
free of browser globals at import time, which is what lets the test suite run them
under Node.
