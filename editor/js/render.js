// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// SVG renderer. Draws what tree-from-csv draws: stage header bars, small ellipse
// nodes colored by stage with their tag underneath, and elbow connectors between
// them. See tree-from-csv/example/*.svg for the reference output.

import { NODE_RADIUS, FONT_FAMILY, FONT_SIZE, HEADER_FONT_COLOR, NODE_FONT_COLOR } from './style.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Distance a connector runs straight out of a node before it turns, matching the
// stubs in the Drawio entityRelationEdgeStyle output.
const STUB = 20;

// Nodes are drawn at radius 5; clicking a 10px dot is unpleasant, so each node
// carries a larger invisible hit target.
const HIT_RADIUS = 11;

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.appendChild(child);
  }
  return node;
}

function text(content, attrs) {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

// buildShell creates the persistent SVG structure once; renderDiagram refills the layers.
export function buildShell(container) {
  const arrow = el('marker', {
    id: 'st-arrow',
    viewBox: '0 0 10 10',
    refX: 10,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse',
  }, [el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'rgb(0,0,0)' })]);

  const layers = {
    stages: el('g', { class: 'layer-stages' }),
    links: el('g', { class: 'layer-links' }),
    nodes: el('g', { class: 'layer-nodes' }),
    overlay: el('g', { class: 'layer-overlay' }),
  };

  const viewport = el('g', { class: 'viewport' }, [layers.stages, layers.links, layers.nodes, layers.overlay]);
  const svg = el('svg', { class: 'canvas', xmlns: SVG_NS });
  svg.appendChild(el('defs', {}, [arrow]));
  svg.appendChild(viewport);
  container.appendChild(svg);

  return { svg, viewport, layers };
}

// Radius of the turn where a connector changes direction, as in the Drawio output.
const CORNER = 10;

// linkPath routes a connector the way entityRelationEdgeStyle does in the Drawio
// export: out of the source, a rounded turn, one straight run across the rows,
// another rounded turn, then into the target where the arrowhead sits.
export function linkPath(link) {
  const sx = link.source.cx + NODE_RADIUS;
  const sy = link.source.cy;
  const tx = link.target.cx - NODE_RADIUS;
  const ty = link.target.cy;

  if (sy === ty) return `M ${sx} ${sy} L ${tx} ${ty}`;

  // The turn happens midway between the two stubs, so parallel connectors between
  // the same pair of columns stack up neatly instead of crossing.
  const mid = Math.max(Math.min((sx + STUB + tx - STUB) / 2, tx - 8), sx + 8);
  const vertical = Math.sign(ty - sy);
  const into = Math.sign(mid - sx) || 1;
  const outOf = Math.sign(tx - mid) || 1;
  const r = Math.max(0, Math.min(CORNER, Math.abs(ty - sy) / 2, Math.abs(mid - sx), Math.abs(tx - mid)));

  return [
    `M ${sx} ${sy}`,
    `L ${mid - r * into} ${sy}`,
    `Q ${mid} ${sy} ${mid} ${sy + r * vertical}`,
    `L ${mid} ${ty - r * vertical}`,
    `Q ${mid} ${ty} ${mid + r * outOf} ${ty}`,
    `L ${tx} ${ty}`,
  ].join(' ');
}

function renderStages(layer, stages) {
  layer.replaceChildren();
  for (const stage of stages) {
    const group = el('g', { class: 'stage', 'data-stage': stage.name });
    group.appendChild(el('rect', {
      x: stage.x,
      y: stage.y,
      width: stage.width,
      height: stage.height,
      fill: stage.color.fillColor,
      stroke: stage.color.strokeColor,
    }));
    group.appendChild(text(stage.displayName, {
      x: stage.x + stage.width / 2,
      y: stage.y + stage.height / 2 + 4,
      'text-anchor': 'middle',
      fill: HEADER_FONT_COLOR,
      'font-family': FONT_FAMILY,
      'font-size': FONT_SIZE,
      class: 'stage-label',
    }));
    layer.appendChild(group);
  }
}

