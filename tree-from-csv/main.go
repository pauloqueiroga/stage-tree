// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.

// Command-Line Interface (CLI) for creating a new stage tree diagram with data from a Comma-Separated-Values (CSV) file.
package main

import (
	"encoding/csv"
	"encoding/xml"
	"errors"
	"io"
	"log"
	"os"

	"github.com/pauloqueiroga/godraw"
	st "github.com/pauloqueiroga/stage-tree"
)

type event struct {
	source1  string
	source2  string
	source3  string
	outcome  string
	treeNode *st.Node
}

func main() {
	if len(os.Args) < 3 {
		log.Fatal("Usage: tree-from-csv <path/to/input-file.csv> <path/to/output-file.drawio>")
	}

	events, err := readEvents(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}

	tree, err := makeTree(events)
	if err != nil {
		log.Fatal(err)
	}

	graph := godraw.NewGraph("layer1")

	if err = st.PlotStages(&graph, tree); err != nil {
		log.Fatal(err)
	}

	if err = st.PlotTree(&graph, tree); err != nil {
		log.Fatal(err)
	}

	outputFile, err := os.Create(os.Args[2])
	if err != nil {
		log.Fatal(err)
	}
	defer outputFile.Close()

	encoder := xml.NewEncoder(outputFile)
	encoder.Indent("", "\t")
	if err := encoder.Encode(graph); err != nil {
		log.Fatal(err)
	}
}

// readEvents reads a CSV file from the given filePath.
// The CSV is expected to have a header line (to be discarded) and the following format:
// id, tag, sourceId1, sourceId2, sourceId3, stage, outcome
func readEvents(filePath string) (map[string]event, error) {
	result := make(map[string]event)
	inputFile, err := os.Open(filePath)
	if err != nil {
		return result, err
	}
	defer inputFile.Close()

	reader := csv.NewReader(inputFile)
	reader.FieldsPerRecord = 7
	// discard the header row
	_, err = reader.Read()
	if err == io.EOF {
		return result, nil
	}
	if err != nil {
		return result, err
	}

	for {
		row, err := reader.Read()

		if err == io.EOF {
			break
		}
		if err != nil {
			return result, err
		}

		e := event{
			source1:  row[2],
			source2:  row[3],
			source3:  row[4],
			outcome:  row[6],
			treeNode: st.NewNode(row[0], row[1], row[5]),
		}
		result[row[0]] = e

		if e.outcome != "" {
			oid := row[0] + e.outcome
			o := event{
				source1:  row[0],
				treeNode: st.NewNode(oid, e.outcome, "outcome"),
			}
			result[oid] = o
		}
	}

	return result, nil
}

func makeTree(events map[string]event) (*st.Node, error) {
	var root *st.Node = nil

	for id, event := range events {
		if id == "0" {
			root = event.treeNode
		}

		if event.source1 != "" {
			if source, ok := events[event.source1]; ok {
				source.treeNode.AddChild(event.treeNode)
			} else {
				return root, errors.New("Source not found " + event.source1)
			}
		}

		if event.source2 != "" {
			if source, ok := events[event.source2]; ok {
				source.treeNode.AddChild(event.treeNode)
			} else {
				return root, errors.New("Source not found " + event.source2)
			}
		}

		if event.source3 != "" {
			if source, ok := events[event.source3]; ok {
				source.treeNode.AddChild(event.treeNode)
			} else {
				return root, errors.New("Source not found " + event.source3)
			}
		}
	}

	return root, nil
}
