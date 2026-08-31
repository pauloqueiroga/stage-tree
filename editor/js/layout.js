// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Auto-layout, ported from stage-tree.go (probeDepth, PlotStages, PlotTree, addNodes)
// so what the editor shows matches what tree-from-csv would draw for the same CSV.
//
// Positions are derived, never stored: the CSV format has no coordinate columns, so
// there is nothing to round-trip. Editing changes the graph; the layout follows.
//
// Two deliberate departures from the Go code, both to serve editing rather than
// one-shot export:
//   1. Go plots only what is reachable from the node with id "0". The editor lays
//      out every node, so work in progress and mistakes stay visible.
//   2. Go sorts siblings with sort.Slice, which is not stable, and builds child
//      lists by ranging over a map. Siblings sharing a stage AND a tag therefore
//      come out in an arbitrary order that varies between runs. The editor sorts
//      stably over document order, so the same document always lays out the same way.

import { H_SPACING, V_SPACING, NODE_RADIUS, stageColor } from './style.js';
import { OUTCOME_STAGE, ROOT_ID } from './model.js';

// probeDepth follows the Go original in having no memo across branches, so a node
// reachable by several paths is measured on each. This budget stops a pathological
// document from hanging the page.
const PROBE_BUDGET = 500000;

// buildPlotGraph expands the document into the graph that actually gets drawn,
// synthesizing one leaf node per outcome exactly as readEvents does in
// tree-from-csv/main.go (id = row id + outcome, tag = outcome, stage = "outcome").
export function buildPlotGraph(doc) {
  const nodes = new Map();
  const children = new Map();

  const put = (node) => {
    let id = node.id;
    if (nodes.has(id)) {
      let n = 2;
      while (nodes.has(`${id}#${n}`)) n++;
      id = `${id}#${n}`;
    }
    nodes.set(id, { ...node, id });
    children.set(id, []);
    return id;
  };

  for (const node of doc.nodes) {
    put({ id: node.id, tag: node.tag, stage: node.stage, synthetic: false, ownerId: node.id });
  }

  // Real links, in document order.
  for (const node of doc.nodes) {
    for (const source of node.sources) {
      if (nodes.has(source) && nodes.has(node.id)) {
        children.get(source).push(node.id);
      }
    }
  }

  // Outcome leaves, appended after the real children of their owner.
  for (const node of doc.nodes) {
    if (node.outcome === '') continue;
    const id = put({
      id: node.id + node.outcome,
      tag: node.outcome,
      stage: OUTCOME_STAGE,
      synthetic: true,
      ownerId: node.id,
    });
    children.get(node.id).push(id);
  }

  return { nodes, children, roots: findRoots(doc, nodes) };
}

// findRoots orders traversal starts: the id "0" that tree-from-csv calls the root,
// then every node nothing points at, then whatever is left (nodes only reachable
// through a cycle), so nothing goes unplotted.
function findRoots(doc, nodes) {
  const referenced = new Set();
  for (const node of doc.nodes) {
    for (const source of node.sources) {
      if (nodes.has(source)) referenced.add(node.id);
    }
  }

  const roots = [];
  if (nodes.has(ROOT_ID)) roots.push(ROOT_ID);
  for (const node of doc.nodes) {
    if (node.id !== ROOT_ID && !referenced.has(node.id)) roots.push(node.id);
  }
  for (const node of doc.nodes) {
    if (!roots.includes(node.id)) roots.push(node.id);
  }
  return roots;
}

function sortSiblings(plot, ids) {
  // Same ordering as addNodes in stage-tree.go: stage descending, then tag ascending.
  return ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const na = plot.nodes.get(a.id);
      const nb = plot.nodes.get(b.id);
      if (na.stage !== nb.stage) return na.stage > nb.stage ? -1 : 1;
      if (na.tag !== nb.tag) return na.tag < nb.tag ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.id);
}

