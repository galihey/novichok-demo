import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../scripts/database.mjs';
import { handle } from '../src/core.js';
test('Редактор: отключение на сервере, сохранение, конфликт вкладок и запрет эмодзи',async()=>{
  const db=openDatabase(':memory:');
  const call=async(body,enabled='true')=>{
    const response=await handle(new Request('https://demo.test/api/content',body===undefined?{}:{method:'POST',headers:{'content-type':'application/json',origin:'https://demo.test'},body:JSON.stringify(body)}),db,'',{ENABLE_TEXT_EDITING:enabled});
    return {status:response.status,data:await response.json()};
  };
  try{
    assert.deepEqual((await call()).data,{values:{},revision:0,editable:true});
    const body={values:{'Заголовок':'Новый заголовок'},revision:0};
    assert.equal((await call(body,'false')).status,403);
    assert.equal((await call(body)).status,200);
    assert.equal((await call(body)).status,409);
    assert.deepEqual((await call(undefined,'false')).data,{values:body.values,revision:1,editable:false});
    assert.equal((await call({values:{'Заголовок':'🙂'},revision:1})).status,400);
    assert.equal((await call({values:{'Заголовок':''},revision:1})).status,400);
    assert.equal((await call({values:{'Заголовок':'<b>Обычный текст</b>'},revision:1})).status,200);
    const content=await db.prepare('SELECT * FROM site_copy WHERE id=1').first();
    assert.equal(content.revision,2);
    assert.equal(JSON.parse(content.content)['Заголовок'],'<b>Обычный текст</b>');
    // Resetting survey demo data must preserve authored interface copy.
    const response=await handle(new Request('https://demo.test/api/demo/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:'reset-demo'})}),db,'');
    assert.equal(response.status,200);assert.equal((await call()).data.revision,2);
  }finally{db.close()}
});
