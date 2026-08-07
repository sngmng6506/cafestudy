import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const roots = ['src', 'client/src', 'scripts', 'test'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage']);

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...collectJavaScriptFiles(fullPath));
    else if (entry.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

const files = roots.flatMap((root) => collectJavaScriptFiles(root));
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\n[syntax error] ${file}\n`);
    process.stderr.write(result.stderr);
  }
}

if (failed) process.exit(1);
console.log(`JavaScript syntax check passed for ${files.length} files.`);