// probeDepths measures, per stage, the longest run of consecutive nodes sharing
// that stage, which is what decides the stage column's width.
function probeDepths(plot) {
  const maxDepth = new Map();
  let budget = PROBE_BUDGET;
  let exhausted = false;

  const probe = (id, currentStage, stageDepth, path) => {
    const node = plot.nodes.get(id);
    if (!node || path.has(id)) return;
    if (budget-- <= 0) {
      exhausted = true;
      return;
    }

    const depth = currentStage === node.stage ? stageDepth + 1 : 1;
    if ((maxDepth.get(node.stage) ?? 0) < depth) maxDepth.set(node.stage, depth);

    path.add(id);
    for (const child of plot.children.get(id) ?? []) {
      probe(child, node.stage, depth, path);
    }
    path.delete(id);
  };

  for (const root of plot.roots) {
    probe(root, null, 0, new Set());
  }
  // Any stage that only appears on an unprobed node still needs a column.
  for (const node of plot.nodes.values()) {
    if (!maxDepth.has(node.stage)) maxDepth.set(node.stage, 1);
  }

  return { maxDepth, exhausted };
}

// plotStages lays out the stage header bars left to right in sorted stage order,
// which is also the order that assigns each stage its color.
function plotStages(maxDepth) {
  const names = [...maxDepth.keys()].sort();
  const stages = [];
  const offsets = new Map();
  let offset = 0;

  names.forEach((name, index) => {
    const width = H_SPACING * maxDepth.get(name);
    offsets.set(name, offset + H_SPACING / 2 - NODE_RADIUS);
    stages.push({
      name,
      displayName: name === '' ? '(no stage)' : name,
      x: offset,
      y: 0,
      width,
      height: V_SPACING,
      colorIndex: index,
      color: stageColor(index),
    });
    offset += width;
  });

  return { stages, offsets, totalWidth: offset };
}

// layout turns a document into everything the renderer needs: stage bars, node
// positions and link endpoints.
export function layout(doc) {
  const plot = buildPlotGraph(doc);
  const { maxDepth, exhausted } = probeDepths(plot);
  const { stages, offsets, totalWidth } = plotStages(maxDepth);
  const stageIndex = new Map(stages.map((s) => [s.name, s]));

  const placed = new Map();
  const visited = new Set();

  // addNodes, ported. x advances one column per generation, y advances between
  // siblings, and a node is pulled right to its stage's column if it lands short.
  const addNodes = (id, x, y, parentTag) => {
    const node = plot.nodes.get(id);
    if (!node || visited.has(id)) return { x, y };
    visited.add(id);

    const stage = stageIndex.get(node.stage);
    const offset = offsets.get(node.stage) ?? 0;
    if (x < offset) x = offset;

    placed.set(id, {
      id,
      x,
      y,
      cx: x + NODE_RADIUS,
      cy: y + NODE_RADIUS,
      // A node repeating its parent's tag is drawn unlabeled, as in the Go code:
      // a chain of one sample through many stages reads as one line, not a stutter.
      label: node.tag === parentTag ? '' : node.tag,
      tag: node.tag,
      stage: node.stage,
      color: stage ? stage.color : stageColor(0),
      synthetic: node.synthetic,
      ownerId: node.ownerId,
    });

    const childX = x + H_SPACING;
    let currentY = y;
    sortSiblings(plot, plot.children.get(id) ?? []).forEach((childId, i) => {
      if (i > 0) currentY += V_SPACING;
      currentY = addNodes(childId, childX, currentY, node.tag).y;
    });

    return { x: childX, y: currentY };
  };

  let y = V_SPACING + NODE_RADIUS;
  for (const root of plot.roots) {
    if (visited.has(root)) continue;
    y = addNodes(root, H_SPACING / 2 - NODE_RADIUS, y, '').y + V_SPACING;
  }

  const nodes = [...placed.values()];
  const links = [];
  for (const [sourceId, childIds] of plot.children) {
    for (const targetId of childIds) {
      const source = placed.get(sourceId);
      const target = placed.get(targetId);
      if (!source || !target) continue;
      links.push({
        id: `${sourceId}->${targetId}`,
        sourceId,
        targetId,
        source,
        target,
        // Outcome links belong to the owner's outcome field, not to a source column.
        synthetic: plot.nodes.get(targetId).synthetic,
        ownerId: plot.nodes.get(targetId).ownerId,
      });
    }
  }

  const maxNodeX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
  const maxNodeY = nodes.reduce((m, n) => Math.max(m, n.y), 0);

  return {
    stages,
    nodes,
    links,
    width: Math.max(totalWidth, maxNodeX + H_SPACING),
    height: maxNodeY + V_SPACING + NODE_RADIUS,
    truncated: exhausted,
  };
}
