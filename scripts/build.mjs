import {build} from 'esbuild';
import {mkdir, copyFile, cp, rm} from 'node:fs/promises';
await rm('dist', {recursive:true, force:true});
await mkdir('dist', {recursive:true});
await build({entryPoints:['apps/workspace/app.js'],bundle:true,outfile:'dist/app.js',format:'esm',target:'es2022',minify:true});
await Promise.all([
  copyFile('apps/workspace/index.html','dist/index.html'),
  copyFile('apps/workspace/styles.css','dist/styles.css'),
  cp('apps/workspace/assets','dist/assets',{recursive:true,filter:source=>!source.endsWith('.md')})
]);
console.log('Built the Anti Fund HQ workspace.');
