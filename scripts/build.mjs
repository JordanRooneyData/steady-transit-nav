import fs from 'node:fs';
import path from 'node:path';
const assets={};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())visit(p);else assets['/'+path.relative('public',p).replaceAll('\\','/')]={body:fs.readFileSync(p).toString('base64'),type:mime[path.extname(p)]||'text/plain; charset=utf-8'};}}
visit('public');fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
await (await import('esbuild')).build({stdin:{contents:'const ASSETS='+JSON.stringify(assets)+';\n'+fs.readFileSync('server/worker.mjs','utf8'),resolveDir:path.resolve('server'),sourcefile:'worker.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js'});
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
console.log(`Built Worker with ${Object.keys(assets).length} assets.`);

fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
