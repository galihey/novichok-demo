import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './database.mjs';
import { handle } from '../src/core.js';
mkdirSync('data',{recursive:true});
const db=openDatabase(process.env.DEMO_DB || resolve('data/demo.sqlite'));
const port=Number(process.env.PORT || 4173);
const server=createServer(async (req,res)=>{
  try {
    const chunks=[]; let size=0;
    for await (const chunk of req) { size+=chunk.length; if(size>400000) { res.writeHead(413); res.end('Too large'); return; } chunks.push(chunk); }
    const request=new Request(`http://127.0.0.1:${port}${req.url}`,{ method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}) });
    const page=readFileSync(new URL('../src/index.html',import.meta.url),'utf8').replace('/* EDITOR_CLIENT */',readFileSync(new URL('../src/editor-client.js',import.meta.url),'utf8'));
    const response=await handle(request,db,page,{ENABLE_TEXT_EDITING:process.env.ENABLE_TEXT_EDITING});
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Server error'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Новичок: http://127.0.0.1:${port}`));
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0);}));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
