// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Editor shell: state, history, the side panels and everything the pointer does.

import { csvFromDoc, docFromCsv } from './csv.js';
import {
  MAX_SOURCES, OUTCOME_STAGE, ROOT_ID,
  addLink, addNode, canLink, cloneDoc, deleteNode, emptyDoc,
  childrenOf, nodeById, removeLink, renameNode, validate,
} from './model.js';
import { layout } from './layout.js';
import { buildShell, renderDiagram, toDiagramPoint, exportSvg } from './render.js';

const STORAGE_KEY = 'stage-tree-editor/v1';
const HISTORY_LIMIT = 100;
const EXAMPLE_CSV = '../tree-from-csv/example/example1.csv';

// Sentinel value for the "new stage" entry in the stage dropdown. It has to be
// something no real stage name would be, since the dropdown's other values are
// stage names.
const NEW_STAGE_OPTION = '__new-stage__';

const state = {
  doc: emptyDoc(),
  // Stage names the user created that no node carries yet; the CSV cannot hold
  // these, so they live only in the session.
  extraStages: [],
  fileName: 'stage-tree.csv',
  // A view setting, not part of the document: draw one node per distinct outcome
  // instead of one per row. The CSV is the same either way.
  mergeOutcomes: false,
  selection: null,
  view: { x: 40, y: 30, zoom: 1 },
  undo: [],
  redo: [],
  linkDraft: null,
  hoverId: null,
  diagram: null,
};

let shell = null;
const dom = {};

