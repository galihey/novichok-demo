import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Script } from 'node:vm';
const core=readFileSync('src/core.js','utf8').replace(/^export /gm,'');
const page=readFileSync('src/index.html','utf8').replace('/* EDITOR_CLIENT */',readFileSync('src/editor-client.js','utf8'));
new Script(page.split('<script>')[1].split('</script>')[0]);
mkdirSync('dist/server',{recursive:true}); mkdirSync('dist/.openai',{recursive:true});
writeFileSync('dist/server/index.js',core+'\nconst page='+JSON.stringify(page)+';\nexport default { fetch(request,env) { return handle(request,env.DB,page,env); } };\n');
writeFileSync('dist/.openai/hosting.json',readFileSync('.openai/hosting.json'));
console.log('Worker собран: dist/server/index.js; миграции: drizzle/');
