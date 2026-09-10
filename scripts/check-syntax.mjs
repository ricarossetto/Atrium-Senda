import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TARGET_DIRS = ['lib', 'js', 'collector', 'tests', 'scripts'];
const ROOT_FILES = ['server.mjs'];

function getFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.agents' || entry === 'dist' || entry === 'artifacts' || entry === 'raw' || entry === 'windows') {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = [...ROOT_FILES.map(f => join(ROOT, f))];
for (const dir of TARGET_DIRS) {
  allFiles.push(...getFiles(join(ROOT, dir)));
}

let checked = 0;
let errors = 0;

for (const file of allFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    checked++;
  } catch (err) {
    console.error(`❌ Syntax error in ${file}:`, err.stderr?.toString() || err.message);
    errors++;
  }
}

if (errors > 0) {
  console.error(`Check failed: ${errors} file(s) had syntax errors.`);
  process.exit(1);
} else {
  console.log(`✅ All ${checked} JS/MJS files passed syntax check.`);
}
