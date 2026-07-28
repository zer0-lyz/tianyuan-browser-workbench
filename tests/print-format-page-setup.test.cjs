"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const declarationScript = path.join(
  repoRoot,
  "skills",
  "appraisal-declaration-print-format",
  "scripts",
  "adjust_appraisal_declaration_print.py",
);
const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
const code = [
  "import importlib.util, json, sys, tempfile, zipfile",
  "from pathlib import Path",
  "from xml.etree import ElementTree as ET",
  "from openpyxl import Workbook",
  "script = Path(sys.argv[1])",
  "spec = importlib.util.spec_from_file_location('declaration_print', script)",
  "module = importlib.util.module_from_spec(spec)",
  "spec.loader.exec_module(module)",
  "with tempfile.TemporaryDirectory() as temp_dir:",
  "    target = Path(temp_dir) / 'fit-columns.xlsx'",
  "    workbook = Workbook()",
  "    sheet = workbook.active",
  "    sheet['A1'] = '测试'",
  "    module.enforce_fit_all_columns(sheet)",
  "    workbook.save(target)",
  "    with zipfile.ZipFile(target, 'r') as archive:",
  "        root = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))",
  "    namespace = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}",
  "    properties = root.find('m:sheetPr/m:pageSetUpPr', namespace)",
  "    setup = root.find('m:pageSetup', namespace)",
  "    print(json.dumps({",
  "        'fitToPage': properties.attrib.get('fitToPage'),",
  "        'autoPageBreaks': properties.attrib.get('autoPageBreaks'),",
  "        'fitToWidth': setup.attrib.get('fitToWidth'),",
  "        'fitToHeight': setup.attrib.get('fitToHeight'),",
  "        'scale': setup.attrib.get('scale'),",
  "    }))",
].join("\n");

const result = spawnSync(python, ["-c", code, declarationScript], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const setup = JSON.parse(result.stdout.trim());
assert.deepEqual(setup, {
  fitToPage: "1",
  autoPageBreaks: "0",
  fitToWidth: "1",
  fitToHeight: "0",
  scale: null,
});

console.log("Print format page setup tests passed.");
