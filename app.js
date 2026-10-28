"use strict";
import {validateProject,validateCases,validateWorkspace,demoGenerate,checklistGenerate,checklistReview,validateConfig,aiRequest,parseAiResult,apiError,responseText} from './core.mjs';
import {readXlsx,exportXlsx} from './excel.mjs';
let bundle, activeController=null;
const LIBRARY_KEY='utuAt.pages.projects.v2';
function readLibrary(){try{const value=JSON.parse(localStorage.getItem(LIBRARY_KEY)||'[]');if(!Array.isArray(value))throw Error();return value.map(validateWorkspace);}catch{throw Error('Daftar proyek browser tidak valid. Pulihkan dari backup JSON.');}}
function writeLibrary(rows){try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(rows));}catch{throw Error('Penyimpanan browser penuh atau diblokir. Unduh Backup JSON dahulu.');}}
function downloadFile(content,mime,name){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function confirmAction(message){return new Promise(resolve=>{const d=$('confirm-dialog');$('confirm-message').textContent=message;d.returnValue='cancel';d.onclose=()=>resolve(d.returnValue==='yes');d.showModal();});}
async function callAi(p,existing,operation){
 const c=validateConfig(config),request=aiRequest(p,existing,c,operation);activeController=new AbortController();$('cancel-ai').hidden=false;
 const timeout=setTimeout(()=>activeController?.abort('timeout'),180000);
 try{
  const response=await fetch(request.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key},body:JSON.stringify(request.body),signal:activeController.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
  let raw;try{raw=await response.json();}catch{throw Error('Penyedia tidak mengembalikan respons JSON. Periksa base URL dan format API.');}
  if(!response.ok)throw Error(apiError(response.status,raw,response.headers.get('Retry-After')||''));
  const result=parseAiResult(responseText(raw,c.style),p,operation);config.tested=true;setConfig();return result;
 }catch(e){
  if(activeController?.signal.aborted)throw Error('Permintaan AI dibatalkan atau melewati batas 3 menit. Provider mungkin sudah memproses permintaan.');
  if(e instanceof TypeError)throw Error('Browser tidak dapat menghubungi penyedia. Periksa jaringan, HTTPS, dan izin CORS penyedia untuk origin situs ini. Tidak ada proxy otomatis yang dipakai.');
  throw e;
 }finally{clearTimeout(timeout);activeController=null;$('cancel-ai').hidden=true;}
}
const $ = id => document.getElementById(id);
const fields = ['title','tcode','level','description','requirements','context'];
let state = {id:null,scenarios:[],questions:[],project:{},version:1};
let token='', demo={}, config={configured:false,key:'',baseUrl:'https://api.openai.com/v1',style:'responses',model:'',tested:false}, activeTab='scenarios', candidates=[], toastTimer, dirty=false;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const project = () => Object.fromEntries(fields.map(f=>[f,$(f).value.trim()]));
const reqs = () => $('requirements').value.split('\n').map(text=>text.trim()).filter(Boolean).map((text,i)=>({id:`REQ-${String(i+1).padStart(2,'0')}`,text}));
function toast(text,error=false){$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?10000:5000);}
function persist(){state.project=project();try{localStorage.setItem('utuAt.workspace.v1',JSON.stringify(state));}catch{toast('Penyimpanan browser penuh. Simpan proyek ke folder lokal.',true);}}
function changed(){dirty=true;$('save-state').textContent='Perubahan belum disimpan';persist();}
function setProject(p){fields.forEach(f=>$(f).value=p[f]|| (f==='level'?'Both':''));}
async function api(path,body){
 if(path==='/api/bootstrap'){const r=await fetch('./demo.json');if(!r.ok)throw Error('Data demo tidak dapat dimuat.');bundle=await r.json();return {demo:bundle.project,config,token:''};}
 if(path==='/api/projects')return {projects:readLibrary().map(s=>({id:s.id,title:s.project.title,updated:s.updated,count:s.scenarios.length})).sort((a,b)=>b.updated.localeCompare(a.updated))};
 if(path.startsWith('/api/projects/')){const found=readLibrary().find(s=>s.id===path.split('/').pop());if(!found)throw Error('Proyek tidak ditemukan.');return structuredClone(found);}
 if(path==='/api/save'){const s=validateWorkspace(body);s.id=s.id||crypto.randomUUID();s.updated=new Date().toISOString();const all=readLibrary().filter(x=>x.id!==s.id);if(all.length>=100)throw Error('Maksimal 100 proyek. Unduh backup dan hapus data browser jika perlu.');all.push(s);writeLibrary(all);return {id:s.id,updated:s.updated};}
 if(path==='/api/generate'||path==='/api/review'){
  const p=validateProject(body.project),existing=validateCases(body.scenarios||[]),operation=path.endsWith('review')?'review':'generate';
  if(body.mode==='ai')return callAi(p,existing,operation);
  if(!['demo','checklist'].includes(body.mode))throw Error('Mode tidak valid.');
  return operation==='review'?checklistReview(p,existing,bundle,body.mode):body.mode==='demo'?demoGenerate(p,bundle):checklistGenerate(p);
 }
 throw Error('Fungsi tidak tersedia di versi browser.');
}
async function working(label,fn){$('busy-label').textContent=label;$('busy').hidden=false;try{await fn();}catch(e){toast(e.message||'Proses gagal.',true);}finally{$('busy').hidden=true;}}
function empty(title,text,icon='▤'){return `<div class="empty"><div class="empty-symbol">${icon}</div><h3>${title}</h3><p>${text}</p></div>`;}
function render(){
  $('requirement-count').textContent=`${reqs().length} requirement`;
  $('stat-total').textContent=state.scenarios.length;$('tab-count').textContent=state.scenarios.length;
  $('stat-reviewed').textContent=state.scenarios.filter(c=>c.review==='Reviewed').length;
  $('stat-questions').textContent=state.questions.length;$('question-count').textContent=state.questions.length;
  const query=$('search').value.toLocaleLowerCase(),filter=$('filter').value;
  const filtered=state.scenarios.map((c,i)=>({...c,index:i})).filter(c=>(!filter||c.test_type===filter)&&[c.id,c.title,c.data,c.expected,c.remarks].join(' ').toLocaleLowerCase().includes(query));
  $('case-list').innerHTML=filtered.length?filtered.map((c,n)=>`<div class="case-row" role="button" tabindex="0" data-index="${c.index}" aria-label="Edit ${escapeHtml(c.id)} ${escapeHtml(c.title)}"><div class="case-number">${String(n+1).padStart(2,'0')}</div><div class="case-content"><div class="case-meta"><span class="case-id">${escapeHtml(c.id)}</span><span class="pill ${c.test_type.toLowerCase()}">${escapeHtml(c.test_type)}</span><span class="pill level">${escapeHtml(c.level)}</span></div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.expected||'Expected result belum diisi.')}</p></div><span class="case-status ${c.review==='Reviewed'?'reviewed':c.review==='Needs clarification'?'clarify':''}">${c.review==='Reviewed'?'✓ Reviewed':c.review==='Needs clarification'?'● Klarifikasi':'○ Draft'}</span><span class="edit-arrow">›</span></div>`).join(''):state.scenarios.length?empty('Tidak ada hasil','Coba kata kunci atau filter yang lain.','⌕'):empty('Skenario Anda dimulai di sini','Lengkapi konteks enhancement, lalu klik Generate scenarios. Anda juga dapat mengimpor template Excel atau menambah skenario sendiri.','✦');
  $('case-list').querySelectorAll('[data-index]').forEach(el=>{el.onclick=()=>editCase(Number(el.dataset.index));el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editCase(Number(el.dataset.index));}};});
  $('coverage-list').innerHTML=reqs().length?reqs().map(r=>{const mapped=state.scenarios.filter(c=>c.requirement_ids.includes(r.id));const reviewed=mapped.filter(c=>c.review==='Reviewed');return `<div class="coverage-row"><strong>${r.id}</strong><p>${escapeHtml(r.text)}</p><small class="${mapped.length?'':'missing'}">${mapped.length?`${mapped.length} skenario terhubung · ${reviewed.length} direview<br>${mapped.map(c=>escapeHtml(c.id)).join(', ')}`:'Belum ada skenario terhubung. Tambahkan mapping melalui editor.'}</small></div>`;}).join(''):empty('Belum ada requirement','Isi business requirements untuk melihat mapping skenario.');
  $('question-list').innerHTML=state.questions.length?state.questions.map((q,i)=>`<div class="question"><span>${String(i+1).padStart(2,'0')}</span><div>${escapeHtml(q)}</div></div>`).join(''):empty('Belum ada daftar klarifikasi','Pertanyaan dari generator atau review akan muncul di sini. Tidak adanya pertanyaan belum berarti semua aturan lengkap.','?');
  $('export-btn').disabled=!state.scenarios.length;
}
function tab(name){activeTab=name;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));});['scenarios','coverage','questions'].forEach(n=>$(n+'-tab').hidden=n!==name);document.querySelector('.toolbar').hidden=name!=='scenarios';}
function setConfig(){const ready=config.configured;$('connection-label').textContent=ready?(config.tested?'AI terhubung · sesi ini':'Key sesi siap · belum diuji'):'Mode tanpa API tersedia';$('settings-top').classList.toggle('ready',ready);}
function settings(){setConfig();$('api-base').value=config.baseUrl||'https://api.openai.com/v1';$('api-style').value=config.style||'responses';$('model-name').value=config.model||'';$('api-key').value='';$('api-consent').checked=false;updateDestination();$('settings-dialog').showModal();}
function updateDestination(){try{$('destination-label').textContent=new URL($('api-base').value).host;}catch{$('destination-label').textContent='URL penyedia belum valid';}}
function modeInfo(){const ai=$('mode').value==='ai';$('generation-help').textContent=ai?'Key pribadi di memori tab. Input dikirim langsung ke penyedia yang Anda pilih.':'Pemrosesan lokal di browser; tidak mengirim input ke layanan AI.';}
function clearCandidates(){candidates=[];$('review-output').innerHTML='';}
async function loadDemo(){if(state.scenarios.length&&!await confirmAction('Muat contoh MIRO sebagai proyek baru? Simpan proyek saat ini terlebih dahulu jika diperlukan.'))return;state={id:null,scenarios:[],questions:[],project:{...demo},version:1};setProject(demo);$('mode').value='demo';modeInfo();clearCandidates();changed();render();tab('scenarios');toast('Konteks demo MIRO dimuat. Klik Generate scenarios untuk mencoba.');}
function mergeCases(incoming){if(state.scenarios.length+incoming.length>300)throw Error('Maksimal 300 skenario.');const ids=new Set(state.scenarios.map(c=>c.id));for(const raw of incoming){const c=structuredClone(raw);let id=c.id,i=2;while(ids.has(id))id=`${c.id}-${i++}`;c.id=id;ids.add(id);state.scenarios.push(c);}}
async function generate(e){e.preventDefault();if(!$('project-form').reportValidity())return;if($('mode').value==='ai'&&!config.configured){settings();toast('Konfigurasikan AI untuk requirement Anda.',true);return;}if(state.scenarios.length&&!await confirmAction('Ganti semua skenario saat ini dengan draft baru? Simpan proyek dahulu jika ingin mempertahankan hasil review.'))return;
  await working('Menyiapkan draft skenario…',async()=>{const result=await api('/api/generate',{project:project(),mode:$('mode').value,scenarios:[]});state.scenarios=result.scenarios;state.questions=result.questions;clearCandidates();changed();render();tab('scenarios');toast(`${result.scenarios.length} draft skenario siap direview.`);});}
