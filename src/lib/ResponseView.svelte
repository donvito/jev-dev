<script lang="ts">
  import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronsDownUp } from 'lucide-svelte';
  import type { Answer, Question, Questions, TypeSafeResponse } from './domain';
  import { scoreLevels, scorePosition, formattedProbability as percent } from './response-distribution';
  interface Props { response:TypeSafeResponse|null; questions?:Questions; requestedModel?:string; latencyMs?:number|null; example?:boolean; running?:boolean }
  let { response, questions={}, requestedModel, latencyMs, example=false, running=false }:Props=$props();
  let expanded=$state<string[]>([]);
  const rows=$derived(Object.keys({...questions,...response?.answers}));
  const allExpanded=$derived(rows.length>0&&rows.every(id=>expanded.includes(id)));
  const synthetic=$derived(example||response?.synthetic===true||response?.model==='synthetic-demo');
  const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
  const probability=(v:unknown):v is number=>finite(v)&&v>=0&&v<=1;
  const numeric=(v:unknown)=>finite(v)?v.toFixed(2).replace(/\.?0+$/,''):'—';
  const safeText=(v:unknown):string=>{if(typeof v==='string')return v;if(v===undefined)return '—';try{return JSON.stringify(v,null,2)??String(v);}catch{return String(v);}};
  const toggle=(id:string)=>{expanded=expanded.includes(id)?expanded.filter(k=>k!==id):[...expanded,id];};
  const toggleAll=()=>{expanded=allExpanded?[]:[...rows];};
  function choiceOptions(q?:Question,a?:Answer):{key:string;value:number|undefined}[]{
    const names=new Set([...Object.keys(isObject(q?.criteria)?q.criteria:{}),...Object.keys(a?.probabilities??{}),...(typeof a?.choice==='string'?[a.choice]:[])]);
    return [...names].map(key=>({key,value:a?.probabilities?.[key]})).sort((x,y)=>(probability(y.value)?y.value:-1)-(probability(x.value)?x.value:-1)||Number(y.key===a?.choice)-Number(x.key===a?.choice));
  }
  function criterion(q:Question|undefined,a:Answer|undefined,key:string):unknown{
    if(Array.isArray(q?.criteria))return q.criteria[Number(key)]??a?.legend?.[key];
    if(isObject(q?.criteria))return q.criteria[key]??a?.legend?.[key];
    return a?.legend?.[key];
  }
  const criterionText=(value:unknown)=>value===null||value===undefined?'—':typeof value==='string'?value:JSON.stringify(value);
</script>

