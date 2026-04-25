import cp from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });

cp.execSync('bunx --bun tsdown', { cwd: root, stdio: 'inherit' });

fs.cpSync(path.join(import.meta.dirname, 'fill', 'browser.js'), path.join(root, 'dist', 'browser.js'));

console.log('build completed!');