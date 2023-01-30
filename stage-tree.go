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
	Id      string
	Tag     string
	Stage   string
	Nodes   []*Node
	visited bool
}

// NewNode returns a new Node with an empty sub-tree of nodes.
func NewNode(id, tag, stage string) *Node {
	return &Node{
		Id:      id,
		Tag:     tag,
		Stage:   stage,
		Nodes:   make([]*Node, 0),
		visited: false,
	}
}

// AddChild adds the given Node to the subtree of the instance.
func (root *Node) AddChild(child *Node) {
	root.Nodes = append(root.Nodes, child)
}

func PlotStages(graph *godraw.GraphModel, rootNode *Node) error {
	maxDepth := make(map[string]int)
	probeDepth(rootNode, "", 0, maxDepth)

	keys := make([]string, 0, len(maxDepth))
	for k := range maxDepth {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	offset := 0

	for _, k := range keys {
		stageOffsets[k] = offset + hSpacing/2 - 5
		width := hSpacing * maxDepth[k]
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

func PlotTree(graph *godraw.GraphModel, root *Node) error {
	addNodes(root, graph, hSpacing/2-5, vSpacing+5, "")
	return nil
}

func probeDepth(root *Node, currentStage string, stageDepth int, maxDepth map[string]int) {
	if root == nil {
		return
	}

	if currentStage == root.Stage {
		stageDepth++
	} else {
		stageDepth = 1
	}

	if maxDepth[root.Stage] < stageDepth {
		maxDepth[root.Stage] = stageDepth
	}

	for _, n := range root.Nodes {
		probeDepth(n, root.Stage, stageDepth, maxDepth)
	}
}

func addNodes(root *Node, graph *godraw.GraphModel, x, y int, parent string) (int, int) {
	if root == nil {
		return x, y
	}

	if root.visited {
		return x, y
	}

	root.visited = true
	value := root.Tag

	if value == parent {
		value = ""
	}

	if x < stageOffsets[root.Stage] {
		x = stageOffsets[root.Stage]
	}

	shape := godraw.Cell{
		ID:       root.Id,
		ParentID: "layer1",
		Value:    value,
		Style:    eventNodeStyle(root.Stage),
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

	for i, n := range root.Nodes {
		if i > 0 {
			y += vSpacing
		}
		_, y = addNodes(n, graph, x, y, root.Tag)
		addLink(graph, root.Id, n.Id)
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