{#snippet structured(value:unknown,depth:number)}
  {#if typeof value==='string'}<span class="instruction-text">{value}</span>
  {:else if depth<4&&Array.isArray(value)}<ol class="structured-array">{#each value as item}<li>{@render structured(item,depth+1)}</li>{/each}</ol>
  {:else if depth<4&&isObject(value)}<div class="structured-object">{#each Object.entries(value) as [key,item]}<div class="structured-field"><span class="instruction-key">{key}:</span><div>{@render structured(item,depth+1)}</div></div>{/each}</div>
  {:else}<span class="structured-literal">{safeText(value)}</span>{/if}
{/snippet}

{#snippet ring(value:unknown,winner:boolean)}
  <svg class="probability-ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--chart-track)" stroke-width="2.5"/>{#if probability(value)}<circle cx="8" cy="8" r="5.5" fill="none" stroke={winner?'var(--text-primary)':'var(--chart-fill)'} stroke-width="2.5" pathLength="100" stroke-dasharray={`${value*100} 100`} transform="rotate(-90 8 8)"/>{/if}</svg>
{/snippet}

{#snippet expandAll()}
  <button class="expand-row expand-all" aria-label={allExpanded?'Collapse all results':'Expand all results'} title={allExpanded?'Collapse all results':'Expand all results'} onclick={toggleAll}>{#if allExpanded}<ChevronsDownUp size={14}/>{:else}<ChevronsUpDown size={14}/>{/if}</button>
{/snippet}

{#snippet distribution(id:string,question:Question|undefined,answer:Answer|undefined,keys:string[],isScore:boolean)}
  {@const position=isScore?scorePosition(answer?.score,keys):null}
  <div class="distribution-grid" role="group" aria-label={`${id} probability distribution`}>
    <div class="distribution-labels">
      {#each keys as key}
        {@const description=criterionText(criterion(question,answer,key))}
        <div class="rubric-label" class:choice-label={!isScore} title={description}>
          {#if !isScore}<span class="distribution-key">{key}</span>{/if}
          <span class="criterion-description">{description}</span>
        </div>
      {/each}
    </div>
    <div class="distribution-values" class:score-distribution={isScore}>
      {#if isScore&&keys.length>1}<div class="score-axis" aria-hidden="true">{#if position!==null}<span class="score-marker" style={`top:${position*100}%`} title={`Score: ${numeric(answer?.score)}`}></span>{/if}</div>{/if}
      {#each keys as key}
        {@const value=answer?.probabilities?.[key]}
        <div class="probability-row" class:has-probability={probability(value)&&value>0} class:winning-option={!isScore&&key===answer?.choice} aria-label={`${isScore?'Level ':''}${key}: ${percent(value)}`}>
          {#if isScore}<span class="level-number">{key}</span><span class="axis-tick" aria-hidden="true"></span>{/if}
          <span class="distribution-track" class:unavailable-track={!probability(value)} aria-hidden="true">{#if probability(value)}<span class="distribution-fill" style={`width:${value*100}%`}></span>{/if}</span>
          <span class="distribution-probability">{percent(value)}</span>
        </div>
      {/each}
    </div>
    {#if !keys.length}<span class="distribution-empty unavailable">Distribution unavailable</span>{/if}
    <div class="distribution-confidence confidence">Confidence: <span>{percent(answer?.confidence)}</span></div>
  </div>
{/snippet}

<div class="response-results">
  {#if running}<div class="response-message" role="status"><span class="spinner"></span>Evaluating questions…</div>
  {:else if !response}<div class="response-message">No response yet. Run an evaluation to inspect results.</div>
  {:else}
    {#if synthetic}<div class="synthetic-note">Synthetic demo · illustrative values, not model predictions</div>{/if}
    <div class="compact-meta"><span class="model-name">{response.model}</span>{#if finite(latencyMs)}<span>{latencyMs} ms</span>{/if}{@render expandAll()}</div>
    <table class="response-table" aria-label="Evaluation results">
      <colgroup><col class="key-column"/><col class="result-column"/><col class="primitive-column"/></colgroup>
      <thead><tr><th scope="col"><div class="key-heading">{@render expandAll()}<span>Key &amp; instructions</span></div></th><th scope="col"><div class="result-heading"><span class="model-name" title={requestedModel?`Requested: ${requestedModel}`:undefined}>{response.model}</span>{#if finite(latencyMs)}<span class="latency">{latencyMs} ms</span>{/if}</div></th><th scope="col">Primitive type</th></tr></thead>
      <tbody>
        {#each rows as id (id)}
          {@const answer=response.answers[id]}
          {@const question=questions[id]}
          {@const type=answer?.type??question?.type}
          {@const levels=type==='score'?scoreLevels(question,answer):[]}
          {@const options=type==='choice'?choiceOptions(question,answer):[]}
          {@const isExpanded=expanded.includes(id)}
          <tr class="result-row" class:expanded={isExpanded}>
            <td class="question-cell"><div class="question-heading"><button class="expand-row" aria-label={`${isExpanded?'Collapse':'Expand'} ${id}`} aria-expanded={isExpanded} onclick={()=>toggle(id)}>{#if isExpanded}<ChevronDown size={13}/>{:else}<ChevronRight size={13}/>{/if}</button><span class="question-id">{id}</span></div><div class="instructions">{#if question?.instructions!==undefined}{@render structured(question.instructions,0)}{:else}<span class="unavailable">Instructions unavailable</span>{/if}</div></td>
            <td class="result-cell">
              {#if !answer}<span class="unavailable">No answer returned</span>
              {:else if type==='score'}<div class="score-result"><strong>{numeric(answer.score)}</strong>{#if levels.length}<span>of {levels[levels.length-1]}</span>{/if}</div>{#if !isExpanded}<div class="confidence">Confidence: <span>{percent(answer.confidence)}</span></div>{/if}
              {:else if type==='noul'}<div class="noul-result" title="P(true): probability the answer is true">{#if probability(answer.noul)}<strong>{percent(answer.noul)}</strong><span>true</span>{:else}<span class="unavailable">Probability unavailable</span>{/if}</div>{#if probability(answer.noul)}<div class="noul-track" aria-label={`P(true): ${percent(answer.noul)}`}><span class="probability-diamond" style={`left:${answer.noul*100}%`}></span></div>{#if isExpanded}<div class="noul-result false-result"><strong>{percent(1-answer.noul)}</strong><span>false</span></div>{/if}{/if}
              {:else if type==='choice'}{#if isExpanded}<div class="selected-choice">{answer.choice??'—'}</div>{:else}{#if answer.choice&&!options.slice(0,3).some(option=>option.key===answer.choice)}<div class="selected-choice">{answer.choice}</div>{/if}<div class="choice-options">{#each options.slice(0,3) as option}<div class="choice-option" class:winner={option.key===answer.choice}><span class="option-key">{option.key}</span><span class="option-probability">{percent(option.value)}</span>{@render ring(option.value,option.key===answer.choice)}</div>{/each}</div>{#if !options.length}<span class="unavailable">Options unavailable</span>{/if}<div class="confidence">Confidence: <span>{percent(answer.confidence)}</span></div>{/if}
              {:else}<span class="unavailable">Unsupported answer type</span>{/if}
            </td>
            <td class="primitive-cell"><strong>{type==='noul'?'Noul':type==='score'?'Score':type==='choice'?'Choice':'Unknown'}</strong>{#if type==='score'}<span>{levels.length?`${levels.length} levels · ${levels[0]}–${levels[levels.length-1]}`:'Levels unavailable'}</span>{:else if type==='choice'}<span>{options.length?`${options.length} option${options.length===1?'':'s'}`:'Options unavailable'}</span>{:else if type==='noul'}<span>P(true)</span>{/if}</td>
          </tr>
          {#if isExpanded}<tr class="details-row"><td colspan="3">
            {#if type==='noul'}<div class="noul-criteria">{#each ['true','false'] as key}<div><strong>{key==='true'?'True':'False'}</strong><div>{#if criterion(question,answer,key)!=null}{@render structured(criterion(question,answer,key),0)}{:else}<span class="unavailable">—</span>{/if}</div></div>{/each}</div>
            {:else if type==='score'||type==='choice'}{@render distribution(id,question,answer,type==='score'?levels:options.map(option=>option.key),type==='score')}{/if}
          </td></tr>{/if}
        {/each}
      </tbody>
    </table>
    {#if !rows.length}<div class="response-message">No answers returned.</div>{/if}
  {/if}
</div>

<style>
.response-results{container:response-results / inline-size;width:100%;min-width:0;color:var(--text-primary);background:var(--surface);font-size:12px}
.response-table{width:100%;border-collapse:collapse;table-layout:fixed;text-align:left}.key-column{width:46%}.result-column{width:36%}.primitive-column{width:18%}
.response-table>thead th{padding:12px 14px;border-bottom:1px solid var(--border);background:var(--surface-subtle);font-size:11px;color:var(--text-secondary);font-weight:500;vertical-align:top}.result-heading{display:flex;flex-wrap:wrap;align-items:baseline;gap:5px 10px}.model-name{font:11px/1.5 var(--mono,monospace);color:var(--text-primary);overflow-wrap:anywhere}.latency{font-size:10px;color:var(--text-muted);white-space:nowrap}
.result-row>td{padding:17px 14px;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:anywhere}.result-row.expanded>td{border-bottom:0}.question-heading{display:flex;align-items:flex-start;gap:7px;min-width:0}.question-id{font:500 13px/1.6 var(--mono,monospace);color:var(--text-primary);overflow-wrap:anywhere;min-width:0}.expand-row{display:inline-flex;align-items:center;justify-content:center;width:17px;height:18px;padding:0;flex-shrink:0;color:var(--text-secondary);border:0;border-radius:2px;background:transparent}.expand-row:hover{background:var(--surface-hover);color:var(--text-primary)}.instructions{margin:7px 0 0 24px;font-size:12px;line-height:1.65;color:var(--text-secondary);overflow-wrap:anywhere}
.instruction-text{font-style:italic;white-space:pre-wrap;overflow-wrap:anywhere}.structured-object{display:flex;flex-direction:column;gap:4px;min-width:0}.structured-field{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 6px;min-width:0}.structured-field>div{flex:1 1 130px;min-width:0}.instruction-key{font:500 10px/1.7 var(--mono,monospace);color:var(--text-secondary);overflow-wrap:anywhere}.structured-array{margin:0;padding-left:17px}.structured-array>li{margin:2px 0}.structured-literal{white-space:pre-wrap;font:10px/1.7 var(--mono,monospace);overflow-wrap:anywhere}
.score-result,.noul-result{display:flex;align-items:baseline;gap:5px;font-size:13px;line-height:1.55;color:var(--text-secondary)}.score-result strong,.noul-result strong{font:500 17px/1.5 var(--mono,monospace);color:var(--text-primary)}.confidence{margin-top:7px;font-size:10px;color:var(--text-muted);line-height:1.5}.confidence>span{color:var(--text-secondary);margin-left:4px;font-family:var(--mono,monospace)}.noul-track{height:3px;position:relative;background:var(--chart-track);margin:13px 5px 4px;max-width:220px}.probability-diamond{position:absolute;top:50%;width:8px;height:8px;background:var(--text-primary);border:1px solid var(--surface);transform:translate(-50%,-50%) rotate(45deg)}
.selected-choice{font:500 12px/1.55 var(--mono,monospace);color:var(--text-primary);overflow-wrap:anywhere;margin-bottom:7px}.choice-options{display:flex;flex-direction:column;gap:7px}.choice-option{display:grid;grid-template-columns:minmax(0,1fr) auto 14px;align-items:start;gap:7px;color:var(--text-muted);font:12px/1.55 var(--mono,monospace)}.choice-option.winner{color:var(--text-primary);font-weight:600}.option-key{overflow-wrap:anywhere;min-width:0}.option-probability{white-space:nowrap;font-size:12px}.probability-ring{width:14px;height:14px;margin-top:1px}.primitive-cell{text-align:right}.response-table>thead th:last-child{text-align:right}.primitive-cell>strong{display:inline-block;padding:2px 6px;background:var(--surface-hover);font-size:12px;font-weight:500;line-height:1.55;color:var(--text-primary)}.primitive-cell>span{display:block;font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.6}
/* Keep the expanded rubric aligned with the question and result columns. */
.key-heading{display:flex;align-items:center;gap:7px}.compact-meta .expand-all{margin-left:auto}.false-result{margin-top:14px}.false-result strong{font-size:15px}.result-row.expanded,.details-row{background:var(--surface-subtle)}
.details-row>td{padding:0 0 16px;border-bottom:1px solid var(--border)}.distribution-grid{--distribution-row-height:30px;display:grid;grid-template-columns:46% 36% 18%;min-width:0;padding-top:2px}.distribution-labels{grid-column:1;min-width:0;padding:0 14px 0 38px}.distribution-values{grid-column:2;min-width:0;position:relative;padding:0 14px}.rubric-label{height:var(--distribution-row-height);display:flex;align-items:center;gap:10px;min-width:0;color:var(--text-secondary);font-size:11px;line-height:1.6}.criterion-description{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.distribution-key{font:11px/1.6 var(--mono,monospace);color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1}.choice-label{display:grid;grid-template-columns:minmax(100px,42%) minmax(0,1fr);gap:12px}.choice-label .criterion-description{font-size:10px;color:var(--text-muted)}
.probability-row{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:6px;align-items:center;height:var(--distribution-row-height);position:relative;min-width:0;color:var(--text-muted);font:11px/1.5 var(--mono,monospace)}.score-distribution .probability-row{grid-template-columns:18px 16px minmax(0,1fr) 44px}.level-number{text-align:left}.axis-tick{height:1px;width:9px;justify-self:center;background:var(--border-strong)}.score-axis{position:absolute;z-index:1;top:calc(var(--distribution-row-height)/2);bottom:calc(var(--distribution-row-height)/2);left:46px;width:1px;background:var(--border-strong)}.score-marker{position:absolute;left:50%;width:8px;height:8px;background:var(--text-primary);border:1px solid var(--surface-subtle);transform:translate(-50%,-50%) rotate(45deg);z-index:2}
.distribution-track{height:3px;display:block;background:var(--chart-track);position:relative;min-width:0}.distribution-fill{display:block;height:100%;background:var(--chart-fill)}.has-probability .distribution-probability{color:var(--text-primary)}.winning-option .distribution-fill{background:var(--text-primary)}.winning-option .distribution-probability{font-weight:600}.unavailable-track{background:transparent;border-top:1px dashed var(--border)}.distribution-probability{text-align:right;white-space:nowrap}.distribution-confidence{grid-column:2;padding:0 14px;margin-top:10px;font-size:11px}.distribution-empty{grid-column:1 / 3;padding:0 14px 0 38px}.noul-criteria{display:flex;flex-direction:column;gap:7px;padding:2px 14px 0 38px;font-size:11px;line-height:1.6}.noul-criteria>div{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;color:var(--text-secondary)}.noul-criteria strong{font-weight:400}.noul-criteria .instruction-text{font-style:normal}

.unavailable{font-size:11px;color:var(--text-muted)}.synthetic-note{padding:8px 14px;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:10px;line-height:1.5}.response-message{padding:18px 14px;color:var(--text-secondary);font-size:11px;line-height:1.65;display:flex;align-items:center;gap:8px}.spinner{width:12px;height:12px;border:1px solid var(--border);border-top-color:var(--border-strong);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}.compact-meta{display:none}@keyframes spin{to{transform:rotate(360deg)}}
@container response-results (max-width:649px){
.compact-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px 12px;padding:9px 12px;border-bottom:1px solid var(--border);background:var(--surface-subtle);font-size:10px;color:var(--text-muted)}.response-table,.response-table>tbody{display:block;width:100%}.response-table>colgroup,.response-table>thead{display:none}.result-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(65px,27%);width:100%;border-bottom:1px solid var(--border)}.result-row.expanded{border-bottom:0}.result-row>td{display:block;border:0;padding:12px;min-width:0}.result-row>.question-cell{grid-column:1 / -1;padding-bottom:7px}.result-row>.result-cell{grid-column:1;padding-top:5px;padding-left:36px}.result-row>.primitive-cell{grid-column:2;padding-top:5px;padding-left:0}.question-id{font-size:10px}.instructions{margin-top:5px;font-size:10px}.primitive-cell>strong{font-size:11px}.primitive-cell>span{font-size:9px;margin-top:3px}.choice-option{font-size:9px;gap:5px}.option-probability{font-size:9px}.details-row,.details-row>td{display:block;width:100%}.details-row>td{padding:0 0 14px}.distribution-grid{grid-template-columns:minmax(0,42%) minmax(0,58%);--distribution-row-height:28px}.distribution-labels{padding:0 6px 0 36px}.distribution-values{padding:0 12px 0 6px}.rubric-label{font-size:10px}.probability-row{font-size:10px;grid-template-columns:minmax(0,1fr) 38px;gap:4px}.score-distribution .probability-row{grid-template-columns:14px 12px minmax(0,1fr) 38px}.score-axis{left:30px}.score-marker{width:7px;height:7px}.choice-label{display:flex}.choice-label .criterion-description{display:none}.distribution-key{font-size:10px}.distribution-confidence{grid-column:1 / -1;padding-left:36px;font-size:10px}.noul-criteria{padding-left:36px;font-size:10px}.false-result{margin-top:12px}
}

@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
