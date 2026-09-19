#!/usr/bin/env node
import { computeRuntimeBuildId } from "./runtime-fingerprint.mjs";

// 构建脚本的极小封装：接收仓库根路径，打印运行指纹（runtimeBuildId）。
process.stdout.write(computeRuntimeBuildId(process.argv[2] ?? process.cwd()));