function renderLinks(layer, links, selection) {
  layer.replaceChildren();
  for (const link of links) {
    const selected = selection && selection.type === 'link' && selection.id === link.id;
    const group = el('g', {
      class: `link${selected ? ' is-selected' : ''}${link.synthetic ? ' is-synthetic' : ''}`,
      'data-link': link.id,
      'data-source': link.sourceId,
      'data-target': link.targetId,
    });
    const d = linkPath(link);
    // Wide transparent path first: it is what the pointer actually hits.
    group.appendChild(el('path', { d, class: 'link-hit', fill: 'none' }));
    group.appendChild(el('path', { d, class: 'link-line', fill: 'none', 'marker-end': 'url(#st-arrow)' }));
    layer.appendChild(group);
  }
}

function renderNodes(layer, nodes, selection, hoverId) {
  layer.replaceChildren();
  for (const node of nodes) {
    const selected = selection && selection.type === 'node' &&
      (selection.id === node.id || selection.id === node.ownerId);
    const classes = ['node'];
    if (selected) classes.push('is-selected');
    if (node.synthetic) classes.push('is-synthetic');
    if (hoverId === node.id) classes.push('is-drop-target');

    const group = el('g', {
      class: classes.join(' '),
      'data-node': node.id,
      'data-owner': node.ownerId,
      'data-synthetic': node.synthetic ? '1' : '0',
    });

    if (selected) {
      group.appendChild(el('circle', { cx: node.cx, cy: node.cy, r: NODE_RADIUS + 4, class: 'node-halo' }));
    }

    group.appendChild(el('ellipse', {
      cx: node.cx,
      cy: node.cy,
      rx: NODE_RADIUS,
      ry: NODE_RADIUS,
      fill: node.color.fillColor,
      stroke: node.color.strokeColor,
      class: 'node-shape',
    }));

    if (node.label !== '') {
      group.appendChild(text(node.label, {
        x: node.cx,
        y: node.cy + 22,
        'text-anchor': 'middle',
        fill: NODE_FONT_COLOR,
        'font-family': FONT_FAMILY,
        'font-size': FONT_SIZE,
        class: 'node-label',
      }));
    }

    group.appendChild(el('circle', { cx: node.cx, cy: node.cy, r: HIT_RADIUS, class: 'node-hit' }));

    const title = el('title');
    title.textContent = node.synthetic
      ? `outcome "${node.tag}" of node ${node.ownerId}`
      : `id ${node.id}${node.tag ? ` · ${node.tag}` : ''}${node.stage ? ` · ${node.stage}` : ''}`;
    group.appendChild(title);

    layer.appendChild(group);
  }
}

function renderOverlay(layer, linkDraft) {
  layer.replaceChildren();
  if (!linkDraft) return;
  layer.appendChild(el('line', {
    x1: linkDraft.x1,
    y1: linkDraft.y1,
    x2: linkDraft.x2,
    y2: linkDraft.y2,
    class: 'link-draft',
  }));
}

export function renderDiagram(shell, diagram, { selection, view, linkDraft, hoverId }) {
  renderStages(shell.layers.stages, diagram.stages);
  renderLinks(shell.layers.links, diagram.links, selection);
  renderNodes(shell.layers.nodes, diagram.nodes, selection, hoverId);
  renderOverlay(shell.layers.overlay, linkDraft);
  shell.viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
}

// toDiagramPoint converts a pointer event into diagram coordinates.
export function toDiagramPoint(shell, event, view) {
  const box = shell.svg.getBoundingClientRect();
  return {
    x: (event.clientX - box.left - view.x) / view.zoom,
    y: (event.clientY - box.top - view.y) / view.zoom,
  };
}

// exportSvg returns a standalone SVG document of the current diagram, so a
// finished tree can leave the editor as a picture as well as as a CSV.
export function exportSvg(shell, diagram) {
  const clone = shell.svg.cloneNode(true);
  const margin = 20;
  clone.querySelectorAll('.node-hit, .link-hit, .node-halo, .link-draft, .layer-overlay').forEach((n) => n.remove());
  clone.querySelector('.viewport').setAttribute('transform', `translate(${margin} ${margin})`);
  clone.setAttribute('width', `${diagram.width + margin * 2}px`);
  clone.setAttribute('height', `${diagram.height + margin * 2}px`);
  clone.setAttribute('viewBox', `0 0 ${diagram.width + margin * 2} ${diagram.height + margin * 2}`);
  clone.querySelectorAll('.link-line').forEach((n) => {
    n.setAttribute('stroke', 'rgb(0,0,0)');
    n.setAttribute('stroke-width', '1');
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone) + '\n';
}
