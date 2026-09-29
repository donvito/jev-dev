<script lang="ts">
  import { Plus, ChevronDown, ChevronRight, Trash2, Copy, GripVertical, Braces, ListFilter } from 'lucide-svelte';
  import type { Questions, Question } from './domain';
  let { value, onchange, onerror }: { value: Questions; onchange: (q:Questions)=>void; onerror:(message:string)=>void } = $props();
  let expanded = $state<string[]>(['technical_depth']);
  let editingId = $state('');
  let criteriaErrors = $state<Record<string,string>>({});
  function validateCriteria(id:string,text:string) {try{const criteria=JSON.parse(text);update(id,{criteria});delete criteriaErrors[id];renameError='';}catch{criteriaErrors[id]=`${id}: options must be valid JSON.`;renameError=criteriaErrors[id];}onerror(Object.values(criteriaErrors).join(' '));}
  let renameError = $state('');
  const toggle = (id:string) => expanded = expanded.includes(id) ? expanded.filter(x=>x!==id) : [...expanded,id];
  function update(id:string, patch:Partial<Question>) { onchange({...value, [id]:{...value[id], ...patch}}); }
  function add() { let id = 'new_question'; let n=2; while(value[id]) id=`new_question_${n++}`; onchange({...value,[id]:{type:'noul',instructions:'Does the state demonstrate the specified behavior?'}}); expanded=[...expanded,id]; }
  function remove(id:string) {delete criteriaErrors[id];onerror(Object.values(criteriaErrors).join(' '));const next={...value}; delete next[id]; onchange(next); }
  function duplicate(id:string) { let next=id+'_copy'; while(value[next]) next+='_copy'; onchange({...value,[next]:structuredClone(value[id])}); expanded=[...expanded,next]; }
  function rename(id:string,newId:string) { if(newId===id) return; if(!/^[a-zA-Z0-9_-]+$/.test(newId)||value[newId]) { renameError='Use a unique ID with letters, numbers, underscores, or hyphens.'; return; } const next=Object.fromEntries(Object.entries(value).map(([key,q])=>[key===id?newId:key,q])); expanded=expanded.map(x=>x===id?newId:x); onchange(next); editingId=''; renameError=''; }
  function changeType(id:string,type:Question['type']) { const old=value[id]; const q:Question={type,instructions:old.instructions}; if(type==='score') q.criteria=['No evidence','Limited evidence','Some evidence','Clear evidence','Strong evidence','Exceptional evidence']; if(type==='choice') q.criteria={option_a:'Description of the first choice',option_b:'Description of the second choice'}; onchange({...value,[id]:q}); }
  const content = (x:unknown) => typeof x==='string' ? x : JSON.stringify(x,null,2);
  function parseContent(text:string) { if (/^[\[{]/.test(text.trim())) { try { return JSON.parse(text); } catch { /* keep literal instruction text */ } } return text; }
</script>
<div class="questions-list">
  {#each Object.entries(value) as [id,q], i (id)}
    <div class="question-card" class:expanded={expanded.includes(id)}>
      <div class="question-top">
        <span class="question-number">{String(i+1).padStart(2,'0')}</span>
        <button class="question-name" onclick={()=>toggle(id)} title="Expand question">{id}</button>
        <span class="type-badge {q.type}">{q.type === 'noul' ? 'Noul' : q.type === 'score' ? 'Score' : 'Choice'}</span>
        <button class="icon-button chevron" aria-label={'Expand '+id} onclick={()=>toggle(id)}>{#if expanded.includes(id)}<ChevronDown size={14}/>{:else}<ChevronRight size={14}/>{/if}</button>
      </div>
      {#if expanded.includes(id)}
        <div class="question-body">
          <label class="field-label" for={'id-'+id}>QUESTION ID</label>
          <input id={'id-'+id} value={id} onchange={(e)=>rename(id,e.currentTarget.value)} class="id-input"/>
          {#if renameError}<p class="error-text">{renameError}</p>{/if}
          <div class="field-label type-label">QUESTION TYPE</div>
          <div class="type-picker">{#each ['score','choice','noul'] as type}<button class:chosen={q.type===type} onclick={()=>changeType(id,type as Question['type'])}>{#if type==='score'}<ListFilter size={13}/>{:else if type==='choice'}<Braces size={13}/>{:else}<span class="noul-symbol">◐</span>{/if}{type[0].toUpperCase()+type.slice(1)}</button>{/each}</div>
          <label class="field-label" for={'instructions-'+id}>INSTRUCTIONS</label>
          <textarea id={'instructions-'+id} rows={4} value={content(q.instructions)} oninput={(e)=>update(id,{instructions:parseContent(e.currentTarget.value)})} placeholder="Describe the judgment to make…"></textarea>
          {#if q.type==='score' && Array.isArray(q.criteria)}
            <div class="criteria-heading"><span class="field-label">RUBRIC LEVELS</span><span>{q.criteria.length} levels</span></div>
            <div class="rubric">{#each q.criteria as criterion,index}<div class="rubric-row"><span>{index}</span><textarea aria-label={'Level '+index+' for '+id} rows={1} value={content(criterion)} oninput={(e)=>{const criteria=[...(q.criteria as any[])];criteria[index]=parseContent(e.currentTarget.value);update(id,{criteria});}}></textarea><button class="icon-button remove-level" aria-label={'Remove level '+index} disabled={q.criteria.length<=2} onclick={()=>update(id,{criteria:(q.criteria as any[]).filter((_,n)=>n!==index)})}><Trash2 size={12}/></button></div>{/each}</div>
            <button class="subtle-add" disabled={q.criteria.length>=10} onclick={()=>update(id,{criteria:[...(q.criteria as any[]),'New level']})}><Plus size={12}/> Add level</button>
          {:else if q.type==='choice'}
            <label class="field-label" for={'criteria-'+id}>OPTIONS · JSON OBJECT</label><textarea class="mono" id={'criteria-'+id} rows={6} value={JSON.stringify(q.criteria,null,2)} oninput={(e)=>validateCriteria(id,e.currentTarget.value)}></textarea>
          {:else if q.type==='noul'}<div class="noul-help">Returns the probability of true, from 0 to 1.</div>{/if}
          <div class="question-actions"><button onclick={()=>duplicate(id)}><Copy size={12}/> Duplicate</button><button aria-label={'Delete '+id} onclick={()=>remove(id)}><Trash2 size={12}/> Remove</button></div>
        </div>
      {:else}<button class="question-preview" onclick={()=>toggle(id)}>{typeof q.instructions==='string'?q.instructions:'Structured instructions'}<span>{q.type==='score'&&Array.isArray(q.criteria)?`${q.criteria.length} rubric levels`:q.type==='choice'?`${Object.keys(q.criteria||{}).length} options`:'Probability of true'}</span></button>{/if}
    </div>
  {/each}
  <button class="add-question" onclick={add}><Plus size={15}/> Add question</button>
  <div class="questions-footnote"><span class="tiny-dot"></span> Questions run independently, in parallel.</div>
</div>
<style>
.questions-list{padding:18px;display:flex;flex-direction:column;gap:12px}.question-card{border:1px solid var(--border);border-radius:9px;background:var(--surface);overflow:hidden}.question-card.expanded{border-color:var(--border);box-shadow:0 2px 5px var(--shadow)}.question-top{display:flex;align-items:center;gap:9px;padding:14px 12px 10px}.question-number{font-size:10px;color:var(--text-muted);font-family:var(--mono)}.question-name{border:0;background:none;text-align:left;padding:0;font:500 11px var(--mono);color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.type-badge{font-size:10px;padding:3px 6px;border-radius:4px;background:var(--surface-hover);color:var(--text-muted);font-weight:500}.type-badge.score{background:var(--canvas);color:var(--text-muted)}.type-badge.noul{background:var(--surface-hover);color:var(--text-muted)}.chevron{padding:0!important}.question-body{padding:4px 14px 0}.field-label{font-size:9px;letter-spacing:.095em;font-weight:600;color:var(--text-muted);display:block;margin:13px 0 7px}.id-input{width:100%;font:11px var(--mono);padding:9px 10px;border:1px solid var(--border);border-radius:5px;background:var(--surface-subtle);color:var(--text-primary)}.type-picker{display:flex;gap:6px;margin:0 0 16px}.type-picker button{display:flex;align-items:center;justify-content:center;gap:5px;background:var(--surface);border:1px solid var(--border);font-size:11px;border-radius:5px;padding:6px 11px;color:var(--text-muted);flex:1}.type-picker button.chosen{background:var(--canvas);border-color:var(--border-strong);color:var(--text-secondary)}.noul-symbol{font-size:16px;line-height:12px}textarea{display:block;width:100%;resize:vertical;min-height:32px;padding:10px;font:11px/1.8 var(--font);border:1px solid var(--border);border-radius:5px;background:var(--surface-subtle);color:var(--text-secondary)}textarea.mono{font-family:var(--mono)}.criteria-heading{display:flex;justify-content:space-between;align-items:center}.criteria-heading>span:last-child{font-size:10px;color:var(--text-muted);margin-top:7px}.rubric{border:1px solid var(--border);border-radius:5px;overflow:hidden}.rubric-row{display:flex;align-items:center;gap:7px;position:relative;border-bottom:1px solid var(--border);padding:3px 6px}.rubric-row:last-child{border-bottom:0}.rubric-row>span{font:10px var(--mono);background:var(--canvas);color:var(--text-muted);width:20px;height:20px;display:grid;place-items:center;border-radius:4px;flex-shrink:0}.rubric-row textarea{border:0;background:transparent;line-height:1.5;padding:5px 0;resize:vertical;font-size:10px;min-height:27px}.remove-level{opacity:0;padding:3px!important}.rubric-row:hover .remove-level{opacity:1}.subtle-add{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text-muted);background:none;border:0;padding:9px 0}.question-actions{display:flex;justify-content:flex-end;gap:16px;padding:12px 0;border-top:1px solid var(--border);margin-top:10px}.question-actions button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--text-muted);font-size:10px}.question-actions button:hover{color:var(--text-secondary)}.question-preview{border:0;background:transparent;display:block;text-align:left;width:100%;padding:0 14px 13px 35px;font:11px/1.7 var(--font);color:var(--text-muted)}.question-preview>span{display:block;font-size:9px;color:var(--text-muted);margin-top:8px}.add-question{width:100%;border:1px dashed var(--border);background:var(--surface-subtle);border-radius:6px;display:flex;justify-content:center;align-items:center;gap:7px;color:var(--text-muted);font-size:11px;padding:12px}.add-question:hover{background:var(--surface-hover)}.questions-footnote{display:flex;align-items:center;justify-content:center;gap:6px;font-size:9px;color:var(--text-muted);margin:10px 0}.tiny-dot{width:4px;height:4px;background:var(--chart-fill);border-radius:50%}.noul-help{background:var(--surface-subtle);padding:12px;font-size:11px;line-height:1.7;color:var(--text-muted);border-radius:6px;margin:10px 0}
</style>
