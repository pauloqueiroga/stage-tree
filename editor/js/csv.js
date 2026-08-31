// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// CSV import/export for the seven-column stage-tree format read by tree-from-csv:
//   id, tag, sourceId1, sourceId2, sourceId3, stage, outcome
// The header row carries no meaning (tree-from-csv discards it), but we keep the
// names we read so exporting a file we imported stays recognizable to its author.

export const COLUMN_COUNT = 7;
export const DEFAULT_HEADER = ['id', 'tag', 'sourceId1', 'sourceId2', 'sourceId3', 'stage', 'outcome'];

// parseCsv splits CSV text into rows of fields, handling quoted fields,
// escaped quotes, and both LF and CRLF line endings.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"' && field === '') {
      quoted = true;
      started = true;
    } else if (c === ',') {
      endField();
      started = true;
    } else if (c === '\n') {
      endRow();
    } else if (c === '\r') {
      // swallow; the following \n closes the row
    } else {
      field += c;
      started = true;
    }
  }

  if (started || field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

// docFromCsv builds an editor document from CSV text.
// Values are trimmed: spreadsheet exports routinely carry a stray space after a
// comma (see " inconclusive" in tree-from-csv/example/example1.csv), and carrying
// that whitespace into ids and stage names would silently split stages in two.
export function docFromCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ''));
  if (rows.length === 0) {
    return { header: DEFAULT_HEADER.slice(), nodes: [] };
  }

  const header = rows[0].map((f) => f.trim());
  const nodes = [];
  const problems = [];
  const seen = new Set();

  rows.slice(1).forEach((raw, index) => {
    const lineNumber = index + 2;
    const row = raw.map((f) => f.trim());

    if (row.length !== COLUMN_COUNT) {
      problems.push(`Line ${lineNumber}: expected ${COLUMN_COUNT} columns, found ${row.length}`);
    }

    const id = row[0] ?? '';
    if (id === '') {
      problems.push(`Line ${lineNumber}: missing id, row skipped`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`Line ${lineNumber}: duplicate id "${id}", row skipped`);
      return;
    }
    seen.add(id);

    nodes.push({
      id,
      tag: row[1] ?? '',
      sources: [row[2] ?? '', row[3] ?? '', row[4] ?? ''].filter((s) => s !== ''),
      stage: row[5] ?? '',
      outcome: row[6] ?? '',
    });
  });

  return {
    header: header.length === COLUMN_COUNT ? header : DEFAULT_HEADER.slice(),
    nodes,
    problems,
  };
}

function quoteField(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// csvFromDoc serializes a document back into the seven-column format.
// Node order is preserved, so a file imported and exported untouched comes back
// with its rows in the order its author had them.
export function csvFromDoc(doc) {
  const header = doc.header && doc.header.length === COLUMN_COUNT ? doc.header : DEFAULT_HEADER;
  const lines = [header.map(quoteField).join(',')];

  for (const node of doc.nodes) {
    const sources = [node.sources[0] ?? '', node.sources[1] ?? '', node.sources[2] ?? ''];
    lines.push([node.id, node.tag, ...sources, node.stage, node.outcome].map(quoteField).join(','));
  }

  return lines.join('\n') + '\n';
}