function editCase(index){
  const c=index<0?{id:`TC-${String(state.scenarios.length+1).padStart(3,'0')}`,title:'',test_type:'Positive',level:$('level').value==='UAT'?'UAT':'UT',data:'',steps:'',expected:'',actual:'',status:'Not run',review:'Draft',remarks:'',requirement_ids:[],source:'Manual'}:state.scenarios[index];
  $('case-index').value=index;$('case-dialog-title').textContent=index<0?'Tambah skenario':'Review skenario';
  for(const [field,key] of Object.entries({id:'id',title:'title',type:'test_type',level:'level',data:'data',steps:'steps',expected:'expected',actual:'actual',status:'status',review:'review',remarks:'remarks'}))$('case-'+field).value=c[key];
  $('case-refs').innerHTML=reqs().map(r=>`<label><input type="checkbox" value="${r.id}" ${c.requirement_ids.includes(r.id)?'checked':''}><span><strong>${r.id}</strong> ${escapeHtml(r.text)}</span></label>`).join('')||'<p class="field-help">Tambahkan requirement pada form untuk membuat mapping.</p>';
  $('delete-case').hidden=index<0;$('case-dialog').showModal();
}
function saveCase(e){e.preventDefault();if(Number($('case-index').value)<0&&state.scenarios.length>=300){toast('Maksimal 300 skenario.',true);return;}const index=Number($('case-index').value);const c=index<0?{source:'Manual'}:structuredClone(state.scenarios[index]);
  for(const [field,key] of Object.entries({id:'id',title:'title',type:'test_type',level:'level',data:'data',steps:'steps',expected:'expected',actual:'actual',status:'status',review:'review',remarks:'remarks'}))c[key]=$('case-'+field).value.trim();
  if(state.scenarios.some((s,i)=>i!==index&&s.id===c.id)){toast('ID skenario harus unik.',true);return;}
  if(c.review==='Reviewed'&&(!c.steps||!c.expected||!c.data||c.level==='To confirm')){toast('Lengkapi level, test data, steps, dan expected result sebelum menandai Reviewed.',true);return;}
  c.requirement_ids=Array.from($('case-refs').querySelectorAll('input:checked')).map(el=>el.value);
  if(index<0)state.scenarios.push(c);else state.scenarios[index]=c;clearCandidates();changed();render();$('case-dialog').close();toast('Perubahan skenario disimpan di workspace.');}
