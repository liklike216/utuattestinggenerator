import {makeCase,validateCases,requirements} from './core.mjs';
export const HEADERS=['ID','Scenario','Type','Preconditions / Test Data','Expected Result*','Actual / Status'];
const encoder=new TextEncoder(),decoder=new TextDecoder();
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const join=parts=>{const out=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;};
export function zipStore(files){
  const local=[],central=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const filename=encoder.encode(name),data=typeof text==='string'?encoder.encode(text):text,crc=crc32(data);
    const h=new Uint8Array(30+filename.length),v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);h.set(filename,30);
    const ch=new Uint8Array(46+filename.length),cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);ch.set(filename,46);
    local.push(h,data);central.push(ch);offset+=h.length+data.length;
  }
  const directory=join(central),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,directory.length,true);ev.setUint32(16,offset,true);
  return join([...local,directory,end]);
}
export async function unzip(bytes){
  try{
    if(!(bytes instanceof Uint8Array)||bytes.length>5000000||bytes.length<22)throw Error('File Excel tidak valid atau lebih dari 5 MB.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break;}
    if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('ZIP multipart tidak didukung.');
    const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),expanded=0;const entries=[];
    if(count>1000)throw Error('Workbook memiliki terlalu banyak komponen.');
    for(let i=0;i<count;i++){
      if(v.getUint32(pos,true)!==0x02014b50)throw Error('Direktori ZIP tidak valid.');
      const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),size=v.getUint32(pos+20,true),usize=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
      if(flags&1||![0,8].includes(method)||usize===0xffffffff)throw Error('Workbook terenkripsi/ZIP64 tidak didukung.');
      expanded+=usize;if(expanded>25000000)throw Error('Workbook terlalu besar setelah dekompresi.');
      const name=decoder.decode(bytes.subarray(pos+46,pos+46+n));
      if(entries.some(e=>e.name===name))throw Error('Komponen workbook duplikat.');
      entries.push({name,method,crc,size,usize,offset});pos+=46+n+extra+comment;
    }
    const files=new Map();
    for(const e of entries){
      if(v.getUint32(e.offset,true)!==0x04034b50)throw Error('Header ZIP tidak valid.');
      const start=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true);
      if(start+e.size>bytes.length)throw Error('ZIP terpotong.');
      let data=bytes.subarray(start,start+e.size);
      if(e.method===8){
        if(typeof DecompressionStream==='undefined')throw Error('Browser belum mendukung import XLSX. Gunakan Chrome atau Edge terbaru.');
        let stream;try{stream=new DecompressionStream('deflate-raw');}catch{throw Error('Gunakan Chrome atau Edge terbaru untuk import XLSX.');}
        const reader=new Blob([data]).stream().pipeThrough(stream).getReader(),parts=[];let total=0;
        for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>e.usize||total>25000000){await reader.cancel();throw Error('Ukuran dekompresi tidak valid.');}parts.push(value);}data=join(parts);
      }
      if(data.length!==e.usize||crc32(data)!==e.crc)throw Error('Integritas ZIP tidak valid.');
      files.set(e.name,data);
    }
    return files;
  }catch(e){if(e instanceof RangeError)throw Error('File Excel terpotong/tidak valid.');throw e;}
}
function parseXml(bytes){
  if(!bytes)throw Error('Struktur Excel tidak lengkap.');
  const text=decoder.decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('XML dengan entity tidak didukung.');
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.getElementsByTagName('parsererror').length)throw Error('XML Excel tidak valid.');return xml;
}
const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
const texts=root=>nodes(root,'t').map(n=>n.textContent).join('');
export async function readXlsx(bytes){
  const files=await unzip(bytes),book=parseXml(files.get('xl/workbook.xml')),sheet=nodes(book,'sheet')[0];
  if(!sheet)throw Error('Workbook tidak memiliki worksheet.');
  const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rel=nodes(parseXml(files.get('xl/_rels/workbook.xml.rels')),'Relationship').find(r=>r.getAttribute('Id')===rid);
  if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('Worksheet eksternal tidak didukung.');
  const target=rel.getAttribute('Target'),segments=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),resolved=[];
  for(const part of segments){if(part==='..')resolved.pop();else if(part!=='.'&&part)resolved.push(part);}
  const shared=files.has('xl/sharedStrings.xml')?nodes(parseXml(files.get('xl/sharedStrings.xml')),'si').map(texts):[];
  const rows=nodes(parseXml(files.get(resolved.join('/'))),'sheetData').flatMap(data=>nodes(data,'row')).map(row=>{
    const r={};for(const c of nodes(row,'c')){
      if(nodes(c,'f').length)throw Error('Import hanya mendukung nilai. Ganti formula dengan nilai dahulu.');
      const col=(c.getAttribute('r')||'A1').match(/^[A-Z]+/)?.[0];if(!col)throw Error('Referensi sel tidak valid.');
      const v=nodes(c,'v')[0]?.textContent||'',type=c.getAttribute('t');
      r[col]=type==='s'?shared[Number(v)]:type==='inlineStr'?texts(c):v;
      if(typeof r[col]!=='string')throw Error('Shared string tidak valid.');
    }return r;
  }).filter(r=>Object.values(r).some(Boolean));
  if(!rows.length||HEADERS.some((h,i)=>(rows[0]['ABCDEF'[i]]||'').trim()!==h))throw Error('Header sheet pertama harus sesuai enam kolom template UT/UAT.');
  if(rows.length>301)throw Error('Maksimal 300 skenario.');
  return validateCases(rows.slice(1).map((r,i)=>Object.assign(makeCase((r.A||'').trim()||`IMPORT-${i+1}`,r.B||''),{test_type:r.C||'Positive',level:'To confirm',data:r.D||'',expected:r.E||'',actual:r.F||'',source:'Import Excel',remarks:'Import template: tentukan level UT/UAT, test steps, dan mapping requirement. Actual / Status asli dipertahankan di Actual Result.'})));
}
const esc=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,32767).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function col(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function worksheet(rows,widths){
  const last=col(widths.length)+Math.max(rows.length,1);
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}" ht="${i?90:30}" customHeight="1">${r.map((value,j)=>`<c r="${col(j+1)}${i+1}" t="inlineStr" s="${i?2:1}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;
}
export function exportXlsx(project,cases,questions){
  const rows=[HEADERS,...cases.map(c=>[c.id,c.title,c.test_type,c.data,c.expected,(c.actual||'')+(c.status!=='Not run'?(c.actual?' | ':'')+c.status:!c.actual?'Not run':'')])];
  const detail=[['ID','Level','Requirement IDs','Test Steps','Actual Result','Execution Status','Review Status','Remarks','Source'],...cases.map(c=>[c.id,c.level,c.requirement_ids.join(', '),c.steps,c.actual,c.status,c.review,c.remarks,c.source])];
  const refs=[['Item','Detail'],['Enhancement',project.title],['T-Code',project.tcode],['Description',project.description],['Context',project.context],['Note','Draft untuk review. Mapping bukan bukti coverage lengkap atau hasil eksekusi.'],...requirements(project).map(r=>[r.id,r.text]),...questions.map((q,i)=>['Question '+(i+1),q])];
  const sheets=[['UT UAT',rows,[20,48,18,65,85,40]],['Detail',detail,[20,15,26,85,60,20,24,75,20]],['Requirement',refs,[25,120]]];
  const rels='http://schemas.openxmlformats.org/package/2006/relationships',docrels='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files={
    '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels':`<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${docrels}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${docrels}"><sheets>${sheets.map(([name],i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':`<Relationships xmlns="${rels}">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${docrels}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId4" Type="${docrels}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123451"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  };
  sheets.forEach(([name,data,w],i)=>files[`xl/worksheets/sheet${i+1}.xml`]=worksheet(data,w));return zipStore(files);
}
