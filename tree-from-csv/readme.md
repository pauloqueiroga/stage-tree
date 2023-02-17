# tree-from-csv

Creates stage-tree diagrams in Drawio (mxGraph) format from a Comma-Separated Values (CSV) file. 

Usage:

```bash
tree-from-csv example/example1.csv example/example1.drawio
```

The example folder carries examples of input CSV files and the corresponding outputs from the tree-from-csv CLI tool.

## What if my CSV has a slightly different structure of columns?

I thought about adding the capability of filtering or configuring the input of tree-from-csv, but it turned out to be easier to change my spreadsheet instead. For example, in Google Sheets, I created new sheet to my file and added the following content on the cell A1:

```plain
={'Sheet 1'!A:A,'Sheet 1'!C:C,'Sheet 1'!E:H,'Sheet 1'!J:J}
```

 In this example, the original sheet is named 'Sheet 1', and I'm selecting columns A, C, E, F, G, H and J to show up in the new sheet.

After that, all I need to do is download a CSV of this specific sheet, which will always contain the right columns in the right order, with updated information, no configuring or massaging needed.
