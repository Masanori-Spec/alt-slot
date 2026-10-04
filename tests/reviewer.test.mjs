import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {openDocument,makePacket,previewReview,applyReview,parsePacket,LIMITS} from '../src/core.mjs';
import {reviewHTML} from '../src/report.mjs';
import {sha256,encode} from '../src/zip.mjs';
const source=await readFile('fixtures/bench.docx');
const clone=structuredClone;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(){
  const nodes=new Map(),workers=[],timers=new Map();let sequence=0;
  class Node {
    constructor(){Object.assign(this,{value:'',textContent:'',innerHTML:'',children:[],dataset:{},attrs:{},events:{},open:false,hidden:false,disabled:false,files:[]});}
    append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.events[k]=v;}
    showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}click(){this.onclick?.({preventDefault(){}});}focus(){}remove(){}
  }
  for(const [,id]of (await readFile('web/index.html','utf8')).matchAll(/\bid="([^"]+)"/g))nodes.set(id,new Node());
  const document={getElementById:id=>nodes.get(id),createElement:()=>new Node(),querySelectorAll:()=>[],querySelector:()=>new Node(),documentElement:new Node(),body:new Node()};
  class Worker{
    constructor(){workers.push(this);}postMessage(data){this.data=clone(data);}terminate(){this.terminated=true;}
    async response(){if(this.data.kind==='open'){const d=await openDocument(this.data.bytes);return {ok:true,id:this.data.id,model:clone(Object.fromEntries(Object.entries(d).filter(([k])=>!k.startsWith('_'))))};}return {ok:true,id:this.data.id,result:await applyReview(this.data.bytes,this.data.packet)};}
    async reply(){this.onmessage({data:await this.response()});}
  }
  const saved=Object.fromEntries(['document','Worker','setTimeout','clearTimeout'].map(k=>[k,globalThis[k]]));
  Object.assign(globalThis,{document,Worker,setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
  await import('../web/app.mjs?review='+Math.random());const $=id=>nodes.get(id),click=id=>$(id).click();
  return {$,click,workers,timers,async load(){ $('doc-file').files=[new File([source],'bench.docx')];$('doc-file').onchange();await tick();await workers.at(-1).reply();},edit(k,action,value){$(k+'-action').value=action;$(k+'-action').onchange();if(value!==undefined){$(k+'-value').value=value;$(k+'-value').oninput();}},cleanup(){click('cancel-work');Object.assign(globalThis,saved);}};
}

test('review: exported packet identity is isolated from the inspection preview baseline',async()=>{
  const doc=await openDocument(source),before=clone(doc.occurrences),p=makePacket(doc);
  p.records[0].original.descr='forged';p.records[0].originalAttributes[0][1]='forged';
  assert.deepEqual(doc.occurrences,before);assert.throws(()=>previewReview(doc,p));
  const cached=doc.packet;cached.records[0].original.descr='other forged';assert.deepEqual(doc.occurrences,before);
});

test('review: typing a newer packet draft cancels an older pending packet-file import',async()=>{
  const ui=await harness();try{
    await ui.load();ui.click('open-packet');const old=makePacket(await openDocument(source));old.records[0].edit.descr={action:'set',value:'older file'};
    let resolve;ui.$('packet-file').files=[{size:100,arrayBuffer:()=>new Promise(r=>resolve=r)}];const pending=ui.$('packet-file').onchange();
    const newer=clone(old);newer.records[0].edit.descr={action:'set',value:'newer typed draft'};ui.$('packet-json').value=JSON.stringify(newer);ui.$('packet-json').oninput?.();
    resolve(new TextEncoder().encode(JSON.stringify(old)).buffer);await pending;
    assert.equal(ui.$('packet-dialog').open,true);assert.equal(ui.$('packet-json').value,JSON.stringify(newer));assert.equal(ui.$('changed-count').textContent,0);
    ui.click('import-packet');assert.equal(ui.$('packet-dialog').open,false);assert.equal(ui.$('descr-value').value,'newer typed draft');
  }finally{ui.cleanup();}
});

test('review: worker-constructor failure during source replacement is visible and terminal',async()=>{
  const ui=await harness();try{
    await ui.load();globalThis.Worker=class{constructor(){throw Error('worker constructor blocked');}};
    ui.$('doc-file').files=[new File([source],'replacement.docx')];ui.$('doc-file').onchange();await tick();
    assert.equal(ui.$('cancel-work').hidden,true);assert.equal(ui.$('apply').disabled,false);assert.equal(ui.$('file-name').textContent,'bench.docx');
    assert.equal(ui.$('status').className,'error');assert.ok(!ui.$('status').textContent.includes('読み込んでいます'));
  }finally{ui.cleanup();}
});

test('review: standalone review distinguishes absent, empty and literal missing-symbol values',async()=>{
  const doc=await openDocument(source),p=makePacket(doc);p.records=[p.records[2],p.records[4]];
  p.records[0].edit.descr={action:'set',value:'∅'};p.records[1].edit.descr={action:'remove'};
  const result=await applyReview(source,p),html=reviewHTML(doc,result);
  assert.ok(!html.includes('<td>∅</td><td>∅</td>'));
  assert.match(html,/absent/i);assert.ok(html.includes('&quot;&quot;'));assert.ok(html.includes('&quot;∅&quot;'));
});

test('review: stale worker error and duplicate completion cannot terminate a newer generation',async()=>{
  const ui=await harness();try{
    await ui.load();ui.edit('descr','set','first');ui.click('apply');const old=ui.workers.at(-1),reply=await old.response();
    ui.edit('descr','set','second');ui.click('apply');const current=ui.workers.at(-1);old.onerror();old.onmessage({data:reply});
    assert.equal(current.terminated,undefined);assert.equal(ui.$('download-docx').disabled,true);
    await current.reply();assert.equal(ui.$('download-docx').disabled,false);
    ui.edit('title','set','third');old.onmessage({data:reply});assert.equal(ui.$('download-docx').disabled,true);
  }finally{ui.cleanup();}
});

// Literal element paths are checked by a separate Python XML implementation.
// The output oracle masks only permitted docPr attributes and compares all other
// XML lexemes, complete ZIP member payloads, raw local records and receipt hashes.
const identities=[
 ['word/document.xml','0/3/1/0/0/1'],['word/document.xml','0/5/1/0/0/1'],
 ['word/document.xml','0/7/1/0/0/5'],['word/header1.xml','0/2/0/0/1'],['word/footer1.xml','0/2/0/0/1'],
];
const oracle=String.raw`
import sys,json,base64,io,zipfile,hashlib,xml.etree.ElementTree as E,xml.parsers.expat as X,re,struct
x=json.load(sys.stdin);raw=base64.b64decode(x['source']);before=zipfile.ZipFile(io.BytesIO(raw));sha=lambda b:hashlib.sha256(b).hexdigest()
def at(root,path):
 for i in path.split('/'):root=list(root)[int(i)]
 return root
def local(z,raw,name):
 e=z.getinfo(name);start=e.header_offset;other=[i.header_offset for i in z.infolist() if i.header_offset>start];end=min(other) if other else z.start_dir
 return raw[start:end]
def mask(data,selected):
 p=X.ParserCreate();stack=[];positions={}
 def start(name,attrs):
  path=() if not stack else stack[-1][0]+(stack[-1][1],)
  if stack:stack[-1][1]+=1
  stack.append([path,0]);loc='/'.join(map(str,path))
  if loc in selected:positions[loc]=p.CurrentByteIndex
 def end(name):stack.pop()
 p.StartElementHandler=start;p.EndElementHandler=end;p.Parse(data,True)
 for path,start in sorted(positions.items(),key=lambda x:x[1],reverse=True):
  m=re.match(rb'<[^>]*(?:>).*?',data[start:],re.S);assert m
  # The test values contain encoded angle brackets, so > terminates this tag.
  end=data.index(b'>',start)+1;tag=data[start:end]
  for field in selected[path]:tag=re.sub(rb'\s+'+field.encode()+rb'\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27)',b'',tag)
  tag=re.sub(rb'\s+(?=/?>$)',b'',tag);data=data[:start]+tag+data[end:]
 return data
for case in x['cases']:
 output=base64.b64decode(case['output']);after=zipfile.ZipFile(io.BytesIO(output));receipt=case['receipt'];edits=case['edits'];assert before.namelist()==after.namelist()
 assert receipt['sourceSha256']==sha(raw) and receipt['outputSha256']==sha(output)
 assert receipt['selectedRecords']==len(edits) and receipt['keptUnlisted']==5-len(edits)
 changed={};count=0
 for edit in edits:
  part,path=edit['part'],edit['path'];a=at(E.fromstring(before.read(part)),path);b=at(E.fromstring(after.read(part)),path);expected=dict(a.attrib);fields=[]
  for k,v in edit['after'].items():
   if a.attrib.get(k)!=v:fields.append(k)
   if v is None:expected.pop(k,None)
   else:expected[k]=v
  assert b.attrib==expected
  if fields:changed.setdefault(part,{})[path]=fields;count+=1
 assert receipt['changedOccurrences']==count and set(receipt['changedParts'])==set(changed)
 assert len(receipt['members'])==len(before.namelist())
 for member in receipt['members']:
  name=member['part'];assert member['beforeSha256']==sha(before.read(name)) and member['afterSha256']==sha(after.read(name));assert member['changed']==(name in changed)
 for name in before.namelist():
  a,b=before.read(name),after.read(name)
  if name not in changed:assert a==b;assert local(before,raw,name)==local(after,output,name)
  else:
   assert mask(a,changed[name])==mask(b,changed[name]),name
   expected=E.fromstring(a)
   for e in (e for e in edits if e['part']==name):
    n=at(expected,e['path'])
    for k,v in e['after'].items():
     if v is None:n.attrib.pop(k,None)
     else:n.attrib[k]=v
   assert E.tostring(expected)==E.tostring(E.fromstring(b))
 if not changed:assert output==raw and receipt['noOpByteIdentical']
print(json.dumps({'cases':len(x['cases']),'ok':True}))
`;
test('review: independent XML and ZIP oracle verifies 64 selective occurrence batches',async()=>{
  const doc=await openDocument(source),cases=[];
  assert.deepEqual(doc.occurrences.map(o=>[o.part,o.path]),identities);
  assert.equal(doc.occurrences[0].mediaSha256,doc.occurrences[1].mediaSha256);
  assert.deepEqual(doc.occurrences[0].original,doc.occurrences[1].original);
  assert.notEqual(doc.occurrences[0].key,doc.occurrences[1].key);
  for(let code=0;code<64;code++){
    const p=makePacket(doc);p.records=p.records.filter((_,i)=>code&(1<<i));const edits=[];
    for(const r of p.records){const i=identities.findIndex(([part,path])=>r.part===part&&r.path===path),after=code&32?{descr:null,title:''}:{descr:`Occurrence ${i} & < > " ' 日本語 🧭\t\r\n`,title:null};
      r.edit={descr:after.descr===null?{action:'remove'}:{action:'set',value:after.descr},title:after.title===null?{action:'remove'}:{action:'set',value:after.title}};edits.push({part:r.part,path:r.path,after});
    }
    if(code%2)p.records.reverse();const before=clone(p),out=await applyReview(source,p);assert.deepEqual(p,before);
    cases.push({output:Buffer.from(out.bytes).toString('base64'),receipt:out.receipt,edits});
  }
  const run=spawnSync('python3',['-c',oracle],{input:JSON.stringify({source:source.toString('base64'),cases}),encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.deepEqual(JSON.parse(run.stdout),{cases:64,ok:true});
});

test('review: packet limits reject container expansion and Unicode limits preserve complete code points',async()=>{
  assert.throws(()=>parsePacket('['+'{},'.repeat(31000)+'{}]'));
  const doc=await openDocument(source),p=makePacket(doc);p.records=[p.records[0]];p.records[0].edit.descr={action:'set',value:'🧭'.repeat(1024)};
  const out=await applyReview(source,p);assert.equal((await openDocument(out.bytes)).occurrences[0].original.descr,'🧭'.repeat(1024));
  p.records[0].edit.descr.value+='a';await assert.rejects(applyReview(source,p),e=>e.code==='description-limit');
});

test('review: asynchronous application and receipt own the requested packet snapshot',async()=>{
  const doc=await openDocument(source),p=makePacket(doc);p.records=[p.records[0]];p.records[0].edit.descr={action:'set',value:'intent at invocation'};
  const expected=clone(p),pending=applyReview(source,p);p.records[0].edit.descr.value='mutation during awaits';
  const result=await pending;assert.equal(result.beforeAfter[0].after.descr,'intent at invocation');assert.deepEqual(result.packet,expected);
  p.records[0].edit.descr.value='mutation after return';assert.deepEqual(result.packet,expected);assert.equal(result.receipt.packetSha256,await sha256(encode(JSON.stringify(expected))));
  const shown=previewReview(doc,expected);shown.rows[0].before.descr='changed row';shown.packet.records[0].original.descr='changed preview packet';
  assert.equal(doc.occurrences[0].original.descr,'Status icon');assert.equal(expected.records[0].original.descr,'Status icon');
});

function pythonVariant(kind){
  const code=String.raw`import sys,json,base64,io,zipfile
x=json.load(sys.stdin);z=zipfile.ZipFile(io.BytesIO(base64.b64decode(x['source'])));out=io.BytesIO()
with zipfile.ZipFile(out,'w') as q:
 for info in z.infolist():
  data=z.read(info.filename)
  if x['kind']=='outside':
   if info.filename=='[Content_Types].xml':data=data.replace(b'</Types>',b'<Override PartName="/word/glossary/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml"/><Override PartName="/word/unused-header.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>')
   if info.filename=='word/_rels/document.xml.rels':data=data.replace(b'</Relationships>',b'<Relationship Id="rIdGlossary" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/glossaryDocument" Target="glossary/document.xml"/></Relationships>')
  elif info.filename=='word/document.xml':
   declaration=b' xmlns:descr="urn:unrelated" xmlns:title="urn:unrelated-title"' if x['kind']=='namespace' else b' xmlns:custom="urn:unrelated" custom:descr="competing"'
   data=data.replace(b'<wp:docPr ',b'<wp:docPr'+declaration+b' ',1)
  q.writestr(info,data)
 if x['kind']=='outside':
  q.writestr('word/glossary/document.xml',b'<w:glossaryDocument xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docParts/></w:glossaryDocument>')
  q.writestr('word/unused-header.xml',b'<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
print(base64.b64encode(out.getvalue()).decode())`;
  const run=spawnSync('python3',['-c',code],{input:JSON.stringify({source:source.toString('base64'),kind}),encoding:'utf8',timeout:10000,maxBuffer:1024*1024});assert.equal(run.status,0,run.stderr);return new Uint8Array(Buffer.from(run.stdout.trim(),'base64'));
}

test('review: registered glossary and unused header parts remain visible as unscanned evidence',async()=>{
  const bytes=pythonVariant('outside'),doc=await openDocument(bytes),expected=['word/glossary/document.xml','word/unused-header.xml'];
  assert.deepEqual(doc.outside,expected);assert.equal(doc.occurrences.length,5);assert.equal(doc.stories.length,3);
  const p=makePacket(doc);p.records=[p.records[1]];p.records[0].edit.descr={action:'set',value:'Selected context'};const out=await applyReview(bytes,p);
  assert.deepEqual(out.receipt.unscannedParts,expected);const html=reviewHTML(doc,out);for(const name of expected){assert.ok(html.includes(name));const m=out.receipt.members.find(m=>m.part===name);assert.equal(m.changed,false);assert.equal(m.beforeSha256,m.afterSha256);}
});

test('review: namespace declarations never masquerade as competing description attributes',async()=>{
  const doc=await openDocument(pythonVariant('namespace')),base=await openDocument(source);
  assert.equal(doc.occurrences.length,5);assert.equal(doc.exclusions.length,0);assert.deepEqual(doc.occurrences[0].originalAttributes,base.occurrences[0].originalAttributes);
  const competing=await openDocument(pythonVariant('competing'));assert.equal(competing.occurrences.length,4);assert.equal(competing.exclusions[0].reason,'extension-carrier');
});

test('review: successful packet-file import clears the input for same-file reselection',async()=>{
  const ui=await harness();try{
    await ui.load();const p=makePacket(await openDocument(source));p.records=[p.records[0]];p.records[0].edit.descr={action:'set',value:'Imported once'};
    ui.click('open-packet');ui.$('packet-file').value='C:\\fakepath\\review.json';ui.$('packet-file').files=[new File([JSON.stringify(p)],'review.json')];await ui.$('packet-file').onchange();
    assert.equal(ui.$('packet-file').value,'');assert.equal(ui.$('packet-dialog').open,false);assert.equal(ui.$('descr-value').value,'Imported once');
    ui.click('open-packet');ui.$('packet-file').value='C:\\fakepath\\review.json';await ui.$('packet-file').onchange();assert.equal(ui.$('packet-file').value,'');assert.equal(ui.$('packet-dialog').open,false);
  }finally{ui.cleanup();}
});

test('review: real malformed UTF-8 packet file retains the review while U+FFFD remains editable',async()=>{
  const ui=await harness();try{
    await ui.load();const p=makePacket(await openDocument(source));p.records=[p.records[0]];p.records[0].edit.descr={action:'set',value:'MARK'};const bad=Buffer.from(JSON.stringify(p));bad[bad.indexOf('MARK')]=255;
    ui.click('open-packet');ui.$('packet-file').files=[new File([bad],'invalid.json')];await ui.$('packet-file').onchange();assert.equal(ui.$('packet-dialog').open,true);assert.ok(ui.$('packet-error').textContent);assert.equal(ui.$('changed-count').textContent,0);
    p.records[0].edit.descr.value='\uFFFD';ui.$('packet-file').files=[new File([JSON.stringify(p)],'valid.json')];await ui.$('packet-file').onchange();assert.equal(ui.$('packet-dialog').open,false);assert.equal(ui.$('descr-value').value,'\uFFFD');
  }finally{ui.cleanup();}
});

test('review: independent oracle rejects an unlisted sibling edit even with refreshed hashes',async()=>{
  const doc=await openDocument(source),packet=makePacket(doc);packet.records=packet.records.slice(0,2);
  packet.records[0].edit.descr={action:'set',value:'Requested first edit'};packet.records[1].edit.descr={action:'set',value:'Unlisted second edit'};
  const out=await applyReview(source,packet),receipt=clone(out.receipt);
  // Keep the real output/member hashes but falsely claim that only the first
  // record was selected. Both records are in the same changed XML member.
  receipt.selectedRecords=1;receipt.changedOccurrences=1;receipt.keptUnlisted=4;
  const one={output:Buffer.from(out.bytes).toString('base64'),receipt,edits:[{part:identities[0][0],path:identities[0][1],after:{descr:'Requested first edit',title:'Status'}}]};
  const run=spawnSync('python3',['-c',oracle],{input:JSON.stringify({source:source.toString('base64'),cases:[one]}),encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
  assert.equal(run.status,1,run.stdout+run.stderr);assert.match(run.stderr,/AssertionError: word\/document.xml/);
});
