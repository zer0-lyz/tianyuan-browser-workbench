"use strict";

const path = require("node:path");
const { createRequire } = require("node:module");

const runtimeRoot = path.dirname(process.execPath);
const runtimeRequire = createRequire(path.join(runtimeRoot, "native_host.js"));
runtimeRequire("./native_host.js");
