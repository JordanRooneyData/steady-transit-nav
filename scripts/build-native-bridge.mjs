import {build} from 'esbuild';
await build({entryPoints:['native/bridge.mjs'],bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:'public/native-runtime.js',minify:true,sourcemap:false});
console.log('Built native bridge.');