// ---------------------------------------------------------------- DOM helpers

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'value') {
      node.value = value;
    } else if (key === 'selected' || key === 'disabled' || key === 'checked') {
      if (value) node.setAttribute(key, key);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

let toastTimer = null;
function toast(message, kind = 'info') {
  dom.toast.textContent = message;
  dom.toast.className = `toast is-visible is-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.className = 'toast';
  }, 4000);
}

// ------------------------------------------------------------------- stages

function docStages(doc) {
  return [...new Set(doc.nodes.map((n) => n.stage).filter((s) => s !== ''))].sort();
}

function allStages() {
  return [...new Set([...docStages(state.doc), ...state.extraStages])].sort();
}

// stageColorOf reads the swatch straight off the current layout, so the panel and
// the diagram can never disagree about which color a stage has.
function stageColorOf(name) {
  const stage = state.diagram && state.diagram.stages.find((s) => s.name === name);
  return stage ? stage.color.fillColor : '#cbd5e1';
}

// --------------------------------------------------------------- persistence

let saveTimer = null;

function writeSave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      doc: state.doc,
      extraStages: state.extraStages,
      fileName: state.fileName,
      mergeOutcomes: state.mergeOutcomes,
      view: state.view,
    }));
  } catch (err) {
    // A full or unavailable localStorage should not break editing.
    console.warn('autosave failed', err);
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSave, 400);
}

// flushSave writes immediately. Without this, closing or reloading the page within
// the debounce window would throw away the most recent edits.
function flushSave() {
  clearTimeout(saveTimer);
  writeSave();
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || !saved.doc || !Array.isArray(saved.doc.nodes)) return false;
    state.doc = saved.doc;
    state.extraStages = saved.extraStages ?? [];
    state.fileName = saved.fileName ?? 'stage-tree.csv';
    state.mergeOutcomes = saved.mergeOutcomes === true;
    state.view = saved.view ?? state.view;
    return true;
  } catch (err) {
    console.warn('could not restore autosave', err);
    return false;
  }
}

// ------------------------------------------------------------------ history

// commit applies a mutation, recording the previous document so it can be undone.
// A mutation returning {ok:false} is rejected and rolled back.
function commit(mutate) {
  const before = cloneDoc(state.doc);
  const result = mutate(state.doc);

  if (result && result.ok === false) {
    state.doc = before;
    toast(result.error, 'error');
    render();
    return false;
  }

  state.undo.push(before);
  if (state.undo.length > HISTORY_LIMIT) state.undo.shift();
  state.redo.length = 0;
  save();
  render();
  return true;
}

function undo() {
  if (state.undo.length === 0) return;
  state.redo.push(cloneDoc(state.doc));
  state.doc = state.undo.pop();
  pruneSelection();
  save();
  render();
}

function redo() {
  if (state.redo.length === 0) return;
  state.undo.push(cloneDoc(state.doc));
  state.doc = state.redo.pop();
  pruneSelection();
  save();
  render();
}

function pruneSelection() {
  if (state.selection && state.selection.type === 'node' && !nodeById(state.doc, state.selection.id)) {
    state.selection = null;
  }
}

// ------------------------------------------------------------------ mutations

function createNode() {
  const selected = selectedNode();
  const stages = allStages();
  const stage = selected ? selected.stage : (stages[0] ?? '');
  let created = null;

  commit((doc) => {
    created = addNode(doc, {
      tag: selected ? selected.tag : 'root',
      stage,
      sources: selected ? [selected.id] : [],
    });
  });

  if (created) {
    state.selection = { type: 'node', id: created.id };
    render();
    dom.sidebar.querySelector('[data-field="tag"]')?.select();
  }
}

function setField(id, field, value) {
  commit((doc) => {
    const node = nodeById(doc, id);
    if (!node) return { ok: false, error: `Node "${id}" not found.` };
    node[field] = value;
  });
}

function renameStage(oldName, newName) {
  const name = newName.trim();
  if (name === oldName) return;
  if (name === OUTCOME_STAGE) {
    toast(`"${OUTCOME_STAGE}" is reserved for outcome nodes.`, 'error');
    render();
    return;
  }
  commit((doc) => {
    for (const node of doc.nodes) {
      if (node.stage === oldName) node.stage = name;
    }
  });
  state.extraStages = state.extraStages.map((s) => (s === oldName ? name : s)).filter((s) => s !== '');
  save();
  render();
}

// addStage prompts for a new stage name and returns it, or null if nothing was
// created. Callers that asked for it from a node's dropdown assign it to that node.
function addStage() {
  const name = prompt('New stage name\n\nStages sort alphabetically into columns, which is why the examples prefix them with a number ("1 initialize", "2 brew").');
  if (name === null) return null;

  const trimmed = name.trim();
  if (trimmed === '') return null;
  if (trimmed === OUTCOME_STAGE) {
    toast(`"${OUTCOME_STAGE}" is reserved for outcome nodes.`, 'error');
    return null;
  }
  if (allStages().includes(trimmed)) {
    toast(`Stage "${trimmed}" already exists.`, 'info');
    return trimmed;
  }

  state.extraStages.push(trimmed);
  save();
  render();
  return trimmed;
}

// ------------------------------------------------------------------ selection

function selectedNode() {
  if (!state.selection || state.selection.type !== 'node') return null;
  return nodeById(state.doc, state.selection.id);
}

function select(selection) {
  state.selection = selection;
  render();
}

function deleteSelection() {
  const selection = state.selection;
  if (!selection) return;

  if (selection.type === 'outcome') {
    const owners = outcomeOwners(selection.value);
    if (owners.length === 0) return;
    commit((doc) => {
      for (const node of doc.nodes) {
        if (node.outcome === selection.value) node.outcome = '';
      }
    });
    state.selection = null;
    render();
    toast(`Cleared outcome "${selection.value}" from ${owners.length} node(s).`, 'info');
    return;
  }

  if (selection.type === 'node') {
    const node = nodeById(state.doc, selection.id);
    if (!node) return;
    commit((doc) => deleteNode(doc, selection.id));
    state.selection = null;
    render();
    toast(`Deleted node "${selection.id}".`, 'info');
    return;
  }

  const link = state.diagram.links.find((l) => l.id === selection.id);
  if (!link) return;
  if (link.synthetic) {
    commit((doc) => {
      const owner = nodeById(doc, link.ownerId);
      if (owner) owner.outcome = '';
    });
    state.selection = null;
    render();
    toast('Cleared the outcome.', 'info');
    return;
  }
  commit((doc) => removeLink(doc, link.sourceId, link.targetId));
  state.selection = null;
  render();
}

// -------------------------------------------------------------------- panels

function nodeLabel(id) {
  const node = nodeById(state.doc, id);
  if (!node) return id;
  return node.tag === '' ? id : `${id} · ${node.tag}`;
}

// outcomeOwners lists the ids of the nodes carrying the given outcome, in document order.
function outcomeOwners(value) {
  return state.doc.nodes.filter((n) => n.outcome === value).map((n) => n.id);
}

function renderOutcomeProperties(value) {
  const owners = outcomeOwners(value);
  if (owners.length === 0) return [h('p', { class: 'hint' }, `No node has the outcome "${value}" any more.`)];
  return [
    h('div', { class: 'field' }, [
      h('label', {}, 'Outcome'),
      h('p', { class: 'value' }, value),
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, `Shared by (${owners.length})`),
      h('ul', { class: 'chips' }, owners.map((id) => h('li', {}, [
        h('button', { class: 'chip', onclick: () => select({ type: 'node', id }) }, nodeLabel(id)),
      ]))),
    ]),
    h('p', { class: 'hint' }, 'Outcomes are merged into one node per value. To change one node\'s outcome, select that node.'),
    h('button', { class: 'danger', onclick: deleteSelection }, owners.length === 1 ? 'Clear outcome' : `Clear from all ${owners.length} nodes`),
  ];
}

function renderProperties() {
  const selection = state.selection;

  if (!selection) {
    return [h('p', { class: 'hint' }, 'Select a node or a link to edit it. Drag from one node to another to link them.')];
  }

  if (selection.type === 'outcome') return renderOutcomeProperties(selection.value);

  if (selection.type === 'link') {
    const link = state.diagram.links.find((l) => l.id === selection.id);
    if (!link) return [h('p', { class: 'hint' }, 'That link is gone.')];
    if (link.synthetic) {
      return [
        h('p', { class: 'hint' }, state.mergeOutcomes
          ? `This is the outcome of node ${link.ownerId}, not a source link. It comes from the outcome column; every node with the same outcome points at the same outcome node.`
          : `This is the outcome of node ${link.ownerId}, not a source link. It comes from the outcome column and is drawn as its own node.`),
        h('button', { class: 'danger', onclick: deleteSelection }, 'Clear outcome'),
      ];
    }
    return [
      h('div', { class: 'field' }, [
        h('label', {}, 'Link'),
        h('p', { class: 'value' }, `${nodeLabel(link.sourceId)}  →  ${nodeLabel(link.targetId)}`),
      ]),
      h('p', { class: 'hint' }, `Node ${link.targetId} names ${link.sourceId} as one of its sources.`),
      h('button', { class: 'danger', onclick: deleteSelection }, 'Delete link'),
    ];
  }

  const node = nodeById(state.doc, selection.id);
  if (!node) return [h('p', { class: 'hint' }, 'That node is gone.')];

  const children = childrenOf(state.doc).get(node.id) ?? [];
  const stages = allStages();
  const candidates = state.doc.nodes.filter((n) => canLink(state.doc, n.id, node.id).ok);

  const fields = [
    h('div', { class: 'field' }, [
      h('label', { for: 'f-id' }, 'Id'),
      h('input', {
        id: 'f-id',
        type: 'text',
        value: node.id,
        'data-field': 'id',
        onchange: (e) => {
          const next = e.target.value.trim();
          if (!commit((doc) => renameNode(doc, node.id, next))) return;
          state.selection = { type: 'node', id: next };
          render();
        },
      }),
      node.id === ROOT_ID ? h('p', { class: 'hint' }, 'tree-from-csv treats id "0" as the root of the tree.') : null,
    ]),

    h('div', { class: 'field' }, [
      h('label', { for: 'f-tag' }, 'Tag'),
      h('input', {
        id: 'f-tag',
        type: 'text',
        value: node.tag,
        'data-field': 'tag',
        placeholder: 'label shown under the node',
        onchange: (e) => setField(node.id, 'tag', e.target.value.trim()),
      }),
      h('p', { class: 'hint' }, 'A node repeating the tag of its parent is drawn without a label, so a chain reads as one run.'),
    ]),

    h('div', { class: 'field' }, [
      h('label', { for: 'f-stage' }, 'Stage'),
      h('select', {
        id: 'f-stage',
        onchange: (e) => {
          if (e.target.value === NEW_STAGE_OPTION) {
            const created = addStage();
            // Choosing "new stage" from a node's dropdown means "put this node in it".
            if (created) setField(node.id, 'stage', created);
            else render();
            return;
          }
          setField(node.id, 'stage', e.target.value);
        },
      }, [
        h('option', { value: '', selected: node.stage === '' }, '(no stage)'),
        ...stages.map((s) => h('option', { value: s, selected: s === node.stage }, s)),
        h('option', { value: NEW_STAGE_OPTION }, '+ new stage...'),
      ]),
    ]),

    h('div', { class: 'field' }, [
      h('label', { for: 'f-outcome' }, 'Outcome'),
      h('input', {
        id: 'f-outcome',
        type: 'text',
        value: node.outcome,
        placeholder: 'e.g. pass, fail, declined',
        onchange: (e) => setField(node.id, 'outcome', e.target.value.trim()),
      }),
      h('p', { class: 'hint' }, state.mergeOutcomes
        ? 'An outcome is drawn in the "outcome" column, as one node shared by every node with the same outcome.'
        : 'An outcome is drawn as an extra leaf in the "outcome" column.'),
    ]),

    h('div', { class: 'field' }, [
      h('label', {}, `Sources (${node.sources.length}/${MAX_SOURCES})`),
      node.sources.length === 0
        ? h('p', { class: 'hint' }, 'No sources: this node starts a tree.')
        : h('ul', { class: 'chips' }, node.sources.map((source) => h('li', {}, [
          h('button', { class: 'chip', onclick: () => select({ type: 'node', id: source }) }, nodeLabel(source)),
          h('button', {
            class: 'chip-remove',
            title: `Remove source ${source}`,
            onclick: () => commit((doc) => removeLink(doc, source, node.id)),
          }, '×'),
        ]))),
      node.sources.length >= MAX_SOURCES
        ? h('p', { class: 'hint' }, `A CSV row holds ${MAX_SOURCES} sources, so this node is full.`)
        : h('select', {
          onchange: (e) => {
            if (e.target.value === '') return;
            commit((doc) => addLink(doc, e.target.value, node.id));
          },
        }, [
          h('option', { value: '' }, candidates.length === 0 ? 'no eligible source' : 'add a source...'),
          ...candidates.map((n) => h('option', { value: n.id }, nodeLabel(n.id))),
        ]),
    ]),

    h('div', { class: 'field' }, [
      h('label', {}, `Children (${children.length})`),
      children.length === 0
        ? h('p', { class: 'hint' }, 'No children yet.')
        : h('ul', { class: 'chips' }, children.map((child) => h('li', {}, [
          h('button', { class: 'chip', onclick: () => select({ type: 'node', id: child }) }, nodeLabel(child)),
        ]))),
    ]),

    h('div', { class: 'row' }, [
      h('button', { onclick: createNode }, 'Add child'),
      h('button', { class: 'danger', onclick: deleteSelection }, 'Delete node'),
    ]),
  ];

  return fields;
}

function renderStagesPanel() {
  const stages = allStages();
  const counts = new Map();
  for (const node of state.doc.nodes) {
    counts.set(node.stage, (counts.get(node.stage) ?? 0) + 1);
  }
  const outcomes = state.doc.nodes.filter((n) => n.outcome !== '').map((n) => n.outcome);
  // The count is how many nodes the outcome column holds, which is fewer once merged.
  const outcomeCount = state.mergeOutcomes ? new Set(outcomes).size : outcomes.length;

  const rows = stages.map((name) => h('li', { class: 'stage-row' }, [
    h('span', { class: 'swatch', style: `background:${stageColorOf(name)}` }),
    h('input', {
      type: 'text',
      value: name,
      onchange: (e) => renameStage(name, e.target.value),
    }),
    h('span', { class: 'count', title: `${counts.get(name) ?? 0} node(s)` }, String(counts.get(name) ?? 0)),
  ]));

  if (outcomeCount > 0) {
    rows.push(h('li', { class: 'stage-row is-locked' }, [
      h('span', { class: 'swatch', style: `background:${stageColorOf(OUTCOME_STAGE)}` }),
      h('span', { class: 'locked-name' }, OUTCOME_STAGE),
      h('span', { class: 'count', title: `${outcomeCount} node(s)` }, String(outcomeCount)),
    ]));
  }

  return [
    stages.length === 0 ? h('p', { class: 'hint' }, 'No stages yet.') : h('ul', { class: 'stage-list' }, rows),
    h('p', { class: 'hint' }, 'Columns are ordered by sorting stage names, so a number prefix controls both order and color.'),
    h('button', { onclick: addStage }, 'Add stage'),
  ];
}

function renderIssues() {
  const issues = validate(state.doc);
  if (issues.length === 0) {
    return [h('p', { class: 'hint is-ok' }, 'No problems. This document is ready for tree-from-csv.')];
  }
  return [h('ul', { class: 'issues' }, issues.map((issue) => h('li', { class: `issue is-${issue.level}` }, [
    issue.nodeId
      ? h('button', { class: 'link-button', onclick: () => select({ type: 'node', id: issue.nodeId }) }, issue.message)
      : h('span', {}, issue.message),
  ])))];
}

function renderSidebar() {
  dom.properties.replaceChildren(...renderProperties());
  dom.stages.replaceChildren(...renderStagesPanel());
  dom.issues.replaceChildren(...renderIssues());
}

function renderStatus() {
  const linkCount = state.doc.nodes.reduce((sum, n) => sum + n.sources.length, 0);
  const outcomes = state.doc.nodes.filter((n) => n.outcome !== '').length;
  dom.status.textContent =
    `${state.doc.nodes.length} node(s) · ${linkCount} link(s) · ${outcomes} outcome(s) · ${state.fileName}` +
    (state.diagram && state.diagram.truncated ? ' · layout truncated: the graph re-converges too heavily to measure fully' : '');
  dom.undoButton.disabled = state.undo.length === 0;
  dom.redoButton.disabled = state.redo.length === 0;
}

// -------------------------------------------------------------------- render

function render() {
  state.diagram = layout(state.doc, { mergeOutcomes: state.mergeOutcomes });
  dom.mergeOutcomes.checked = state.mergeOutcomes;
  renderDiagram(shell, state.diagram, {
    selection: state.selection,
    view: state.view,
    linkDraft: state.linkDraft,
    hoverId: state.hoverId,
  });
  renderSidebar();
  renderStatus();
}

function fitToView() {
  const box = shell.svg.getBoundingClientRect();
  const diagram = state.diagram ?? layout(state.doc, { mergeOutcomes: state.mergeOutcomes });
  const margin = 30;
  if (diagram.width <= 0 || diagram.height <= 0) return;

  const zoom = Math.min(
    (box.width - margin * 2) / diagram.width,
    (box.height - margin * 2) / diagram.height,
    2,
  );
  state.view.zoom = Math.max(0.1, zoom);
  state.view.x = margin;
  state.view.y = margin;
  render();
}

function zoomBy(factor, anchor) {
  const box = shell.svg.getBoundingClientRect();
  const center = anchor ?? { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
  const before = toDiagramPoint(shell, center, state.view);
  state.view.zoom = Math.min(4, Math.max(0.1, state.view.zoom * factor));
  const after = toDiagramPoint(shell, center, state.view);
  state.view.x += (after.x - before.x) * state.view.zoom;
  state.view.y += (after.y - before.y) * state.view.zoom;
  render();
}

// --------------------------------------------------------------- canvas input

const DRAG_THRESHOLD = 4;

function nodeFromGroup(group) {
  return group ? { id: group.dataset.node, owner: group.dataset.owner, synthetic: group.dataset.synthetic === '1' } : null;
}

function nodeIdFromEvent(event) {
  return nodeFromGroup(event.target.closest('.node'));
}

// nodeUnderPointer asks the document what is under the cursor rather than reading
// event.target. Once a drag captures the pointer, every event retargets to the
// captured element, so event.target stops naming the node being hovered.
function nodeUnderPointer(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  return nodeFromGroup(element && element.closest ? element.closest('.node') : null);
}

function bindCanvas() {
  const svg = shell.svg;

  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const hit = nodeIdFromEvent(event);
    const start = { x: event.clientX, y: event.clientY };

    if (hit && !hit.synthetic) {
      // Dragging from a node draws a link; a click without movement selects it.
      const source = state.diagram.nodes.find((n) => n.id === hit.id);
      svg.setPointerCapture(event.pointerId);
      const drag = {
        kind: 'link',
        sourceId: hit.id,
        moved: false,
        origin: { x: source.cx, y: source.cy },
        start,
      };
      svg.__drag = drag;
      return;
    }

    const link = event.target.closest('.link');
    if (link) {
      select({ type: 'link', id: link.dataset.link });
      return;
    }

    if (hit && hit.synthetic) {
      // A per-row outcome selects the node it belongs to; a merged one has
      // several owners, so it selects the outcome value itself.
      if (hit.owner) {
        select({ type: 'node', id: hit.owner });
      } else {
        const outcome = state.diagram.nodes.find((n) => n.id === hit.id);
        select(outcome ? { type: 'outcome', value: outcome.tag } : null);
      }
      return;
    }

    svg.setPointerCapture(event.pointerId);
    svg.__drag = { kind: 'pan', start, view: { ...state.view }, moved: false };
  });

  svg.addEventListener('pointermove', (event) => {
    const drag = svg.__drag;
    if (!drag) {
      const hit = nodeIdFromEvent(event);
      const nextHover = hit && !hit.synthetic ? hit.id : null;
      if (nextHover !== state.hoverId && state.linkDraft) {
        state.hoverId = nextHover;
        render();
      }
      return;
    }

    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;

    if (drag.kind === 'pan') {
      state.view.x = drag.view.x + dx;
      state.view.y = drag.view.y + dy;
      render();
      return;
    }

    const point = toDiagramPoint(shell, event, state.view);
    const hit = nodeUnderPointer(event);
    state.hoverId = hit && !hit.synthetic && hit.id !== drag.sourceId ? hit.id : null;
    state.linkDraft = { x1: drag.origin.x, y1: drag.origin.y, x2: point.x, y2: point.y };
    render();
  });

  const endDrag = (event) => {
    const drag = svg.__drag;
    if (!drag) return;
    svg.__drag = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);

    const wasLinking = drag.kind === 'link';
    // Recompute from the release position rather than trusting the last hover.
    const released = nodeUnderPointer(event);
    const target = released && !released.synthetic ? released.id : null;
    state.linkDraft = null;
    state.hoverId = null;

    if (!wasLinking) {
      if (!drag.moved) select(null);
      else render();
      return;
    }

    if (!drag.moved) {
      select({ type: 'node', id: drag.sourceId });
      return;
    }

    if (target && target !== drag.sourceId) {
      if (commit((doc) => addLink(doc, drag.sourceId, target))) {
        select({ type: 'node', id: target });
      }
      return;
    }

    render();
  };

  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('dblclick', (event) => {
    if (nodeIdFromEvent(event) || event.target.closest('.link')) return;
    createNode();
  });

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event);
  }, { passive: false });
}

// ------------------------------------------------------------------- file I/O

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const name = state.fileName.endsWith('.csv') ? state.fileName : `${state.fileName}.csv`;
  download(name, csvFromDoc(state.doc), 'text/csv');
  toast(`Saved ${name}.`, 'ok');
}

function loadCsvText(text, fileName) {
  const parsed = docFromCsv(text);
  commit((doc) => {
    doc.header = parsed.header;
    doc.nodes = parsed.nodes;
  });
  state.fileName = fileName;
  state.selection = null;
  state.extraStages = [];
  fitToView();

  const problems = parsed.problems ?? [];
  if (problems.length > 0) {
    toast(`${problems.length} row problem(s): ${problems[0]}`, 'error');
    console.warn('CSV problems:', problems);
  } else {
    toast(`Loaded ${parsed.nodes.length} nodes from ${fileName}.`, 'ok');
  }
}

async function loadExample() {
  try {
    const response = await fetch(EXAMPLE_CSV);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadCsvText(await response.text(), 'example1.csv');
  } catch (err) {
    toast('Could not fetch the example. Serve the repository root over HTTP (see editor/readme.md).', 'error');
    console.warn(err);
  }
}

function newDocument() {
  if (state.doc.nodes.length > 0 && !confirm('Start a new tree? The current one is replaced (undo still works).')) return;
  commit((doc) => {
    doc.header = emptyDoc().header;
    doc.nodes = [];
    addNode(doc, { tag: 'root', stage: '1 first stage' });
  });
  state.extraStages = [];
  state.fileName = 'stage-tree.csv';
  state.selection = { type: 'node', id: ROOT_ID };
  fitToView();
}

// ------------------------------------------------------------------ keyboard

function bindKeyboard() {
  window.addEventListener('keydown', (event) => {
    const tag = event.target.tagName;
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      exportCsv();
      return;
    }

    if (typing) {
      if (event.key === 'Escape') event.target.blur();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelection();
    } else if (event.key === 'Escape') {
      select(null);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      createNode();
    }
  });
}

// ---------------------------------------------------------------------- init

function bindToolbar() {
  document.getElementById('btn-new').addEventListener('click', newDocument);
  document.getElementById('btn-example').addEventListener('click', loadExample);
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-export-svg').addEventListener('click', () => {
    download(state.fileName.replace(/\.csv$/i, '') + '.svg', exportSvg(shell, state.diagram), 'image/svg+xml');
    toast('Saved an SVG snapshot.', 'ok');
  });
  document.getElementById('btn-add').addEventListener('click', createNode);
  document.getElementById('btn-fit').addEventListener('click', fitToView);
  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));

  dom.undoButton = document.getElementById('btn-undo');
  dom.redoButton = document.getElementById('btn-redo');
  dom.undoButton.addEventListener('click', undo);
  dom.redoButton.addEventListener('click', redo);

  dom.mergeOutcomes = document.getElementById('opt-merge-outcomes');
  dom.mergeOutcomes.addEventListener('change', () => {
    state.mergeOutcomes = dom.mergeOutcomes.checked;
    // A selected outcome value only exists as a node while outcomes are merged.
    if (!state.mergeOutcomes && state.selection && state.selection.type === 'outcome') state.selection = null;
    save();
    render();
  });

  const input = document.getElementById('file-input');
  document.getElementById('btn-import').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    loadCsvText(await file.text(), file.name);
    input.value = '';
  });
}

function init() {
  dom.toast = document.getElementById('toast');
  dom.status = document.getElementById('status');
  dom.sidebar = document.getElementById('sidebar');
  dom.properties = document.getElementById('panel-properties');
  dom.stages = document.getElementById('panel-stages');
  dom.issues = document.getElementById('panel-issues');

  shell = buildShell(document.getElementById('canvas'));

  bindToolbar();
  bindCanvas();
  bindKeyboard();

  const restored = restore();
  if (!restored) {
    state.doc = emptyDoc();
    addNode(state.doc, { tag: 'root', stage: '1 first stage' });
    state.selection = { type: 'node', id: ROOT_ID };
  }

  render();
  if (!restored) fitToView();
  window.addEventListener('resize', () => render());

  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}

document.addEventListener('DOMContentLoaded', init);
