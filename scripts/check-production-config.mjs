#!/usr/bin/env node
import { validateProductionConfig } from "../src/lib/production-config.mjs";

const errors = validateProductionConfig();
console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
if (errors.length) process.exitCode = 1;
