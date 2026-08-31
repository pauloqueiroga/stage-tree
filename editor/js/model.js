// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// The editor document and the operations allowed on it.
//
// A document is deliberately a plain JSON-serializable object shaped like the CSV
// it round-trips through, so undo snapshots and autosave are just structured clones:
//   { header: [7 column names], nodes: [{ id, tag, sources: [], stage, outcome }] }
//
// An "outcome" is a field on its node here, not a node of its own. tree-from-csv
// synthesizes a separate leaf node per outcome at plot time; the editor does the
// same in layout.js, keeping the document itself a faithful mirror of the CSV.

import { DEFAULT_HEADER } from './csv.js';

// tree-from-csv reads exactly three source columns.
export const MAX_SOURCES = 3;

// The stage name tree-from-csv gives synthesized outcome nodes.
export const OUTCOME_STAGE = 'outcome';

// makeTree in tree-from-csv/main.go treats the node with this id as the tree root.
export const ROOT_ID = '0';

export function emptyDoc() {
  return { header: DEFAULT_HEADER.slice(), nodes: [] };
}

export function cloneDoc(doc) {
  return {
    header: doc.header.slice(),
    nodes: doc.nodes.map((n) => ({ ...n, sources: n.sources.slice() })),
  };
}

export function nodeIndex(doc) {
  const map = new Map();
  for (const node of doc.nodes) {
    map.set(node.id, node);
  }
  return map;
}

export function nodeById(doc, id) {
  return doc.nodes.find((n) => n.id === id);
}

// childrenOf maps each node id to the ids that name it as a source.
export function childrenOf(doc) {
  const children = new Map();
  for (const node of doc.nodes) {
    if (!children.has(node.id)) children.set(node.id, []);
  }
  for (const node of doc.nodes) {
    for (const source of node.sources) {
      if (!children.has(source)) children.set(source, []);
      children.get(source).push(node.id);
    }
  }
  return children;
}

// stagesOf returns the stage names in use, sorted the way PlotStages sorts them.
// This ordering decides both column order and color, which is why the examples
// prefix stage names with a number ("1 initialize", "2 brew", ...).
export function stagesOf(doc) {
  const stages = new Set();
  for (const node of doc.nodes) {
    if (node.stage !== '') stages.add(node.stage);
    if (node.outcome !== '') stages.add(OUTCOME_STAGE);
  }
  return [...stages].sort();
}

// nextId returns an unused id, continuing the numeric sequence the examples use.
export function nextId(doc) {
  const used = new Set(doc.nodes.map((n) => n.id));
  let max = -1;
  for (const id of used) {
    if (/^\d+$/.test(id)) max = Math.max(max, Number(id));
  }
  let candidate = String(max + 1);
  while (used.has(candidate)) {
    candidate = String(Number(candidate) + 1);
  }
  return candidate;
}

export function addNode(doc, { tag = '', stage = '', outcome = '', sources = [] } = {}) {
  const id = doc.nodes.length === 0 ? ROOT_ID : nextId(doc);
  const node = { id, tag, stage, outcome, sources: sources.slice(0, MAX_SOURCES) };
  doc.nodes.push(node);
  return node;
}

export function deleteNode(doc, id) {
  doc.nodes = doc.nodes.filter((n) => n.id !== id);
  for (const node of doc.nodes) {
    node.sources = node.sources.filter((s) => s !== id);
  }
}

// renameNode changes an id and repoints every source reference to it.
export function renameNode(doc, oldId, newId) {
  if (oldId === newId) return { ok: true };
  if (newId.trim() === '') return { ok: false, error: 'Id cannot be empty.' };
  if (doc.nodes.some((n) => n.id === newId)) return { ok: false, error: `Id "${newId}" is already in use.` };

  const node = nodeById(doc, oldId);
  if (!node) return { ok: false, error: `Node "${oldId}" not found.` };

  node.id = newId;
  for (const other of doc.nodes) {
    other.sources = other.sources.map((s) => (s === oldId ? newId : s));
  }
  return { ok: true };
}

// reachesFrom reports whether `to` is reachable following source->child links from `from`.
function reachesFrom(doc, from, to) {
  const children = childrenOf(doc);
  const stack = [from];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const child of children.get(current) ?? []) {
      stack.push(child);
    }
  }
  return false;
}

