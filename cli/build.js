import esbuild from 'esbuild';
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

console.log('build completed!');