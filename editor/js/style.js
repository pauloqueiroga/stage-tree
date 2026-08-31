// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Visual constants, ported from godraw-styling.go so the editor renders the same
// palette and geometry that tree-from-csv produces in Drawio/SVG.

// Same ten color pairs, in the same order, as getColorStyle in godraw-styling.go.
export const STAGE_COLORS = [
  { strokeColor: '#2D7600', fillColor: '#60A917' },
  { strokeColor: '#001DBC', fillColor: '#0050ef' },
  { strokeColor: '#A50040', fillColor: '#d80073' },
  { strokeColor: '#3700CC', fillColor: '#6a00ff' },
  { strokeColor: '#6F0000', fillColor: '#a20025' },
  { strokeColor: '#006EAF', fillColor: '#1ba1e2' },
  { strokeColor: '#005700', fillColor: '#008a00' },
  { strokeColor: '#BD7000', fillColor: '#f0a30a' },
  { strokeColor: '#3A5431', fillColor: '#6d8764' },
  { strokeColor: '#36393d', fillColor: '#ffff88' },
];

// Layout spacing, matching hSpacing/vSpacing in stage-tree.go.
export const H_SPACING = 80;
export const V_SPACING = 40;

// Node shapes are 10x10 ellipses in the Drawio output, i.e. radius 5.
export const NODE_RADIUS = 5;

// stageColor returns the color pair assigned to the stage at the given index.
// PlotStages walks stages in sorted order, so a stage's color is decided by its
// position in that sorted list.
export function stageColor(index) {
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

// Stage header text is white on the stage fill; node labels are black below the node.
export const HEADER_FONT_COLOR = '#ffffff';
export const NODE_FONT_COLOR = '#000000';
export const FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const FONT_SIZE = 12;
