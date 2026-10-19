import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../backend/src/main/resources/bunpro/', import.meta.url);
const capture = JSON.parse(await readFile(process.argv[2] || new URL('../data/bunpro-n4-grammar/capture.json', import.meta.url), 'utf8'));
const source = JSON.parse(await readFile(new URL('n4-grammar-source.json',root),'utf8'));
const vocab = JSON.parse(await readFile(new URL('n4-vocab-capture.json',root),'utf8'));
const canonical = value => { const u=new URL(value); if(u.origin!=='https://bunpro.jp') throw new Error('Invalid source origin'); return `${u.origin}${u.pathname.replace(/[\[\]]/g,c=>encodeURIComponent(c))}`; };
const stableId = (kind,url) => `bunpro-${kind.toLowerCase()}-${createHash('sha256').update(canonical(url)).digest('hex').slice(0,24)}`;
const structureText = r => {
  // The capture's plain structure joins adjacent lines. Restore their boundaries
  // from the sanitized source fragment so alternative patterns remain readable.
  const html=r.sections?.find(s=>s.name==='details')?.html || '';
  const section=html.match(/<section\b[^>]*>([\s\S]*?)<\/section>/)?.[1];
  if(!section) return r.structure.replace(/^Structure\s*/,'');
  return section.replace(/<header\b[^>]*>[\s\S]*?<\/header>/g,'')
    .replace(/<(rt|rp)\b[^>]*>[\s\S]*?<\/\1>/g,'')
    .replace(/<\/(p|li)>|<br\s*\/?\s*>/g,'\n').replace(/<[^>]+>/g,'')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[e])
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
};
const tokens = (sentence,furigana) => {
  const result=[]; let offset=0;
  for(const f of Array.isArray(furigana)?furigana:[]) {
    const next=sentence.indexOf(f.text,offset);
    if(!f.text || next<0) continue;
    if(next>offset) result.push({text:sentence.slice(offset,next),reading:''});
    result.push({text:f.text,reading:f.reading || ''}); offset=next+f.text.length;
  }
  if(offset<sentence.length) result.push({text:sentence.slice(offset),reading:''});
  return result;
};
if(capture.scope!=='N4_GRAMMAR_ALL' || capture.entries.length!==source.expectedCount || capture.entries.some(e=>e.kind!=='GRAMMAR' || e.level!=='N4' || e.status!=='CAPTURED')) throw new Error('Incomplete N4 grammar capture');
const byUrl=new Map(capture.entries.map(e=>[canonical(e.sourceUrl),e]));
if(byUrl.size!==source.entries.length || source.entries.some(e=>!byUrl.has(canonical(e.url)))) throw new Error('Grammar source URL inventory mismatch');
const positions=new Map();
const entries=source.entries.map(item=>{
  const {result:r}=byUrl.get(canonical(item.url));
  if(!r.title || !r.meaning || !r.structure || !r.explanation || !r.examples?.length || r.examples.some(e=>!e.sentence || !e.translation)) throw new Error(`Incomplete content: ${item.title}`);
  const seen=new Set();
  const examples=r.examples.map(e=>{
    let id=e.sourceId;
    if(!id || seen.has(id)) id=`example-${createHash('sha256').update(e.sentence+'\n'+e.translation).digest('hex').slice(0,24)}`;
    if(seen.has(id)) throw new Error(`Duplicate grammar example: ${item.title}`);
    seen.add(id);
    return {id,sentence:e.sentence,reading:e.reading || '',tokens:tokens(e.sentence,e.furigana),translationEn:e.translation,notes:e.notes || '',type:e.type};
  });
  const position=(positions.get(item.lesson)||0)+1; positions.set(item.lesson,position);
  return {id:stableId('GRAMMAR',item.url),kind:'GRAMMAR',level:'N4',lesson:item.lesson,position,sourceUrl:canonical(item.url),content:{
    title:r.title,reading:r.reading || '',romaji:'',meaningEn:r.meaning,meaningVi:'',status:'DRAFT',structure:structureText(r),explanationVi:'',conjugationGroup:null,sentences:[],
    grammarSource:{explanationEn:r.explanation,examples,capturedAt:r.capturedAt,completeness:'NEEDS_REVIEW'},
  }};
});
positions.clear();
for(const item of vocab.entries) {
  const r=item.result,position=(positions.get(item.lesson)||0)+1;positions.set(item.lesson,position);
  entries.push({id:stableId('VOCAB',item.sourceUrl),kind:'VOCAB',level:'N4',lesson:item.lesson,position,sourceUrl:canonical(item.sourceUrl),content:{
    title:r.title,reading:r.reading || '',romaji:'',meaningEn:r.meaning,meaningVi:'',status:'DRAFT',structure:'',explanationVi:'',conjugationGroup:null,sentences:[],
  }});
}
if(new Set(entries.map(e=>e.sourceUrl)).size!==entries.length) throw new Error('Duplicate N4 identity');
const examples=entries.reduce((n,e)=>n+(e.content.grammarSource?.examples.length || 0),0);
if(examples!==capture.counts.examples) throw new Error('Grammar example count mismatch');
const snapshot={version:1,snapshotVersion:`bunpro-n4-${capture.runId}`,source:'https://bunpro.jp',capturedAt:capture.updatedAt,expectedVocab:vocab.entries.length,expectedGrammar:source.expectedCount,entries};
const output=new URL('n4.json',root); await writeFile(output,JSON.stringify(snapshot,null,2)+'\n');
console.log(`Saved ${snapshot.expectedVocab} vocab / ${snapshot.expectedGrammar} grammar / ${examples} grammar examples to ${fileURLToPath(output)}`);
