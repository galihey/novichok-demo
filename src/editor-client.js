const editorPage=location.pathname==='/editor';
// Injected into the page at build/local serve time. Only UI copy is editable.
const copyEditor={values:{},draft:{},revision:0,enabled:false,active:false,dirty:false};
function applyCopy(){
  const excluded='svg,script,style,input,textarea,select,option,.brand-icon,.profile,.avatar,.terms dd,.list-item,.case-button,.hr-case-toggle,.survey-answers,.report-text,.answer-summary,.detail-section h2,.detail-section .card-head p,.employee-card h2,.process-card p,.tag,.count,[data-editor]';
  for(const root of document.querySelectorAll('.demo-bar,.top,#app,footer')){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];let node;while(node=walker.nextNode())nodes.push(node);
    for(const node of nodes){
      const parent=node.parentElement, key=node.textContent.trim();
      if(!key||/^\d+$/.test(key)||(parent.closest(excluded)&&!parent.closest('[data-copy-allow]'))||parent.closest('[data-copy-source]'))continue;
      const span=document.createElement('span');span.dataset.copySource=key;
      span.textContent=Object.hasOwn(copyEditor.values,key)?copyEditor.values[key]:key;
      node.replaceWith(span);
    }
    for(const span of root.querySelectorAll('[data-copy-source]')){
      const source=span.dataset.copySource;
      if(!copyEditor.active)span.textContent=Object.hasOwn(copyEditor.values,source)?copyEditor.values[source]:source;
      span.contentEditable=String(copyEditor.active);span.spellcheck=copyEditor.active;
      if(copyEditor.active){span.setAttribute('role','textbox');span.setAttribute('aria-label','Редактировать: '+source)}
      else{span.removeAttribute('role');span.removeAttribute('aria-label')}
    }
    if(copyEditor.active)root.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=true);
  }
  document.body.classList.toggle('editing-copy',copyEditor.active);
  const toggle=document.querySelector('#copy-toggle');
  if(toggle)toggle.hidden=!copyEditor.enabled||copyEditor.active;
}
function editorToolbar(){
  if(document.querySelector('#copy-toolbar'))return;
  const box=document.createElement('div');box.id='copy-toolbar';box.dataset.editor='';
  box.innerHTML='<button id="copy-toggle" type="button" class="btn secondary" hidden>Редактировать тексты</button><div id="copy-controls" hidden><span>Нажмите на текст и измените его. Ответы сотрудников не редактируются.</span><span id="copy-status" role="status">Нет несохранённых изменений</span><button type="button" class="btn" id="copy-save">Сохранить</button><button type="button" class="btn secondary" id="copy-cancel">Завершить</button></div><a class="btn secondary" href="/">Открыть сайт</a>';
  document.body.append(box);
  box.addEventListener('click',async event=>{
    const id=event.target.closest('button')?.id;if(!id)return;
    try{
      if(id==='copy-toggle'){
        const data=await api('content');
        if(!data.editable)throw new Error('Редактирование уже отключено.');
        copyEditor.values=data.values;copyEditor.draft={...data.values};copyEditor.revision=data.revision;copyEditor.active=true;copyEditor.dirty=false;
        document.querySelector('#copy-controls').hidden=false;applyCopy();
      }else if(id==='copy-cancel'){
        if(copyEditor.dirty&&!confirm('Завершить без сохранения последних правок?'))return;
        copyEditor.active=false;copyEditor.dirty=false;document.querySelector('#copy-controls').hidden=true;render();
      }else if(id==='copy-save'){
        const button=document.querySelector('#copy-save');button.disabled=true;
        try{
          const saved=await api('content',{values:copyEditor.draft,revision:copyEditor.revision});
          copyEditor.values={...copyEditor.draft};copyEditor.revision=saved.revision;copyEditor.dirty=false;
          document.querySelector('#copy-status').textContent='Сохранено. Изменения видны всем посетителям.';
          notify('Тексты сохранены. Можно продолжить редактирование или нажать «Завершить».');
        }finally{button.disabled=false}
      }
    }catch(error){notify(error.message,true)}
  });
  document.addEventListener('input',event=>{
    const span=event.target.closest('[data-copy-source]');if(!copyEditor.active||!span)return;
    copyEditor.draft[span.dataset.copySource]=span.textContent;copyEditor.dirty=true;
    document.querySelector('#copy-status').textContent='Есть несохранённые изменения';
  });
  document.addEventListener('paste',event=>{
    if(copyEditor.active&&event.target.closest('[data-copy-source]')){
      event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
    }
  });
  window.addEventListener('beforeunload',event=>{if(copyEditor.dirty){event.preventDefault();event.returnValue=''}});
}
async function loadCopy(){const saved=await api('content');copyEditor.values=saved.values;copyEditor.revision=saved.revision;copyEditor.enabled=saved.editable;if(editorPage)editorToolbar()}
