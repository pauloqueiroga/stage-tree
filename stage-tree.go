// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Package stage-tree creates and manipulates stage tree diagrams based on provided data.
package stagetree

import (
	"sort"
	"strconv"

	"github.com/pauloqueiroga/godraw"
)

// A Node represents a vertex in the stage tree, plus references to its child nodes.
type Node struct {
	id      string
	tag     string
	stage   string
	nodes   []*Node
	visited bool
	weight  int
	outcome string
}

// newNode returns a new Node with an empty sub-tree of nodes.
func newNode(id, tag, stage string) *Node {
	return &Node{
		id:      id,
		tag:     tag,
		stage:   stage,
		nodes:   make([]*Node, 0),
		visited: false,
	}
}

// AddChild adds the given Node to the subtree of the instance.
func (root *Node) AddChild(child *Node) {
	root.nodes = append(root.nodes, child)
}

func plotStages(graph *godraw.GraphModel, stageDepths map[string]int) error {
	keys := make([]string, 0, len(stageDepths))
	for k := range stageDepths {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	offset := 0

	for _, k := range keys {
		stageOffsets[k] = offset + hSpacing/2 - 5
		width := hSpacing * stageDepths[k]
		shape := godraw.Cell{
			ID:       k,
			Value:    k,
			Style:    stageHeaderStyle(k),
			ParentID: "layer1",
			Vertex:   "1",
			Geometry: &godraw.Geometry{
				X:      offset,
				Y:      0,
				Height: strconv.Itoa(vSpacing),
				Width:  strconv.Itoa(width),
				As:     "geometry",
			},
		}
		graph.Add(&shape)
		offset += width
	}
	return nil
}

func plotTree(graph *godraw.GraphModel, root *Node) error {
	addNodes(root, graph, hSpacing/2-5, vSpacing+5, "")
	return nil
}

func addNodes(root *Node, graph *godraw.GraphModel, x, y int, parent string) (int, int) {
	if root == nil {
		return x, y
	}

	if root.visited {
		return x, y
	}

	root.visited = true
	value := root.tag

	if value == parent {
		value = ""
	}

	if x < stageOffsets[root.stage] {
		x = stageOffsets[root.stage]
	}

	shape := godraw.Cell{
		ID:       root.id,
		ParentID: "layer1",
		Value:    value,
		Style:    eventNodeStyle(root.stage),
		Vertex:   "1",
		Geometry: &godraw.Geometry{
			X:      x,
			Y:      y,
			Width:  "10",
			Height: "10",
			As:     "geometry",
		}}
	graph.Add(&shape)

	x += hSpacing

	for i, n := range root.nodes {
		if i > 0 {
			y += vSpacing
		}
		_, y = addNodes(n, graph, x, y, root.tag)
		addLink(graph, root.id, n.id)
	}

	return x, y
}

func addLink(graph *godraw.GraphModel, sourceId, targetId string) {
	if sourceId == "" || targetId == "" {
		return
	}

	link := godraw.Cell{
		ID:       sourceId + "-" + targetId,
		ParentID: "layer1",
		Style:    linkStyle(),
		Edge:     "1",
		SourceID: sourceId,
		TargetID: targetId,
		Geometry: &godraw.Geometry{
			Relative: "1",
			As:       "geometry",
		},
	}
	graph.Add(&link)
}