async function review(){if(!$('project-form').reportValidity())return;if(!state.scenarios.length){toast('Tambahkan atau import skenario sebelum review cakupan.',true);return;}if($('mode').value==='ai'&&!config.configured){settings();return;}
  await working('Meninjau potensi celah pengujian…',async()=>{const result=await api('/api/review',{project:project(),scenarios:state.scenarios,mode:$('mode').value});candidates=result.scenarios;state.questions=[...new Set([...state.questions,...result.questions])];changed();render();renderCandidates(result.summary);});}
function renderCandidates(summary){$('review-output').innerHTML=`<div class="review-summary"><strong>${candidates.length} kandidat skenario tambahan</strong><p>${escapeHtml(summary)}</p></div>`+candidates.map((c,i)=>`<div class="candidate"><h4>${escapeHtml(c.title)}</h4><span class="pill">${escapeHtml(c.test_type)} · ${escapeHtml(c.level)}</span><p>${escapeHtml(c.expected)}</p><button class="button secondary small" data-candidate="${i}">＋ Tambahkan sebagai draft</button></div>`).join('');$('review-output').querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>{mergeCases([candidates[Number(b.dataset.candidate)]]);b.disabled=true;b.textContent='✓ Ditambahkan';changed();render();});}
async function save(){if(!$('project-form').reportValidity())return;await working('Menyimpan proyek lokal…',async()=>{const saved=await api('/api/save',{...state,project:project()});state.id=saved.id;state.updated=saved.updated;dirty=false;persist();$('save-state').textContent='✓ Tersimpan di browser';toast('Proyek tersimpan pada browser ini. Gunakan Backup JSON untuk pindah perangkat.');});}
async function exportExcel(){if(!$('project-form').reportValidity())return;await working('Menyiapkan file Excel…',async()=>{const s=validateWorkspace({...state,project:project()});const bytes=exportXlsx(s.project,s.scenarios,s.questions);downloadFile(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',`UTUAT-${s.project.tcode.replace(/[^a-z0-9-]/gi,'_')}.xlsx`);toast('Excel siap: template utama, detail testing, dan requirement.');});}
async function importExcel(file){if(!file)return;await working('Membaca Excel di browser…',async()=>{if(file.size>5000000)throw Error('File Excel maksimal 5 MB.');const incoming=await readXlsx(new Uint8Array(await file.arrayBuffer()));mergeCases(incoming);clearCandidates();changed();render();tab('scenarios');toast(`${incoming.length} skenario ditambahkan. Lengkapi level UT/UAT dan mapping requirement.`);});$('import-file').value='';}
function backup(){try{const all=readLibrary(),current=validateWorkspace({...state,project:project()});const projects=all.filter(p=>!state.id||p.id!==state.id);projects.push(current);downloadFile(JSON.stringify({format:'utuAt-pages-backup',version:1,projects},null,2),'application/json','UTUAT-backup.json');toast('Backup JSON diunduh, termasuk workspace saat ini.');}catch(e){toast(e.message,true);}}
async function restore(file){if(!file)return;await working('Memulihkan proyek JSON…',async()=>{if(file.size>10000000)throw Error('Backup maksimal 10 MB.');const raw=JSON.parse(await file.text());const incoming=raw.format==='utuAt-pages-backup'?raw.projects:[raw];if(!Array.isArray(incoming)||incoming.length>100)throw Error('Format backup tidak valid.');const clean=incoming.map(validateWorkspace),all=readLibrary();if(all.length+clean.length>100)throw Error('Maksimal 100 proyek di browser.');for(const s of clean){s.id=crypto.randomUUID();s.updated=new Date().toISOString();all.push(s);}writeLibrary(all);toast(`${clean.length} proyek dipulihkan. Buka dari daftar proyek.`);await showView('projects');});$('restore-file').value='';}
async function showView(name){$('workspace-view').hidden=name!=='workspace';$('projects-view').hidden=name!=='projects';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('page-label').textContent=name==='projects'?'Proyek tersimpan':'Scenario generator';if(name==='projects')await working('Membaca proyek lokal…',async()=>{const result=await api('/api/projects');$('project-list').innerHTML=result.projects.length?result.projects.map(p=>`<article class="project-card"><div><h3>${escapeHtml(p.title)}</h3><p>${p.count} skenario · ${escapeHtml(new Date(p.updated).toLocaleString('id-ID'))}</p></div><button class="button secondary" data-project="${p.id}">Buka proyek →</button></article>`).join(''):empty('Belum ada proyek tersimpan','Klik Simpan proyek untuk menyimpan di browser, atau Import JSON dari folder data aplikasi lokal lama.');$('project-list').querySelectorAll('[data-project]').forEach(b=>b.onclick=async()=>{if(dirty&&!await confirmAction('Buka proyek tersimpan dan tinggalkan perubahan di workspace saat ini?'))return;await working('Membuka proyek…',async()=>{state=await api('/api/projects/'+b.dataset.project);setProject(state.project);clearCandidates();dirty=false;persist();render();$('save-state').textContent='✓ Proyek browser dimuat';showView('workspace');tab('scenarios');});});});}
async function init(){
  const boot=await api('/api/bootstrap');token=boot.token;demo=boot.demo;config=boot.config;
  try{const saved=JSON.parse(localStorage.getItem('utuAt.workspace.v1'));if(saved?.version===1){state=validateWorkspace(saved);dirty=true;}}catch{toast('Draft browser tidak valid; gunakan backup JSON bila diperlukan.',true);}
  if(!state.project.title)state.project={...demo};setProject(state.project);setConfig();modeInfo();render();
  fields.forEach(f=>$(f).addEventListener('input',()=>{clearCandidates();if(state.scenarios.length){state.scenarios.forEach(c=>{c.review='Draft';if(f==='requirements')c.requirement_ids=[];});$('save-state').textContent='Konteks berubah · review ulang';}changed();render();}));
  $('project-form').onsubmit=generate;$('demo-btn').onclick=loadDemo;$('mode').onchange=modeInfo;
  $('search').oninput=render;$('filter').onchange=render;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('add-btn').onclick=()=>editCase(-1);$('case-form').onsubmit=saveCase;$('review-btn').onclick=review;
  document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('delete-case').onclick=async()=>{if(await confirmAction('Hapus skenario ini dari workspace?')){state.scenarios.splice(Number($('case-index').value),1);clearCandidates();changed();render();$('case-dialog').close();}};
  $('settings-nav').onclick=settings;$('settings-top').onclick=settings;
  $('api-base').oninput=updateDestination;
  $('settings-form').onsubmit=e=>{e.preventDefault();try{config={...validateConfig({baseUrl:$('api-base').value.trim(),style:$('api-style').value,model:$('model-name').value.trim(),key:$('api-key').value.trim()||config.key}),tested:false};$('api-key').value='';setConfig();$('settings-dialog').close();toast('Key hanya di memori tab. Koneksi diuji saat Generate/Review AI.');}catch(e){toast(e.message,true);}};
  $('clear-key').onclick=()=>{config={configured:false,key:'',baseUrl:'https://api.openai.com/v1',style:'responses',model:'',tested:false};$('api-key').value='';setConfig();toast('Key sesi dihapus.');};
  $('cancel-ai').onclick=()=>activeController?.abort('user');
  $('backup-btn').onclick=backup;$('restore-btn').onclick=()=>$('restore-file').click();$('restore-file').onchange=e=>restore(e.target.files[0]);
  $('save-btn').onclick=save;$('export-btn').onclick=exportExcel;$('import-btn').onclick=()=>$('import-file').click();$('import-file').onchange=e=>importExcel(e.target.files[0]);
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $('new-btn').onclick=async()=>{if(dirty&&!await confirmAction('Buat proyek baru? Simpan perubahan workspace terlebih dahulu jika diperlukan.'))return;state={id:null,scenarios:[],questions:[],project:{level:'Both'},version:1};setProject(state.project);clearCandidates();changed();render();showView('workspace');tab('scenarios');};
  window.addEventListener('beforeunload',persist);
}
init().catch(e=>toast('Aplikasi gagal dimuat. '+e.message,true));
