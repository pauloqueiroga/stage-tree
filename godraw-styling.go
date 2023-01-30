// Copyright 2023 by Paulo Queiroga. All rights reserved.
// Use of this source code is governed by the license that can be found in the LICENSE file.
package stagetree

import "github.com/pauloqueiroga/godraw"

const (
	hSpacing = 80
	vSpacing = 40
)

var (
	stageColors  map[string]map[string]string = make(map[string]map[string]string)
	stageOffsets map[string]int               = make(map[string]int)
)

func getColorStyle(index int) map[string]string {
	var styleColors = []map[string]string{
		{"strokeColor": "#2D7600", "fillColor": "#60A917"},
		{"strokeColor": "#001DBC", "fillColor": "#0050ef"},
		{"strokeColor": "#A50040", "fillColor": "#d80073"},
		{"strokeColor": "#3700CC", "fillColor": "#6a00ff"},
		{"strokeColor": "#6F0000", "fillColor": "#a20025"},
		{"strokeColor": "#006EAF", "fillColor": "#1ba1e2"},
		{"strokeColor": "#005700", "fillColor": "#008a00"},
		{"strokeColor": "#BD7000", "fillColor": "#f0a30a"},
		{"strokeColor": "#3A5431", "fillColor": "#6d8764"},
		{"strokeColor": "#36393d", "fillColor": "#ffff88"},
	}
	return styleColors[index%len(styleColors)]
}

func eventNodeStyle(stage string) godraw.Style {
	s := godraw.Style{
		Attributes: map[string]string{
			"ellipse":               "",
			"aspect":                "fixed",
			"html":                  "1",
			"labelPosition":         "center",
			"verticalLabelPosition": "bottom",
			"align":                 "center",
			"verticalAlign":         "top",
			"fontColor":             "#000000",
		},
	}

	if _, ok := stageColors[stage]; !ok {
		stageColors[stage] = getColorStyle(len(stageColors))
	}

	for k, v := range stageColors[stage] {
		s.Attributes[k] = v
	}

	return s
}

func linkStyle() godraw.Style {
	return godraw.Style{
		Attributes: map[string]string{
			"edgeStyle":      "entityRelationEdgeStyle",
			"orthogonalLoop": "1",
			"jettySize":      "auto",
			"html":           "1",
			"strokeWidth":    "1",
		},
	}
}

func stageHeaderStyle(stage string) godraw.Style {
	s := godraw.Style{
		Attributes: map[string]string{
			"html":       "1",
			"whiteSpace": "wrap",
			"fontColor":  "#ffffff",
		},
	}

	if _, ok := stageColors[stage]; !ok {
		stageColors[stage] = getColorStyle(len(stageColors))
	}

	for k, v := range stageColors[stage] {
		s.Attributes[k] = v
	}

	return s
}
