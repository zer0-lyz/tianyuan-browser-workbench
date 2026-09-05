"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const moduleRoot = path.join(repoRoot, "extension", "src", "modules", "table-format");
const nativeHost = fs.readFileSync(path.join(repoRoot, "native-helper", "native_host.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "scripts", "install-local-runtime.mjs"), "utf8");
const html = fs.readFileSync(path.join(repoRoot, "extension", "src", "sidepanel", "index.html"), "utf8");
const sidepanel = fs.readFileSync(path.join(repoRoot, "extension", "src", "sidepanel", "sidepanel.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(moduleRoot, "module.js"), "utf8");
const templateSource = fs.readFileSync(path.join(moduleRoot, "template.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(moduleRoot, "styles.css"), "utf8");
const scriptPath = path.join(repoRoot, "skills", "table-format", "scripts", "format_word_tables.py");

test("table format module is wired into the extension and native helper", () => {
  assert.match(html, /id="openTableFormat"/);
  assert.match(html, /id="page-table-format"/);
  assert.match(sidepanel, /tableFormatModule/);
  assert.match(moduleSource, /messageNamespace: "table-format"/);
  assert.match(moduleSource, /run_table_format/);
  assert.match(nativeHost, /select_table_format_word_files/);
  assert.match(nativeHost, /select_table_format_output_directory/);
  assert.match(nativeHost, /run_table_format/);
  assert.match(installer, /src\/modules\/table-format\/module\.js/);
  assert.match(installer, /table-format\/scripts\/format_word_tables\.py/);
  assert.match(templateSource, /table-format-preset-panel/);
  assert.match(templateSource, /table-format-mode-row/);
  assert.match(templateSource, /table-format-run-footer/);
  assert.match(stylesSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)/);
  assert.match(stylesSource, /max-width: 460px/);
});

test("format_word_tables.py applies the requested OOXML preset", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-table-format-"));
  const inputPath = path.join(temporaryRoot, "测试表格.docx");
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const createScript = String.raw`
from docx import Document
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
from pathlib import Path
document = Document()
table = document.add_table(rows=2, cols=2)
table.cell(0, 0).text = "项目"
table.cell(0, 1).text = "金额"
table.cell(1, 0).text = "主营业务"
table.cell(1, 1).text = "109,579.16"
nested = table.cell(1, 0).add_table(rows=1, cols=1)
nested.cell(0, 0).text = "嵌套表格"
document.save(r"${inputPath.replace(/\\/g, "\\\\")}")
source = Path(r"${inputPath.replace(/\\/g, "\\\\")}")
temporary = source.with_suffix(".repair-test.docx")
with ZipFile(source, "r") as zin, ZipFile(temporary, "w", ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        data = zin.read(info.filename)
        if info.filename == "word/_rels/document.xml.rels":
            root = etree.fromstring(data)
            etree.SubElement(root, "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship", Id="rId999", Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", Target="../NULL")
            data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
        zout.writestr(info, data)
temporary.replace(source)
`;
  const createResult = childProcess.spawnSync(python, ["-c", createScript], { encoding: "utf8" });
  assert.equal(createResult.status, 0, createResult.stderr);
  const result = childProcess.spawnSync(python, [scriptPath, inputPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"event": "saved"/);
  assert.match(result.stdout, /"repairedRelationships": 1/);

  const inspectScript = String.raw`
import re, sys, zipfile
with zipfile.ZipFile(sys.argv[1], "r") as archive:
    xml = archive.read("word/document.xml").decode("utf-8")
checks = [
    r'w:tblW[^>]*w:w="5000"[^>]*w:type="pct"|w:tblW[^>]*w:type="pct"[^>]*w:w="5000"',
    r'w:tblHeader',
    r'w:trHeight[^>]+w:val="340"',
    r'w:hRule="atLeast"',
    r'w:top[^>]+w:sz="12"',
    r'w:bottom[^>]+w:sz="12"',
    r'w:insideH[^>]+w:sz="4"',
    r'w:insideV[^>]+w:sz="4"',
    r'w:left[^>]+w:val="nil"',
    r'w:right[^>]+w:val="nil"',
    r'w:eastAsia="宋体"',
    r'w:ascii="Times New Roman"',
]
for pattern in checks:
    assert re.search(pattern, xml), pattern
`;
  const inspectResult = childProcess.spawnSync(python, ["-c", inspectScript, inputPath], { encoding: "utf8" });
  assert.equal(inspectResult.status, 0, inspectResult.stderr || inspectResult.stdout);

  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

test("format_word_tables.py preserves merged cells and detects a two-row header", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tianyuan-table-format-merged-"));
  const inputPath = path.join(temporaryRoot, "合并表格.docx");
  const python = process.env.TIANYUAN_PYTHON_BIN || "python3";
  const createScript = String.raw`
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT

document = Document()
table = document.add_table(rows=4, cols=4)
table.cell(0, 0).merge(table.cell(0, 1)).text = "基本信息"
table.cell(0, 2).merge(table.cell(0, 3)).text = "金额信息"
for column, value in enumerate(("项目名称", "项目编号", "账面金额", "评估金额")):
    table.cell(1, column).text = value
table.cell(2, 0).text = "非常长期的资产项目名称"
table.cell(2, 1).text = "A-001"
table.cell(2, 2).text = "123456.78"
table.cell(2, 3).text = "120000.00"
table.cell(2, 0).merge(table.cell(3, 0))
table.cell(3, 1).text = "A-002"
table.cell(3, 2).text = "987654.32"
table.cell(3, 3).text = "980000.00"
metadata = document.add_table(rows=4, cols=6)
metadata.cell(0, 0).merge(metadata.cell(0, 1)).text = "建筑物名称"
metadata.cell(0, 2).merge(metadata.cell(0, 3)).text = "电解、整流变厂房"
metadata.cell(0, 4).text = "总层数"
metadata.cell(0, 5).text = "5"
metadata.cell(1, 0).merge(metadata.cell(1, 1)).text = "建成年月"
metadata.cell(1, 2).merge(metadata.cell(1, 3)).text = "2020年5月"
metadata.cell(1, 4).text = "结构"
metadata.cell(1, 5).text = "钢混"
for column, value in enumerate(("项目", "名称", "金额", "数量", "状态", "备注")):
    metadata.cell(2, column).text = value
for column, value in enumerate(("设备", "A-003", "12.00", "2", "正常", "保留")):
    metadata.cell(3, column).text = value
serial_table = document.add_table(rows=3, cols=3)
for column, value in enumerate(("序号", "项目名称", "备注")):
    serial_table.cell(0, column).text = value
for row, values in enumerate((("1", "勘察设计费", "0.00"), ("2", "招标代理服务费", "政府补助")), start=1):
    for column, value in enumerate(values):
        serial_table.cell(row, column).text = value
identifier_table = document.add_table(rows=3, cols=3)
for column, value in enumerate(("序号", "编号", "名称")):
    identifier_table.cell(0, column).text = value
for row, values in enumerate((("1", "A-2026-0001", "一号设备"), ("2", "B-2026-002", "二号设备")), start=1):
    for column, value in enumerate(values):
        identifier_table.cell(row, column).text = value
numeric_table = document.add_table(rows=2, cols=7)
for column, value in enumerate(("项目", "2026年", "2027年", "2028年", "2029年", "2030年", "稳定年度")):
    numeric_table.cell(0, column).text = value
for column, value in enumerate(("自由现金流量", "-30,516.62", "9,941.42", "24,581.71", "34,821.56", "37,692.67", "27,442.84")):
    numeric_table.cell(1, column).text = value
document.save(r"${inputPath.replace(/\\/g, "\\\\")}")
`;
  const createResult = childProcess.spawnSync(python, ["-c", createScript], { encoding: "utf8" });
  assert.equal(createResult.status, 0, createResult.stderr);

  const result = childProcess.spawnSync(python, [scriptPath, inputPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"event": "saved"/);

  const inspectScript = String.raw`
import sys, zipfile
from lxml import etree

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
with zipfile.ZipFile(sys.argv[1], "r") as archive:
    root = etree.fromstring(archive.read("word/document.xml"))
table = root.xpath("//w:tbl", namespaces=NS)[0]
grid_columns = table.xpath("./w:tblGrid/w:gridCol", namespaces=NS)
grid_widths = [int(column.get("{" + NS["w"] + "}w")) for column in grid_columns]
assert len(grid_widths) == 4, grid_widths
assert len(set(grid_widths)) >= 2, grid_widths
assert table.xpath("./w:tblPr/w:tblLayout[@w:type='fixed']", namespaces=NS)
assert len(table.xpath("./w:tr[1]/w:trPr/w:tblHeader", namespaces=NS)) == 1
assert len(table.xpath("./w:tr[2]/w:trPr/w:tblHeader", namespaces=NS)) == 1
assert table.xpath(".//w:gridSpan[@w:val='2']", namespaces=NS)
assert table.xpath(".//w:vMerge", namespaces=NS)
merged_width = table.xpath("./w:tr[1]/w:tc[1]/w:tcPr/w:tcW", namespaces=NS)[0]
assert int(merged_width.get("{" + NS["w"] + "}w")) == sum(grid_widths[:2])
def edge(cell, name):
    borders = cell.xpath("./w:tcPr/w:tcBorders", namespaces=NS)[0]
    return borders.xpath("./w:" + name, namespaces=NS)[0]
first_cell = table.xpath("./w:tr[1]/w:tc[1]", namespaces=NS)[0]
assert edge(first_cell, "top").get("{" + NS["w"] + "}sz") == "12"
assert edge(first_cell, "bottom").get("{" + NS["w"] + "}sz") == "4"
assert edge(first_cell, "left").get("{" + NS["w"] + "}val") == "nil"
assert edge(first_cell, "right").get("{" + NS["w"] + "}sz") == "4"
metadata = root.xpath("//w:tbl", namespaces=NS)[1]
assert not metadata.xpath("./w:tr[1]/w:trPr/w:tblHeader", namespaces=NS)
assert not metadata.xpath("./w:tr[2]/w:trPr/w:tblHeader", namespaces=NS)
assert metadata.xpath("./w:tr[3]/w:trPr/w:tblHeader", namespaces=NS)
serial_table = root.xpath("//w:tbl", namespaces=NS)[2]
serial_cell = serial_table.xpath("./w:tr[2]/w:tc[1]", namespaces=NS)[0]
assert serial_cell.xpath(".//w:jc[@w:val='center']", namespaces=NS)
assert serial_cell.xpath("./w:tcPr/w:vAlign[@w:val='center']", namespaces=NS)
assert serial_cell.xpath("./w:tcPr/w:noWrap", namespaces=NS)
assert not serial_table.xpath("./w:tr[2]/w:tc[3]//w:t", namespaces=NS)
assert serial_table.xpath("./w:tr[3]/w:tc[3]//w:t[text()='政府补助']", namespaces=NS)
identifier_table = root.xpath("//w:tbl", namespaces=NS)[3]
identifier_grid = [int(column.get("{" + NS["w"] + "}w")) for column in identifier_table.xpath("./w:tblGrid/w:gridCol", namespaces=NS)]
assert identifier_grid[0] < identifier_grid[1], identifier_grid
assert identifier_table.xpath("./w:tr[2]/w:tc[2]/w:tcPr/w:noWrap", namespaces=NS)
assert identifier_table.xpath("./w:tr[3]/w:tc[2]/w:tcPr/w:noWrap", namespaces=NS)
numeric_table = root.xpath("//w:tbl", namespaces=NS)[4]
numeric_cells = numeric_table.xpath("./w:tr[2]/w:tc[position()>1]", namespaces=NS)
assert all(cell.xpath("./w:tcPr/w:noWrap", namespaces=NS) for cell in numeric_cells)
assert all(not cell.xpath("./w:tcPr/w:tcFitText", namespaces=NS) for cell in numeric_cells)
assert all(cell.xpath(".//w:pPr/w:jc[@w:val='right']", namespaces=NS) for cell in numeric_cells)
`;
  const inspectResult = childProcess.spawnSync(python, ["-c", inspectScript, inputPath], { encoding: "utf8" });
  assert.equal(inspectResult.status, 0, inspectResult.stderr || inspectResult.stdout);

  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