// canLink checks a proposed source -> target link against the CSV schema's limits.
export function canLink(doc, sourceId, targetId) {
  if (sourceId === targetId) return { ok: false, error: 'A node cannot be its own source.' };

  const source = nodeById(doc, sourceId);
  const target = nodeById(doc, targetId);
  if (!source) return { ok: false, error: `Node "${sourceId}" not found.` };
  if (!target) return { ok: false, error: `Node "${targetId}" not found.` };
  if (target.sources.includes(sourceId)) return { ok: false, error: 'That link already exists.' };
  if (target.sources.length >= MAX_SOURCES) {
    return { ok: false, error: `"${targetId}" already has ${MAX_SOURCES} sources, the most a CSV row can hold.` };
  }
  if (reachesFrom(doc, targetId, sourceId)) {
    return { ok: false, error: 'That link would create a cycle.' };
  }
  return { ok: true };
}

export function addLink(doc, sourceId, targetId) {
  const check = canLink(doc, sourceId, targetId);
  if (!check.ok) return check;
  nodeById(doc, targetId).sources.push(sourceId);
  return { ok: true };
}

export function removeLink(doc, sourceId, targetId) {
  const target = nodeById(doc, targetId);
  if (!target) return { ok: false, error: `Node "${targetId}" not found.` };
  target.sources = target.sources.filter((s) => s !== sourceId);
  return { ok: true };
}

// validate reports everything that would make this document a problem for
// tree-from-csv, so the editor can warn without refusing to hold the state.
export function validate(doc) {
  const issues = [];
  const index = nodeIndex(doc);

  const counts = new Map();
  for (const node of doc.nodes) {
    counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 1) issues.push({ level: 'error', message: `Duplicate id "${id}" appears ${count} times.` });
  }

  for (const node of doc.nodes) {
    for (const source of node.sources) {
      if (!index.has(source)) {
        issues.push({ level: 'error', message: `Node "${node.id}" names unknown source "${source}".`, nodeId: node.id });
      }
    }
    if (node.sources.length > MAX_SOURCES) {
      issues.push({ level: 'error', message: `Node "${node.id}" has ${node.sources.length} sources; a CSV row holds ${MAX_SOURCES}.`, nodeId: node.id });
    }
    if (new Set(node.sources).size !== node.sources.length) {
      issues.push({ level: 'warning', message: `Node "${node.id}" lists the same source twice.`, nodeId: node.id });
    }
    if (node.stage === '') {
      issues.push({ level: 'warning', message: `Node "${node.id}" has no stage, so it gets no column or color.`, nodeId: node.id });
    }
    if (node.stage === OUTCOME_STAGE) {
      issues.push({ level: 'warning', message: `Node "${node.id}" uses the reserved stage "${OUTCOME_STAGE}"; use the outcome field instead.`, nodeId: node.id });
    }
  }

  if (doc.nodes.length > 0 && !index.has(ROOT_ID)) {
    issues.push({ level: 'warning', message: `No node with id "${ROOT_ID}"; tree-from-csv treats that id as the tree root.` });
  }

  for (const node of doc.nodes) {
    if (node.sources.includes(node.id)) {
      issues.push({ level: 'error', message: `Node "${node.id}" is its own source.`, nodeId: node.id });
    }
  }

  for (const id of findCycle(doc)) {
    issues.push({ level: 'error', message: `Node "${id}" sits on a cycle; tree-from-csv would not terminate.`, nodeId: id });
  }

  return issues;
}

// findCycle returns the ids taking part in at least one source cycle.
function findCycle(doc) {
  const children = childrenOf(doc);
  const state = new Map();
  const onCycle = new Set();

  const walk = (id, stack) => {
    state.set(id, 'open');
    stack.push(id);
    for (const child of children.get(id) ?? []) {
      if (state.get(child) === 'open') {
        const from = stack.indexOf(child);
        for (const cyclic of stack.slice(from === -1 ? 0 : from)) onCycle.add(cyclic);
      } else if (!state.has(child)) {
        walk(child, stack);
      }
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const node of doc.nodes) {
    if (!state.has(node.id)) walk(node.id, []);
  }
  return [...onCycle];
}
