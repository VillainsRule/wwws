import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');

await Promise.all(['cjs', 'esm'].map(async (format) => await esbuild.build({
    entryPoints: [path.join(root, 'src', 'index.js')],
    outfile: path.join(root, 'dist', 'index.' + (format === 'cjs' ? 'cjs' : 'mjs')),
    bundle: true,
    minify: false,
    keepNames: true,
    platform: 'node',
    format
})));

fs.cpSync(path.join(import.meta.dirname, 'fill', 'browser.js'), path.join(root, 'dist', 'browser.js'));

console.log('build completed!');