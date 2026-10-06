// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Tests for the editor's CSV, model and layout modules. No dependencies, no runner:
//   node editor/test/run-tests.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCsv, docFromCsv, csvFromDoc, DEFAULT_HEADER } from '../js/csv.js';
import {
  addLink, addNode, canLink, childrenOf, deleteNode, emptyDoc,
  nextId, nodeById, removeLink, renameNode, validate,
} from '../js/model.js';
import { buildPlotGraph, layout } from '../js/layout.js';
import { linkPath } from '../js/render.js';
import { NODE_RADIUS } from '../js/style.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const example = (name) => readFileSync(join(root, 'tree-from-csv', 'example', name), 'utf8');

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, message: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'assertion failed');
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message ?? 'not equal'}\n    expected: ${b}\n    actual:   ${a}`);
}

// ------------------------------------------------------------------ parsing

// `node --check` parses a .js file as a script, not a module, and lets malformed
// ES modules through with exit 0 — so it is not a syntax gate. Actually importing
// each file is. app.js has no other coverage here, since it touches the DOM as
// soon as it loads, which makes this its only automated check.
for (const file of ['style.js', 'csv.js', 'model.js', 'layout.js', 'render.js', 'app.js']) {
  try {
    await import(`../js/${file}`);
    passed++;
  } catch (err) {
    if (err instanceof SyntaxError) {
      failures.push({ name: `${file} parses`, message: err.message });
    } else {
      // Anything else means it parsed and then tried to touch a browser global,
      // which is expected for the files that draw or wire up the page.
      passed++;
    }
  }
}

// ------------------------------------------------------------------- CSV

check('parseCsv handles quotes, escaped quotes and CRLF', () => {
  const rows = parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n');
  assertEqual(rows, [['a', 'b'], ['x,1', 'he said "hi"']]);
});

check('parseCsv keeps empty trailing fields', () => {
  assertEqual(parseCsv('1,,,\n'), [['1', '', '', '']]);
});

check('docFromCsv reads the seven-column format', () => {
  const doc = docFromCsv(example('example1.csv'));
  assertEqual(doc.problems, []);
  assertEqual(doc.nodes.length, 19, 'example1 has 19 data rows');

  const root = nodeById(doc, '0');
  assertEqual(root, { id: '0', tag: 'big-bang', sources: [], stage: '1 initialize', outcome: '' });

  // Three sources on one row, and the trailing-space outcome trimmed.
  assertEqual(nodeById(doc, '15').sources, ['11', '13', '14']);
  assertEqual(nodeById(doc, '16').outcome, 'inconclusive');
});

check('docFromCsv preserves the header names it was given', () => {
  const doc = docFromCsv(example('example2.csv'));
  assertEqual(doc.header, ['entry', 'anoncompany', 's1', 's2', 's3', 'phase', 'outcome']);
});

check('docFromCsv reports duplicate and empty ids instead of dropping them silently', () => {
  const doc = docFromCsv('id,tag,s1,s2,s3,stage,outcome\n0,a,,,,x,\n0,b,,,,x,\n,c,,,,x,\n');
  assertEqual(doc.nodes.length, 1);
  assertEqual(doc.problems.length, 2);
});

check('csvFromDoc round-trips both examples, modulo whitespace', () => {
  for (const name of ['example1.csv', 'example2.csv']) {
    const original = example(name);
    // The editor trims fields on import, so compare against a trimmed original.
    const normalized = original
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.split(',').map((f) => f.trim()).join(','))
      .join('\n') + '\n';

    assertEqual(csvFromDoc(docFromCsv(original)), normalized, `${name} round-trip`);
  }
});

check('csvFromDoc is idempotent', () => {
  const once = csvFromDoc(docFromCsv(example('example2.csv')));
  const twice = csvFromDoc(docFromCsv(once));
  assertEqual(twice, once);
});

check('csvFromDoc quotes fields that need it', () => {
  const doc = emptyDoc();
  addNode(doc, { tag: 'a,b', stage: 'say "hi"' });
  const line = csvFromDoc(doc).split('\n')[1];
  assertEqual(line, '0,"a,b",,,,"say ""hi""",');
});

check('an empty document exports just a header', () => {
  assertEqual(csvFromDoc(emptyDoc()), DEFAULT_HEADER.join(',') + '\n');
});

// ------------------------------------------------------------------ model

check('addNode gives the first node the root id', () => {
  const doc = emptyDoc();
  assertEqual(addNode(doc, {}).id, '0');
  assertEqual(addNode(doc, {}).id, '1');
});

check('nextId skips ids already in use', () => {
  const doc = docFromCsv(example('example1.csv'));
  assertEqual(nextId(doc), '19');
});

check('canLink refuses a self link, a duplicate, and a fourth source', () => {
  const doc = docFromCsv(example('example1.csv'));
  assert(!canLink(doc, '0', '0').ok, 'self link');
  assert(!canLink(doc, '11', '15').ok, 'duplicate link');
  assert(!canLink(doc, '0', '15').ok, 'node 15 already has three sources');
  assert(canLink(doc, '0', '11').ok, 'node 11 has room for another source');
});

check('canLink refuses a cycle', () => {
  const doc = docFromCsv(example('example1.csv'));
  // 0 -> 1 -> 4 -> 5, so 5 -> 0 would close a loop.
  assert(!canLink(doc, '5', '0').ok, 'cycle');
  assertEqual(canLink(doc, '5', '0').error, 'That link would create a cycle.');
});

check('addLink and removeLink change the target row', () => {
  const doc = docFromCsv(example('example1.csv'));
  assert(addLink(doc, '0', '11').ok);
  assertEqual(nodeById(doc, '11').sources, ['10', '0']);
  assert(removeLink(doc, '10', '11').ok);
  assertEqual(nodeById(doc, '11').sources, ['0']);
});

check('deleteNode strips references to it', () => {
  const doc = docFromCsv(example('example1.csv'));
  deleteNode(doc, '11');
  assertEqual(nodeById(doc, '11'), undefined);
  assertEqual(nodeById(doc, '15').sources, ['13', '14'], 'node 15 lost source 11');
});

check('renameNode repoints every source that named it', () => {
  const doc = docFromCsv(example('example1.csv'));
  assert(renameNode(doc, '11', 'eleven').ok);
  assertEqual(nodeById(doc, '15').sources, ['eleven', '13', '14']);
  assert(!renameNode(doc, '12', '13').ok, 'refuses an id already in use');
  assert(!renameNode(doc, '12', '  ').ok, 'refuses an empty id');
});

check('childrenOf maps sources to the rows that name them', () => {
  const doc = docFromCsv(example('example1.csv'));
  assertEqual(childrenOf(doc).get('10'), ['11', '14', '12']);
});

check('validate is quiet on a good document', () => {
  assertEqual(validate(docFromCsv(example('example1.csv'))), []);
  assertEqual(validate(docFromCsv(example('example2.csv'))), []);
});

check('validate reports unknown sources, cycles and missing stages', () => {
  const doc = docFromCsv('id,tag,s1,s2,s3,stage,outcome\n0,a,,,,1 x,\n1,b,ghost,,,1 x,\n2,c,3,,,,\n3,d,2,,,1 x,\n');
  const messages = validate(doc).map((i) => i.message);
  assert(messages.some((m) => m.includes('unknown source "ghost"')), 'unknown source');
  assert(messages.some((m) => m.includes('cycle')), 'cycle between 2 and 3');
  assert(messages.some((m) => m.includes('has no stage')), 'missing stage');
});

// ----------------------------------------------------------------- layout

// Everything below is checked against tree-from-csv/example/example1.svg, the
// committed output of the Go tool for example1.csv.

check('stage columns match the Go output exactly', () => {
  const diagram = layout(docFromCsv(example('example1.csv')));
  assertEqual(
    diagram.stages.map((s) => [s.name, s.x, s.width]),
    [
      ['1 initialize', 0, 80],
      ['2 brew', 80, 240],
      ['3 rest', 320, 160],
      ['4 test', 480, 240],
      ['outcome', 720, 80],
    ],
  );
});

check('stage colors follow sorted stage order', () => {
  const diagram = layout(docFromCsv(example('example1.csv')));
  assertEqual(diagram.stages.map((s) => s.color.fillColor), ['#60A917', '#0050ef', '#d80073', '#6a00ff', '#a20025']);
});

check('outcomes become synthesized leaf nodes, as in readEvents', () => {
  const doc = docFromCsv(example('example1.csv'));
  const plot = buildPlotGraph(doc);
  assertEqual(plot.nodes.size, 23, '19 rows + 4 outcomes');

  const synthetic = [...plot.nodes.values()].filter((n) => n.synthetic).map((n) => n.id).sort();
  assertEqual(synthetic, ['16inconclusive', '6pass', '7fail', '9pass']);

  const outcome = plot.nodes.get('7fail');
  assertEqual([outcome.tag, outcome.stage, outcome.ownerId], ['fail', 'outcome', '7']);
  assert(plot.children.get('7').includes('7fail'), 'the outcome hangs off its own row');
});

check('node positions match the Go output', () => {
  const diagram = layout(docFromCsv(example('example1.csv')));
  const at = (id) => {
    const node = diagram.nodes.find((n) => n.id === id);
    assert(node, `node ${id} was not laid out`);
    return [node.cx, node.cy];
  };

  assertEqual(diagram.nodes.length, 23);

  // Read straight off the <ellipse cx cy> values in example1.svg.
  assertEqual(at('0'), [40, 50], 'root');
  assertEqual(at('1'), [120, 50], 'sample 1 enters "2 brew"');
  assertEqual(at('4'), [360, 50], 'pulled right into the "3 rest" column');
  assertEqual(at('5'), [440, 50], 'second node of the "3 rest" run');
  assertEqual(at('2'), [120, 170]);
  assertEqual(at('10'), [200, 170]);
  assertEqual(at('11'), [520, 170]);
  assertEqual(at('15'), [600, 170]);
  assertEqual(at('16'), [680, 170]);
  assertEqual(at('16inconclusive'), [760, 170]);
  assertEqual(at('14'), [520, 210]);
  assertEqual(at('12'), [360, 250]);
  assertEqual(at('13'), [520, 250]);
  assertEqual(at('3'), [120, 290], 'sample 3');
  assertEqual(at('17'), [200, 290]);
  assertEqual(at('18'), [280, 290]);
});

check('tied siblings share a column and take one row each', () => {
  // Nodes 6, 7 and 8 share both stage and tag, so the Go code's unstable
  // sort.Slice leaves their order arbitrary and it varies between runs. Their
  // column and the set of rows they occupy are stable; which one lands on which
  // row is not, so that is all this asserts.
  const diagram = layout(docFromCsv(example('example1.csv')));
  const tied = ['6', '7', '8'].map((id) => diagram.nodes.find((n) => n.id === id));
  assertEqual(tied.map((n) => n.cx), [520, 520, 520]);
  assertEqual(tied.map((n) => n.cy).sort((a, b) => a - b), [50, 90, 130]);
});

check('every node sits inside its stage column', () => {
  for (const name of ['example1.csv', 'example2.csv']) {
    const diagram = layout(docFromCsv(example(name)));
    const columns = new Map(diagram.stages.map((s) => [s.name, s]));
    for (const node of diagram.nodes) {
      const column = columns.get(node.stage);
      assert(column, `${name}: no column for stage "${node.stage}"`);
      assert(
        node.cx >= column.x && node.cx <= column.x + column.width,
        `${name}: node ${node.id} at cx ${node.cx} escapes column "${node.stage}" [${column.x}, ${column.x + column.width}]`,
      );
    }
  }
});

check('layout draws every link in the document', () => {
  const doc = docFromCsv(example('example1.csv'));
  const diagram = layout(doc);
  const expected = doc.nodes.reduce((sum, n) => sum + n.sources.length, 0) +
    doc.nodes.filter((n) => n.outcome !== '').length;
  assertEqual(diagram.links.length, expected, 'one link per source, plus one per outcome');

  const outcomeLink = diagram.links.find((l) => l.targetId === '7fail');
  assert(outcomeLink.synthetic, 'outcome links are marked synthetic');
  assertEqual(outcomeLink.ownerId, '7');
});

// --------------------------------------------------------- merged outcomes

check('merged outcomes become one node per distinct value', () => {
  const plot = buildPlotGraph(docFromCsv(example('example1.csv')), { mergeOutcomes: true });
  assertEqual(plot.nodes.size, 22, '19 rows + 3 distinct outcomes (pass twice)');

  const synthetic = [...plot.nodes.values()].filter((n) => n.synthetic);
  assertEqual(synthetic.map((n) => n.id).sort(), ['outcome:fail', 'outcome:inconclusive', 'outcome:pass']);

  const pass = plot.nodes.get('outcome:pass');
  assertEqual([pass.tag, pass.stage, pass.ownerId, pass.owners], ['pass', 'outcome', null, ['6', '9']]);
  assert(plot.children.get('6').includes('outcome:pass'), 'node 6 points at the shared outcome');
  assert(plot.children.get('9').includes('outcome:pass'), 'node 9 points at the same one');
});

check('merged outcomes keep one link per owner', () => {
  const doc = docFromCsv(example('example1.csv'));
  const diagram = layout(doc, { mergeOutcomes: true });
  assertEqual(diagram.nodes.length, 22);
  assertEqual(diagram.links.length, layout(doc).links.length, 'same links, fewer targets');

  const toPass = diagram.links.filter((l) => l.targetId === 'outcome:pass');
  assertEqual(toPass.map((l) => l.ownerId).sort(), ['6', '9'], 'each link is owned by its source row');
  assert(toPass.every((l) => l.synthetic));
});

check('merged outcome nodes sit in the outcome column without overlapping', () => {
  for (const name of ['example1.csv', 'example2.csv']) {
    const diagram = layout(docFromCsv(example(name)), { mergeOutcomes: true });
    const column = diagram.stages.find((s) => s.name === 'outcome');
    const outcomes = diagram.nodes.filter((n) => n.synthetic);
    assert(outcomes.every((n) => n.cx >= column.x && n.cx <= column.x + column.width), `${name}: outcome escapes its column`);
    const spots = new Set(outcomes.map((n) => `${n.cx},${n.cy}`));
    assertEqual(spots.size, outcomes.length, `${name}: two outcome nodes share a position`);
  }
});

check('merging does not change the CSV', () => {
  const doc = docFromCsv(example('example1.csv'));
  const before = csvFromDoc(doc);
  layout(doc, { mergeOutcomes: true });
  assertEqual(csvFromDoc(doc), before);
});

check('a merged outcome does not collide with a row id', () => {
  const doc = docFromCsv('id,tag,s1,s2,s3,stage,outcome\n0,a,,,,1 x,ok\noutcome:ok,b,0,,,1 x,ok\n');
  const plot = buildPlotGraph(doc, { mergeOutcomes: true });
  assertEqual(plot.nodes.size, 3);
  const shared = [...plot.nodes.values()].find((n) => n.synthetic);
  assertEqual(shared.owners, ['0', 'outcome:ok']);
  assert(plot.nodes.get('outcome:ok').synthetic === false, 'the real row keeps its id');
});

check('layout is deterministic', () => {
  const doc = docFromCsv(example('example2.csv'));
  const first = layout(doc).nodes.map((n) => [n.id, n.cx, n.cy]);
  const second = layout(doc).nodes.map((n) => [n.id, n.cx, n.cy]);
  assertEqual(second, first);
});

check('layout survives a CSV round-trip unchanged', () => {
  const doc = docFromCsv(example('example2.csv'));
  const before = layout(doc).nodes.map((n) => [n.id, n.cx, n.cy]);
  const after = layout(docFromCsv(csvFromDoc(doc))).nodes.map((n) => [n.id, n.cx, n.cy]);
  assertEqual(after, before);
});

check('layout places every node even without a root or with a cycle', () => {
  const doc = docFromCsv('id,tag,s1,s2,s3,stage,outcome\n7,a,,,,1 x,\n8,b,7,,,2 y,\n9,c,10,,,2 y,\n10,d,9,,,2 y,\n');
  const diagram = layout(doc);
  assertEqual(diagram.nodes.length, 4, 'the cycle members are still drawn');
  assert(diagram.nodes.every((n) => Number.isFinite(n.cx) && Number.isFinite(n.cy)));
  assert(!diagram.truncated, 'a small cycle does not exhaust the probe budget');
});

check('an empty document lays out to nothing', () => {
  const diagram = layout(emptyDoc());
  assertEqual([diagram.nodes.length, diagram.links.length, diagram.stages.length], [0, 0, 0]);
});

// --------------------------------------------------------------- connectors

check('a connector between nodes on one row is a straight line', () => {
  const path = linkPath({ source: { cx: 40, cy: 50 }, target: { cx: 120, cy: 50 } });
  assertEqual(path, 'M 45 50 L 115 50');
});

check('a connector between rows turns twice and spans edge to edge', () => {
  const path = linkPath({ source: { cx: 40, cy: 50 }, target: { cx: 120, cy: 170 } });
  assert(path.startsWith('M 45 50 '), `starts at the source edge: ${path}`);
  assert(path.endsWith(' L 115 170'), `ends at the target edge: ${path}`);
  assertEqual((path.match(/Q/g) ?? []).length, 2, 'two rounded corners');

  // Every x stays between the two node edges, so a connector never doubles back.
  const xs = [...path.matchAll(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0].split(/\s+/)[0]));
  assert(Math.min(...xs) >= 45 && Math.max(...xs) <= 115, `x range ${Math.min(...xs)}..${Math.max(...xs)}`);
});

check('a connector survives nodes that nearly touch', () => {
  const path = linkPath({ source: { cx: 40, cy: 50 }, target: { cx: 52, cy: 90 } });
  assert(!path.includes('NaN'), path);
  assertEqual((path.match(/Q/g) ?? []).length, 2);
});

check('a connector spanning several columns turns just before its target', () => {
  // Three columns apart: the midpoint (x 160) is a column centre where nodes sit.
  const path = linkPath({ source: { cx: 40, cy: 50 }, target: { cx: 280, cy: 170 } });
  const turns = [...path.matchAll(/Q (-?[\d.]+)/g)].map((m) => Number(m[1]));
  assertEqual(turns, [255, 255], `vertical run in the lane before the target: ${path}`);
});

check('no connector runs its vertical through a node', () => {
  // example2 with merged outcomes used to send four connectors through node 53.
  const vertical = /Q (-?[\d.]+) -?[\d.]+ -?[\d.]+ -?[\d.]+/;
  for (const name of ['example1.csv', 'example2.csv']) {
    for (const mergeOutcomes of [false, true]) {
      const diagram = layout(docFromCsv(example(name)), { mergeOutcomes });
      for (const link of diagram.links) {
        const match = linkPath(link).match(vertical);
        if (!match) continue;
        const x = Number(match[1]);
        const top = Math.min(link.source.cy, link.target.cy);
        const bottom = Math.max(link.source.cy, link.target.cy);
        const crossed = diagram.nodes.find((n) => n !== link.source && n !== link.target &&
          Math.abs(n.cx - x) <= NODE_RADIUS && n.cy > top && n.cy < bottom);
        assert(!crossed, `${name}${mergeOutcomes ? ' (merged)' : ''}: ${link.id} runs through node ${crossed && crossed.id}`);
      }
    }
  }
});

// ------------------------------------------------------------------ report

const total = passed + failures.length;
for (const failure of failures) {
  console.error(`FAIL  ${failure.name}\n      ${failure.message}`);
}
console.log(`\n${passed}/${total} checks passed`);
process.exit(failures.length === 0 ? 0 : 1);
