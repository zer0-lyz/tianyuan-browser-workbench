"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "TW-test-"));
function ps(code, env = {}) {
  const encoded = Buffer.from(code, "utf16le").toString("base64");
  return spawnSync("powershell.exe", ["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-EncodedCommand",encoded], {
    env:{...process.env,...env},encoding:"utf8",timeout:60000,windowsHide:true
  });
}
function quote(value) {return "'" + value.replace(/'/g,"''") + "'";}
function parse(file) {
  return ps("$t=$null;$e=$null;[Management.Automation.Language.Parser]::ParseFile(" + quote(file) + ",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{$_.Message};exit 1}");
}
test("actual Windows PowerShell parses all generated launchers", {skip:process.platform!=="win32"}, () => {
  const stage = path.join(temp,"launchers");
  const generated = spawnSync(process.execPath,[path.join(root,"scripts","prepare-windows-launchers.mjs"),path.join(root,"release","windows-x64"),stage],{encoding:"utf8"});
  assert.equal(generated.status,0,generated.stderr);
  for(const name of ["install.ps1","安装.ps1","uninstall.ps1"]) {
    const result=parse(path.join(stage,name));
    assert.equal(result.status,0,result.stdout+result.stderr);
  }
  const builder=parse(path.join(root,"release","build_windows_x64_candidate.ps1"));
  assert.equal(builder.status,0,builder.stdout+builder.stderr);
});
test("dependency probe reports missing requests without NativeCommandError", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_MISSING_PYTHON}, () => {
  const file=path.join(root,"release","windows-x64","install.ps1");
  const code="$t=$null;$e=$null;$a=[Management.Automation.Language.Parser]::ParseFile("+quote(file)+",[ref]$t,[ref]$e);$f=$a.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-PythonDependencies'},$true);Invoke-Expression $f.Extent.Text;$r=Test-PythonDependencies "+quote(process.env.TIANYUAN_TEST_MISSING_PYTHON)+";$r|ConvertTo-Json -Compress";
  const result=ps(code);
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout.trim());
  assert.equal(report.ok,false);
  assert.ok(report.missing.includes("requests"),result.stdout);
});
test("verified complete package preflight succeeds without installation", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_FULL_STAGE}, () => {
  const stage=process.env.TIANYUAN_TEST_FULL_STAGE;
  const install=path.join(temp,"first install 中文");
  const result=ps("& "+quote(path.join(stage,"install-agent.cmd"))+";exit $LASTEXITCODE",{
    TIANYUAN_INSTALL_ROOT:install,TIANYUAN_PREFLIGHT_ONLY:"1",TIANYUAN_UPDATE_MODE:""
  });
  assert.equal(result.status,0,result.stdout+result.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(install,"预检结果.json"),"utf8").replace(/^\uFEFF/,""));
  assert.equal(report.status,"validated");
  assert.equal(report.installed,false);
  assert.equal(report.pythonDependencies,"ok");
  assert.equal(fs.existsSync(path.join(install,"native-helper")),false);
});
test("lite agent entry rejects fresh PC even if system Python/CLI exist", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_LITE_STAGE}, () => {
  const stage=process.env.TIANYUAN_TEST_LITE_STAGE;
  const install=path.join(temp,"empty-lite");
  const result=ps("& "+quote(path.join(stage,"install-agent.cmd"))+";exit $LASTEXITCODE",{
    TIANYUAN_INSTALL_ROOT:install,TIANYUAN_PREFLIGHT_ONLY:"",TIANYUAN_UPDATE_MODE:""
  });
  assert.equal(result.status,20,result.stdout+result.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(install,"安装检查结果.json"),"utf8").replace(/^\uFEFF/,""));
  assert.equal(report.status,"failed");
  assert.match(report.error,/LITE_REQUIRES_FULL_INSTALL/);
  assert.equal(report.failedStep,"1/7 校验核心文件");
  assert.equal(fs.existsSync(path.join(install,"native-helper")),false);
});
test("invalid explicit install root does not silently overwrite default installation", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_LITE_STAGE}, () => {
  const install=path.join(temp,"file-not-directory");
  fs.writeFileSync(install,"sentinel");
  const result=ps("& "+quote(path.join(process.env.TIANYUAN_TEST_LITE_STAGE,"install-agent.cmd"))+";exit $LASTEXITCODE",{
    TIANYUAN_INSTALL_ROOT:install,TIANYUAN_PREFLIGHT_ONLY:"",TIANYUAN_UPDATE_MODE:""
  });
  assert.equal(result.status,50,result.stdout+result.stderr);
  assert.match(result.stdout,/INSTALL_ROOT_UNAVAILABLE/);
  assert.equal(fs.readFileSync(install,"utf8"),"sentinel");
});
test("isolated portable Python imports sibling land runner and supports --help", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_FULL_STAGE}, () => {
  const stage=process.env.TIANYUAN_TEST_FULL_STAGE;
  const python=path.join(stage,"runtime","python-portable","python.exe");
  const runner=path.join(stage,"skills","zj-land-publicity","land_publicity_runner.py");
  const result=spawnSync(python,[runner,"--help"],{encoding:"utf8",timeout:15000,windowsHide:true,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8"}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/--request-json/);
  const isolation=spawnSync(python,["-c","import sys;assert sys.flags.isolated == 1;print('isolated=1')"],{encoding:"utf8",timeout:15000,windowsHide:true});
  assert.equal(isolation.status,0,isolation.stderr);
});
test("lite entry can preflight the existing managed environment without modifying it", {skip:process.platform!=="win32"||!process.env.TIANYUAN_TEST_LITE_STAGE||!process.env.TIANYUAN_TEST_EXISTING_ROOT}, () => {
  const installed = process.env.TIANYUAN_TEST_EXISTING_ROOT;
  const config=path.join(installed,"projects","天源评估系统","extension","version.json");
  const before=fs.readFileSync(config);
  const result=ps("& "+quote(path.join(process.env.TIANYUAN_TEST_LITE_STAGE,"install-agent.cmd"))+";exit $LASTEXITCODE",{
    TIANYUAN_INSTALL_ROOT:installed,TIANYUAN_PREFLIGHT_ONLY:"1",TIANYUAN_UPDATE_MODE:""
  });
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.deepEqual(fs.readFileSync(config),before);
});
