<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { applyTheme, isThemePreference, readThemePreference, saveThemePreference, resolveTheme, type ThemePreference } from './lib/theme';
  import { FlaskConical, PanelLeft, Play, Database, Folder, History, Settings, ChevronDown, ChevronRight, Plus, Check, ArrowUpRight, ArrowRight, BookOpen, MoreHorizontal, CircleHelp, LockKeyhole, Save, Download, X, Search, Copy, GitBranch, ArrowLeft, Clock3, FileJson, Braces, AlignLeft, Upload, ShieldCheck, CheckCheck, Circle, AlertTriangle, ExternalLink, RotateCcw, Columns3, Command, Sparkles, Maximize2, Minimize2, Sun, Moon } from 'lucide-svelte';
  import CodeEditor from './lib/CodeEditor.svelte';
  import QuestionEditor from './lib/QuestionEditor.svelte';
  import ResponseView from './lib/ResponseView.svelte';
  import RecentRuns from './lib/RecentRuns.svelte';
  import DatasetView from './lib/DatasetView.svelte';
  import Experiments from './lib/Experiments.svelte';
  import { createSeedWorkspace, generateDemoResponse, validateRequest, lintQuestions, importDataset, exportCode } from './lib/domain';
  import type { Request, Questions, Run, Project, Session, Dataset, TypeSafeResponse } from './lib/domain';
  import { openDocumentation, desktop, loadWorkspace, saveWorkspace, listRuns, saveRun, executeLive, download, errorMessage } from './lib/storage';
  import { readExecutionMode, saveExecutionMode, type ExecutionMode } from './lib/execution-mode';
  import { UNFILED_PROJECT_ID, sessionProjectId, relatedSessionIds } from './lib/session-organization';
  type Page = 'Playground'|'Experiments'|'Datasets'|'Projects'|'History'|'Settings';
  const nav = [{name:'Playground',icon:FlaskConical},{name:'Experiments',icon:Play},{name:'Datasets',icon:Database},{name:'Projects',icon:Folder},{name:'History',icon:History}] as const;
  const seed = createSeedWorkspace();
  let experimentPanel: { openCreate: (type?: 'evaluation' | 'repeatability' | 'comparison', preferredDatasetId?: string) => void } | undefined;
  const datasetFormatExample = JSON.stringify([
    {id:'ticket_001',state:{message:'Our production integration is unavailable.'}},
    {id:'ticket_002',state:{message:'Could you send this month’s invoice?'}}
  ],null,2);
  async function experimentForDataset(dataset:Dataset) { page='Experiments';await tick();experimentPanel?.openCreate('evaluation',dataset.id); }
  function useCurrentDatasetState() { try { const state=stateMode==='text'?stateText:JSON.parse(stateText);datasetText=JSON.stringify([{id:'example_01',state}],null,2);importError=''; }catch{importError='Fix the Playground state JSON before using it in a dataset.';} }

  let themePreference = $state<ThemePreference>(readThemePreference());
  let systemDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = $derived(resolveTheme(themePreference, systemDark));
  $effect(() => {
    applyTheme(themePreference, resolvedTheme);
    if(!loading)saveThemePreference(themePreference);
    if(desktop)void getCurrentWindow().setTheme(themePreference==='system'?null:resolvedTheme).catch(reason=>console.warn('Window appearance could not be updated', reason));
  });
  onMount(() => {
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const update=(event:MediaQueryListEvent)=>systemDark=event.matches;
    media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  });
  let projects = $state<Project[]>(seed.projects), sessions = $state<Session[]>(seed.sessions), datasets = $state<Dataset[]>(seed.datasets);
  let runs = $state<Run[]>([]), experiments = $state<any[]>([]);
  let page = $state<Page>('Playground'), activeProjectId = $state(UNFILED_PROJECT_ID), activeSessionId = $state<string>(crypto.randomUUID());
  let sessionName = $state('Untitled session'), stateText = $state('{}'), questionsText = $state('{}');
  let model = $state(seed.sessions[0].requested_model), mode = $state<ExecutionMode>('demo');
  let stateMode = $state<'visual'|'json'|'text'>('json'), questionMode = $state<'visual'|'json'>('json'), responseMode = $state<'visual'|'json'>('json');
  let response = $state<TypeSafeResponse|null>(null);
  let responseRequest = $state<Request|null>(null);
  let responseLatency = $state<number|null>(null);
  let responseExpanded = $state(false);
  let isExample = $state(false), running = $state(false), error = $state(''), toast = $state(''), loading = $state(true), credentialExists = $state(false), persisted = $state(true);
  let currentRun = $state<Run|null>(null), apiKey = $state(''), keyBusy = $state(false), showProjectMenu = $state(false), showSessionMenu = $state(false), historySearch = $state('');
  let modal = $state<''|'export'|'new-project'|'move-session'|'dataset'|'compare'|'help'>('');
  let moveDestination = $state(UNFILED_PROJECT_ID), moveProjectName = $state('');
  let exportFormat = $state<'json'|'typescript'|'python'|'curl'>('json'), projectName = $state(''), projectDescription = $state(''), datasetName = $state(''), datasetText = $state(''), importError = $state('');
  let selectedDataset = $state<Dataset|null>(null), compareRun = $state<Run|null>(null), showWarnings = $state(false);
  let toastTimer: ReturnType<typeof setTimeout>;
  let canPersist = $state(false);
  let sidebarCollapsed = $state(false), wrapCode = $state(true);
  let historyList = $state<{focusSearch:()=>void}>();
  let activeHistoryRunId = $state<string|null>(null);
  let draftRunIds = $state<Record<string,string>>({});
  let projectViewRunIds = $state<Record<string,string|null>>({});
  let runningViewKey = $state<string|null>(null);
  const runningHere = $derived(running && viewKey()===runningViewKey);
  let workbenchElement = $state<HTMLElement>();
  let paneWidths = $state([.32,.36,.32]);
  let resizeBoundary:number|null=null;
  let resizeStartX=0, resizeStartWidths=[.32,.36,.32];
  function startResize(event:PointerEvent,boundary:number) {event.preventDefault();resizeBoundary=boundary;resizeStartX=event.clientX;resizeStartWidths=[...paneWidths];(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
  function moveResize(event:PointerEvent) {if(resizeBoundary===null||!workbenchElement)return;const delta=(event.clientX-resizeStartX)/workbenchElement.clientWidth;const left=resizeBoundary;const right=left+1;const adjusted=Math.max(-resizeStartWidths[left]+.2,Math.min(delta,resizeStartWidths[right]-.2));paneWidths=resizeStartWidths.map((v,i)=>i===left?v+adjusted:i===right?v-adjusted:v);}
  function resizeKey(event:KeyboardEvent,boundary:number) {if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const delta=event.key==='ArrowLeft'?-.02:.02;const next=[...paneWidths];if(next[boundary]+delta<.2||next[boundary+1]-delta<.2)return;next[boundary]+=delta;next[boundary+1]-=delta;paneWidths=next;}
  function formatJSON(target:'state'|'questions') {try{if(target==='state'){stateText=JSON.stringify(JSON.parse(stateText),null,2);stateMode='json';}else{questionsText=JSON.stringify(JSON.parse(questionsText),null,2);}error='';}catch{error=`Invalid ${target} JSON.`;}}

  type Draft = {projectId?:string;sessionName:string;stateText:string;questionsText:string;model:string;stateMode:'visual'|'json'|'text'};
  let drafts = $state<Record<string,Draft>>({});
  let projectDraftIds = $state<Record<string,string>>({});
  let sessionProjectIds = $state<Record<string,string>>({});
  let sessionFamilyIds = $state<Record<string,string>>({});
  let renamingSession = $state(false);
  let editorErrors = $state<Record<string,string>>({});
  let questionEditorError = $state('');
  let dialogElement = $state<HTMLDivElement>();
  function focusDialog(node:HTMLDivElement) { const previous=document.activeElement as HTMLElement;queueMicrotask(()=>node.querySelector<HTMLElement>('button,input,textarea,select,a')?.focus());return{destroy:()=>previous?.focus()}; }
  function trapFocus(event:KeyboardEvent) { if(event.key!=='Tab')return;const nodes=[...dialogElement!.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]')];const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();} }
  function draftValue():Draft {return {projectId:activeProjectId,sessionName,stateText,questionsText,model,stateMode};}
  function draftKey() {return activeHistoryRunId?`run:${activeHistoryRunId}`:activeSessionId;}
  function viewKey() {return draftKey();}
  function keepDraft() {
    drafts={...drafts,[draftKey()]:draftValue()};
    if(!activeHistoryRunId)projectDraftIds={...projectDraftIds,[activeProjectId]:activeSessionId};
    projectViewRunIds={...projectViewRunIds,[activeProjectId]:activeHistoryRunId};
  }
  function showRunResponse(run:Run|null) {
    currentRun=run;response=run?.response_json??null;responseRequest=run?.request_json??null;
    responseLatency=run?.latency_ms??null;isExample=false;
    error=run?.status==='error'?errorMessage(run.error_json):'';
  }
  async function focusHistory() {sidebarCollapsed=false;await tick();historyList?.focusSearch();}

  function clearEditorErrors() {editorErrors={};questionEditorError='';}
  const activeProject = $derived(projects.find(p=>p.id===activeProjectId));
  function runProjectId(run:Run) {return sessionProjectId(run.session_id,run.project_id,sessionProjectIds)||UNFILED_PROJECT_ID;}
  const projectSessions = $derived(sessions.filter(s=>s.project_id===activeProjectId));
  const pendingQuestionSets = $derived(Object.entries({...drafts,...(!activeHistoryRunId?{[activeSessionId]:draftValue()}:{})}).filter(([id,draft])=>!id.startsWith('run:')&&!sessions.some(session=>session.id===id)&&(draft.projectId===activeProjectId||!draft.projectId&&projectDraftIds[activeProjectId]===id)));
  const projectRuns = $derived(runs.filter(r=>runProjectId(r)===activeProjectId));
  const historyLabels = $derived(Object.fromEntries(projectRuns.map(run=>[run.id,activeHistoryRunId===run.id?sessionName:drafts[`run:${run.id}`]?.sessionName||run.name])));
  function sameJSON(a:unknown,b:unknown):boolean {
    if(a===b)return true;
    if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameJSON(value,b[index]));
    const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
    return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.hasOwn(right,key)&&sameJSON(left[key],right[key]));
  }
  function runWasEdited(run:Run):boolean {
    const edit=activeHistoryRunId===run.id?draftValue():drafts[`run:${run.id}`];if(!edit)return false;
    if(edit.sessionName!==run.name||edit.model!==run.requested_model)return true;
    try{return !sameJSON(edit.stateMode==='text'?edit.stateText:JSON.parse(edit.stateText),run.request_json.state)||!sameJSON(JSON.parse(edit.questionsText),run.request_json.questions);}
    catch{return true;}
  }
  const modifiedHistoryRunIds = $derived(projectRuns.filter(runWasEdited).map(run=>run.id));
  const parsedQuestions = $derived.by(()=>{try{const q=JSON.parse(questionsText);return q&&typeof q==='object'&&!Array.isArray(q)&&Object.values(q).every((v:any)=>v&&typeof v==='object'&&['noul','choice','score'].includes(v.type))?q as Questions:null;}catch{return null;}});
  const parsedState = $derived.by(()=>{try{return JSON.parse(stateText);}catch{return null;}});
  const warnings = $derived(parsedQuestions ? lintQuestions(parsedQuestions,parsedState) : []);
  const responseDraftChanged = $derived(!!response && !!responseRequest && (!sameJSON(stateMode==='text'?stateText:parsedState,responseRequest.state)||!sameJSON(parsedQuestions,responseRequest.questions)||model!==responseRequest.model));
  const filteredRuns = $derived(projectRuns.filter(r=>(r.name+' '+r.requested_model+' '+r.status+' '+r.id).toLowerCase().includes(historySearch.toLowerCase())));
  const exportText = $derived.by(()=>{try { return exportCode(makeRequest(),exportFormat); } catch { return 'Fix the request validation errors before exporting.'; }});
  const savedSession = $derived(sessions.find(s=>s.id===activeSessionId));
  const changed = $derived(!savedSession || stateText!==JSON.stringify(savedSession.state_json,null,2) || questionsText!==JSON.stringify(savedSession.questions_json,null,2) || model!==savedSession.requested_model || sessionName!==savedSession.name);
  function notify(text:string) { toast=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast='',4000); }
  function makeRequest():Request { const inputErrors=[...Object.values(editorErrors),questionEditorError].filter(Boolean);if(inputErrors.length)throw new Error(inputErrors.join('\n'));let state; let questions; try{state=stateMode==='text'?stateText:JSON.parse(stateText);}catch{throw new Error('State is not valid JSON. Fix the syntax or switch to text.');} try{questions=JSON.parse(questionsText);}catch{throw new Error('Questions are not valid JSON.');} const request={state,model,questions};const errors=validateRequest(request);if(errors.length)throw new Error(errors.join('\n'));return request; }
  function snapshot() { return {version:1,projects,sessions,datasets,experiments,activeProjectId,activeSessionId,sessionProjectIds,sessionFamilyIds,projectDraftIds:activeHistoryRunId?projectDraftIds:{...projectDraftIds,[activeProjectId]:activeSessionId},drafts:{...drafts,[draftKey()]:draftValue()},draft:draftValue(),activeHistoryRunId,draftRunIds,projectViewRunIds:{...projectViewRunIds,[activeProjectId]:activeHistoryRunId},uiVersion:2,preferences:{sidebarCollapsed,wrapCode,paneWidths,questionMode,responseMode,theme:themePreference,executionMode:mode}}; }
  async function persist() { if(loading||!canPersist)return false;persisted=false;try{await saveWorkspace(snapshot());persisted=true;return true;}catch(e){error='Unable to save locally: '+errorMessage(e);return false;} }
  $effect(()=>{if(!loading&&canPersist){const copy=JSON.stringify(snapshot());const timer=setTimeout(()=>{void copy;void persist();},500);return()=>clearTimeout(timer);}});
  onMount(()=>{(async()=>{let savedMode:unknown;try{const stored=await loadWorkspace();if(stored){if(!Array.isArray(stored.projects)||!Array.isArray(stored.sessions)||!Array.isArray(stored.datasets))throw new Error('Stored workspace is invalid. Autosave is disabled to protect your data.');projects=stored.projects;sessions=stored.sessions;datasets=stored.datasets;experiments=stored.experiments||[];drafts=stored.drafts||{};projectDraftIds=stored.projectDraftIds||{};sessionFamilyIds=Object.fromEntries(Object.entries(stored.sessionFamilyIds||{}).filter(([,id])=>typeof id==='string'&&id.trim())) as Record<string,string>;sessionProjectIds=Object.fromEntries(Object.entries(stored.sessionProjectIds||{}).filter(([,id])=>typeof id==='string'&&(id===UNFILED_PROJECT_ID||projects.some(project=>project.id===id)))) as Record<string,string>;activeHistoryRunId=stored.activeHistoryRunId||null;draftRunIds=stored.draftRunIds||{};projectViewRunIds=stored.projectViewRunIds||{};activeProjectId=projects.some(project=>project.id===stored.activeProjectId)?stored.activeProjectId:UNFILED_PROJECT_ID;activeSessionId=stored.activeSessionId||crypto.randomUUID();const s=sessions.find(s=>s.id===activeSessionId);if(stored.draft){({sessionName,stateText,questionsText,model,stateMode}=stored.draft);}else if(s){loadSession(s,false);}if(stored.uiVersion!==2&&stateMode!=='text')stateMode='json';if(stored.preferences){savedMode=stored.preferences.executionMode;if(isThemePreference(stored.preferences.theme))themePreference=readThemePreference(stored.preferences.theme);({sidebarCollapsed,wrapCode,paneWidths}=stored.preferences);questionMode=stored.preferences.questionMode||'json';responseMode=stored.preferences.responseMode||'json';}response=null;isExample=false;}canPersist=true;}catch(e){error='Could not load local data. Autosave is disabled: '+errorMessage(e);}try{runs=await listRuns();const rememberedRun=activeHistoryRunId||draftRunIds[activeSessionId];if(rememberedRun){const restored=runs.find(r=>r.id===rememberedRun)??null;showRunResponse(restored);}}catch(e){error='Could not load run history: '+errorMessage(e);}if(desktop){try{const settings=await invoke<{credential_exists:boolean}>('get_settings');credentialExists=settings.credential_exists;}catch(e){error='Credential store unavailable: '+errorMessage(e);}}mode=readExecutionMode(desktop&&credentialExists,savedMode);loading=false;})();return()=>clearTimeout(toastTimer);});
  function loadSession(session:Session, preserve=true) {if(preserve)keepDraft();activeHistoryRunId=null;activeSessionId=session.id;const draft=drafts[session.id];if(draft){({sessionName,stateText,questionsText,model,stateMode}=draft);}else{sessionName=session.name;stateText=JSON.stringify(session.state_json,null,2);stateMode='json';questionsText=JSON.stringify(session.questions_json,null,2);model=session.requested_model;}response=null;isExample=false;currentRun=null;error='';clearEditorErrors();showSessionMenu=false;}
  function changeProject(id:string) {
    keepDraft();selectedDataset=null;showProjectMenu=false;showSessionMenu=false;
    const previousPage=page;
    const rememberedRun=runs.find(run=>runProjectId(run)===id&&run.id===projectViewRunIds[id]);
    if(rememberedRun){restore(rememberedRun,false,true);page=previousPage;return;}
    activeHistoryRunId=null;activeProjectId=id;
    const rememberedId=projectDraftIds[id];
    const candidate=rememberedId?drafts[rememberedId]:null;
    const remembered=candidate&&(!candidate.projectId||candidate.projectId===id)?candidate:null;
    const session=sessions.find(session=>session.id===rememberedId&&session.project_id===id)||[...sessions].reverse().find(session=>session.project_id===id);
    if(remembered){activeSessionId=rememberedId;({sessionName,stateText,questionsText,model,stateMode}=remembered);showRunResponse(null);clearEditorErrors();}
    else if(session)loadSession(session,false);
    else{activeSessionId=crypto.randomUUID();sessionName='Untitled session';stateText='{}';questionsText='{}';stateMode='json';questionMode='json';showRunResponse(null);clearEditorErrors();}
  }

  function openQuestionSet(id:string) {
    const saved=drafts[id];if(!saved)return;keepDraft();activeHistoryRunId=null;activeSessionId=id;
    ({sessionName,stateText,questionsText,model,stateMode}=saved);clearEditorErrors();showSessionMenu=false;
    showRunResponse(runs.find(run=>run.id===draftRunIds[id])??null);
  }
  async function newSession() {
    if(loading)return;
    keepDraft();
    activeProjectId=UNFILED_PROJECT_ID;selectedDataset=null;
    activeHistoryRunId=null;activeSessionId=crypto.randomUUID();sessionName='Untitled session';
    stateText='{}';questionsText='{}';stateMode='json';questionMode='json';responseMode='json';
    showRunResponse(null);clearEditorErrors();showWarnings=false;responseExpanded=false;
    renamingSession=false;showSessionMenu=false;showProjectMenu=false;modal='';page='Playground';
    keepDraft();void persist();
    await tick();workbenchElement?.querySelector<HTMLElement>('[aria-label="State editor"]')?.focus();
  }

  function openMoveSession() {
    moveDestination=activeProjectId===UNFILED_PROJECT_ID?(projects[0]?.id||'__new__'):activeProjectId;
    moveProjectName='';modal='move-session';
  }
  async function moveSession() {
    if(loading)return;
    let destination=moveDestination;
    if(destination==='__new__') {
      if(!moveProjectName.trim())return;
      destination=crypto.randomUUID();
      projects=[...projects,{id:destination,name:moveProjectName.trim(),description:'',created_at:new Date().toISOString()}];
    }
    if(destination!==UNFILED_PROJECT_ID&&!projects.some(project=>project.id===destination))return;
    keepDraft();
    const movedSessionId=activeSessionId;
    const movedSessionIds=new Set(relatedSessionIds(movedSessionId,sessionFamilyIds,runs,draftRunIds));
    const movedRunIds=new Set(runs.filter(run=>movedSessionIds.has(run.session_id)).map(run=>run.id));
    // Organization is mutable workspace metadata; original run snapshots stay intact.
    sessionProjectIds={...sessionProjectIds,...Object.fromEntries([...movedSessionIds].map(id=>[id,destination]))};
    sessions=sessions.map(session=>movedSessionIds.has(session.id)?{...session,project_id:destination}:session);
    drafts=Object.fromEntries(Object.entries(drafts).map(([id,draft])=>[id,movedSessionIds.has(id)||id.startsWith('run:')&&movedRunIds.has(id.slice(4))?{...draft,projectId:destination}:draft]));
    projectDraftIds=Object.fromEntries(Object.entries(projectDraftIds).filter(([,id])=>!movedSessionIds.has(id)));
    projectViewRunIds=Object.fromEntries(Object.entries(projectViewRunIds).filter(([,id])=>!id||!movedRunIds.has(id)));
    activeProjectId=destination;selectedDataset=null;showProjectMenu=false;showSessionMenu=false;modal='';
    projectDraftIds={...projectDraftIds,[destination]:movedSessionId};
    keepDraft();
    if(await persist())notify(destination===UNFILED_PROJECT_ID?'Session moved out of project':`Session moved to ${projects.find(project=>project.id===destination)?.name}`);
  }

  async function saveSession() {if(!canPersist){error='Local storage is unavailable. Export your draft before retrying.';return;}try{const request=makeRequest();const now=new Date().toISOString();const prior=sessions.find(s=>s.id===activeSessionId);const newSession:Session={id:crypto.randomUUID(),project_id:activeProjectId,name:sessionName.trim()||'Untitled session',state_json:request.state,questions_json:request.questions,requested_model:model,version:prior?(prior.version||1)+1:1,created_at:now,updated_at:now};keepDraft();sessionFamilyIds={...sessionFamilyIds,[newSession.id]:sessionFamilyIds[activeSessionId]||activeSessionId};sessions=[...sessions,newSession];activeHistoryRunId=null;activeSessionId=newSession.id;if(currentRun)draftRunIds={...draftRunIds,[newSession.id]:currentRun.id};sessionName=newSession.name;stateText=JSON.stringify(request.state,null,2);if(stateMode==='text')stateMode='json';questionsText=JSON.stringify(request.questions,null,2);if(await persist())notify(`Question set saved · v${newSession.version}`);}catch(e){error=errorMessage(e);}}
  function setExecutionMode(next:ExecutionMode) {
    if(next==='live'&&(!desktop||!credentialExists)){error=desktop?'Add your TypeSafe API key in Settings first.':'Live API requests require the desktop app.';return;}
    mode=next;saveExecutionMode(next);void persist();
  }
  async function execute(request:Request,repetition=0) {if(mode==='live'){if(!credentialExists)throw new Error('Add your TypeSafe API key in Settings first.');return executeLive(request);}const start=performance.now();await new Promise(resolve=>setTimeout(resolve,350));return {response:generateDemoResponse(request,repetition),latency_ms:Math.round(performance.now()-start)};}
  async function runRequest() {
    if(running||loading)return;error='';let request:Request;
    try{request=makeRequest();}catch(e){error=errorMessage(e);return;}
    keepDraft();running=true;isExample=false;const originViewKey=viewKey();runningViewKey=originViewKey;
    const sourceDraftKey=draftKey();const started=performance.now();
    const run:Run={id:crypto.randomUUID(),session_id:activeSessionId,project_id:activeProjectId,name:sessionName,request_json:structuredClone(request),response_json:null,requested_model:model,resolved_model:null,latency_ms:0,input_tokens:null,output_tokens:null,status:'success',error_json:null,created_at:new Date().toISOString(),source:mode};
    try{
      const result=await execute(request);run.response_json=result.response;run.resolved_model=result.response.model;
      run.latency_ms=result.latency_ms;run.input_tokens=result.response.usage?.input_tokens??null;run.output_tokens=result.response.usage?.output_tokens??null;
    }catch(e){run.status='error';run.error_json=typeof e==='object'?e:{message:errorMessage(e)};run.latency_ms=Math.round(performance.now()-started);}
    if(viewKey()===originViewKey){showRunResponse(run);activeHistoryRunId=run.id;}
    try{
      await saveRun(run);runs=[run,...runs];draftRunIds={...draftRunIds,[sourceDraftKey]:run.id};
      if(run.status==='success')notify('Run complete · snapshot saved locally');
    }catch(e){error='Run finished, but could not save the snapshot: '+errorMessage(e);}
    finally{running=false;runningViewKey=null;}
  }
  function restore(run:Run,fork=false,preferDraft=false) {
    keepDraft();clearEditorErrors();activeProjectId=runProjectId(run);
    activeSessionId=fork?crypto.randomUUID():run.session_id;activeHistoryRunId=fork?null:run.id;
    const draft=preferDraft?drafts[`run:${run.id}`]:null;
    if(draft){({sessionName,stateText,questionsText,model,stateMode}=draft);}
    else{sessionName=run.name+(fork?' (fork)':'');stateText=JSON.stringify(run.request_json.state,null,2);stateMode='json';questionsText=JSON.stringify(run.request_json.questions,null,2);model=run.requested_model;}
    showRunResponse(fork?null:run);page='Playground';showSessionMenu=false;showProjectMenu=false;
    if(fork||!preferDraft)notify(fork?'New draft forked from run':'Run restored · original snapshot preserved');
  }
  function createProject() {if(!projectName.trim())return;const p={id:crypto.randomUUID(),name:projectName.trim(),description:projectDescription.trim(),created_at:new Date().toISOString()};projects=[...projects,p];changeProject(p.id);projectName='';projectDescription='';modal='';page='Playground';notify('Project created');}
  async function readDataset(event:Event) {const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{const text=await file.text();const rows=importDataset(text,file.name);const d:Dataset={id:crypto.randomUUID(),project_id:activeProjectId,name:file.name,rows,created_at:new Date().toISOString()};datasets=[...datasets,d];selectedDataset=d;notify(`Imported ${rows.length} dataset rows`);}catch(e){error=errorMessage(e);}(event.target as HTMLInputElement).value='';}
  function createDataset() {try{const rows=importDataset(datasetText,'dataset.jsonl');if(!datasetName.trim())throw new Error('Give the dataset a name.');const d:Dataset={id:crypto.randomUUID(),project_id:activeProjectId,name:datasetName,rows,created_at:new Date().toISOString()};datasets=[...datasets,d];selectedDataset=d;modal='';datasetText='';datasetName='';importError='';notify(`Dataset created with ${rows.length} rows`);}catch(e){importError=errorMessage(e);}}
  async function setKey() {if(!apiKey.trim())return;keyBusy=true;try{await invoke('save_api_key',{apiKey:apiKey.trim()});apiKey='';credentialExists=true;setExecutionMode('live');notify('API key saved · Live API enabled');}catch(e){error=errorMessage(e);}finally{keyBusy=false;}}
  async function removeKey() {try{await invoke('delete_api_key');credentialExists=false;setExecutionMode('demo');notify('API key removed');}catch(e){error=errorMessage(e);}}
  function updateStateField(key:string,value:string) {stateText=JSON.stringify({...parsedState,[key]:value},null,2);}
  function setStateMode(next:'visual'|'json'|'text') { if(Object.keys(editorErrors).length){error='Fix the invalid state fields before switching modes.';return;}if(next===stateMode)return;if(next==='visual'&&Array.isArray(parsedState)){stateMode='json';notify('Array states are edited as JSON to preserve their structure.');return;}if(stateMode==='text')stateText=JSON.stringify(stateText,null,2);else if(next==='text')stateText=typeof parsedState==='string'?parsedState:stateText;stateMode=next;}
  async function copy(text:string) {try{await navigator.clipboard.writeText(text);notify('Copied to clipboard');}catch{notify('Clipboard unavailable. Use Download instead.');}}
  const date=(s:string)=>new Date(s).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  function keyboard(event:KeyboardEvent) {if((event.metaKey||event.ctrlKey)&&event.key==='1'){event.preventDefault();page='Playground';}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&page==='Playground'){event.preventDefault();void runRequest();}if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();void saveSession();}if(event.key==='Escape'){if(!modal)responseExpanded=false;modal='';showProjectMenu=false;showSessionMenu=false;}}
</script>

<svelte:window onkeydown={keyboard} onpointermove={moveResize} onpointerup={()=>resizeBoundary=null}/>
<div class="app-shell" class:sidebar-collapsed={sidebarCollapsed}>
  <aside class="sidebar">
    <a class="brand" href="/" onclick={(e)=>{e.preventDefault();page='Playground';}}><span class="brand-mark">j<span>✳</span></span><span>jev <span class="brand-suffix">dev</span></span><span class="version-label">BETA</span></a>
    <button class="sidebar-new-session" aria-label="New session" title="New session" disabled={loading} onclick={newSession}><Plus size={15}/><span>New session</span></button>
    <nav>{#each nav as item}<button class:active={page===item.name} onclick={()=>{page=item.name;error='';}}><item.icon size={16} strokeWidth={1.6}/><span>{item.name}</span>{#if item.name==='Playground'}<span class="nav-shortcut">⌘ 1</span>{/if}{#if item.name==='Experiments'&&experiments.length>0}<span class="nav-count">{experiments.length}</span>{/if}</button>{/each}</nav>
    <div class="projects-nav-label"><span class="nav-label">PROJECTS</span><button class="icon-button" aria-label="New project" onclick={()=>modal='new-project'}><Plus size={13}/></button></div>
    <div class="project-nav"><button class:selected={activeProjectId===UNFILED_PROJECT_ID} onclick={()=>changeProject(UNFILED_PROJECT_ID)}><Circle size={9}/>No project{#if activeProjectId===UNFILED_PROJECT_ID}<span class="project-selected-dot"></span>{/if}</button>{#each projects as p,i}<button class:selected={p.id===activeProjectId} onclick={()=>changeProject(p.id)}><span class="project-dot" style={'background:'+['#777777','#999999','#555555','#aaaaaa'][i%4]}></span>{p.name}{#if p.id===activeProjectId}<span class="project-selected-dot"></span>{/if}</button>{/each}</div>
    {#if page==='Playground'}<div class="playground-history"><RecentRuns bind:this={historyList} runs={projectRuns} selectedRunId={activeHistoryRunId} onselect={run=>restore(run,false,true)} labels={historyLabels} modifiedRunIds={modifiedHistoryRunIds}/></div>{/if}
    <div class="sidebar-bottom"><button class:active={page==='Settings'} onclick={()=>{page='Settings';error='';}}><Settings size={16} strokeWidth={1.6}/> Settings {#if credentialExists}<span class="connected-indicator"></span>{/if}</button><button onclick={()=>modal='help'}><CircleHelp size={16} strokeWidth={1.6}/> Help & documentation <ArrowUpRight size={12}/></button><div class="sidebar-footer"><span class="live-dot"></span><span>Local</span><span class="footer-version">v0.1.0</span></div></div>
  </aside>
  <main>
    <header class="topbar"><div class="breadcrumbs"><button class="icon-button sidebar-toggle" aria-label="Toggle sidebar" title="Toggle sidebar" onclick={()=>sidebarCollapsed=!sidebarCollapsed}><PanelLeft size={15}/></button><span class="breadcrumb-divider"></span><span>{page}</span><ChevronRight size={12}/><div class="menu-wrap"><button class="project-breadcrumb" onclick={()=>showProjectMenu=!showProjectMenu}>{activeProject?.name||'No project'}<ChevronDown size={11}/></button>{#if showProjectMenu}<div class="dropdown"><button onclick={()=>changeProject(UNFILED_PROJECT_ID)}><Circle size={13}/>No project{#if activeProjectId===UNFILED_PROJECT_ID}<Check size={12}/>{/if}</button>{#each projects as p}<button onclick={()=>changeProject(p.id)}><Folder size={13}/>{p.name}{#if p.id===activeProjectId}<Check size={12}/>{/if}</button>{/each}<button onclick={()=>{modal='new-project';showProjectMenu=false;}}><Plus size={13}/> New project</button></div>{/if}</div></div><div class="topbar-right"><button class="icon-button theme-toggle" aria-label={resolvedTheme==='dark'?'Switch to light mode':'Switch to dark mode'} title={resolvedTheme==='dark'?'Switch to light mode':'Switch to dark mode'} onclick={()=>themePreference=resolvedTheme==='dark'?'light':'dark'}>{#if resolvedTheme==='dark'}<Sun size={15}/>{:else}<Moon size={15}/>{/if}</button><span class="local-status"><span class="live-dot"></span>{desktop?'Local workspace':'Browser preview'}</span><button class="icon-button" aria-label="Help" onclick={()=>modal='help'}><CircleHelp size={15}/></button></div></header>
    {#if error}<div class="error-banner" role="alert"><AlertTriangle size={15}/><span>{error}</span><button class="icon-button" aria-label="Dismiss error" onclick={()=>error=''}><X size={14}/></button></div>{/if}
    <div class="page-area" class:playground-area={page==='Playground'}>
      {#if page==='Playground'}
        <div class="workbench-toolbar"><div class="session-area"><Folder size={13}/><div class="menu-wrap">{#if renamingSession}<input class="session-name-input" aria-label="Session name" bind:value={sessionName} onkeydown={e=>{if(e.key==='Enter')renamingSession=false;}} onblur={()=>renamingSession=false}/>{:else}<button class="session-button" onclick={()=>showSessionMenu=!showSessionMenu}>{sessionName}<ChevronDown size={11}/></button>{/if}{#if showSessionMenu}<div class="dropdown sessions-dropdown">{#each projectSessions as s}<button onclick={()=>loadSession(s)}>{s.name}<span class="version-chip">v{s.version}</span></button>{/each}{#each pendingQuestionSets as [id,entry]}<button onclick={()=>openQuestionSet(id)}>{entry.sessionName}</button>{/each}<button onclick={newSession} disabled={loading}><Plus size={12}/> New session</button></div>{/if}</div><span class="version-chip">v{savedSession?.version||1}</span>{#if changed}<span class="unsaved-dot" title="Draft differs from saved version"></span>{/if}<button class="icon-button" aria-label="Rename session" title="Rename session" onclick={()=>renamingSession=!renamingSession}><Braces size={12}/></button></div><div class="toolbar-right"><button class="btn" onclick={openMoveSession} disabled={loading}><Folder size={12}/>Move to project</button><button class="btn" onclick={saveSession} title="Save new version (⌘S)"><Save size={12}/>Save</button><button class="btn" onclick={()=>modal='export'}><Download size={12}/>Export</button><button class="btn" onclick={()=>page='Experiments'}><FlaskConical size={12}/>Experiment</button></div></div>
        <section class="workbench" class:response-expanded={responseExpanded} bind:this={workbenchElement} style={responseExpanded?'grid-template-columns: minmax(0, 1fr)':'grid-template-columns: minmax(180px,'+paneWidths[0]+'fr) 4px minmax(200px,'+paneWidths[1]+'fr) 4px minmax(260px,'+paneWidths[2]+'fr)'}>
          <div class="pane state-pane"><div class="pane-header"><div><h2>State</h2></div><div class="pane-tools"><div class="segmented"><button class:chosen={stateMode==='json'} onclick={()=>setStateMode('json')}>JSON</button><button class:chosen={stateMode==='text'} onclick={()=>setStateMode('text')}>Text</button><button class:chosen={stateMode==='visual'} onclick={()=>setStateMode('visual')}>Visual</button></div><button class="icon-button" aria-label="Format state JSON" title="Format JSON" onclick={()=>formatJSON('state')}><Braces size={12}/></button><button class="icon-button" aria-label="Copy state" title="Copy state" onclick={()=>copy(stateText)}><Copy size={12}/></button></div></div>
            <div class="pane-body" class:visual-body={stateMode==='visual'}>{#if stateMode==='json'||stateMode==='text'}<CodeEditor value={stateText} onchange={value=>stateText=value} label="State editor" language={stateMode==='text'?'text':'json'} wrap={wrapCode}/>{:else if parsedState&&typeof parsedState==='object'&&!Array.isArray(parsedState)}<div class="state-body">{#each Object.entries(parsedState) as [key,value]}<div class="state-field"><div class="state-field-header"><span class="mono">{key}</span><span class="string-tag">{typeof value==='string'?'string':'json'}</span></div>{#if typeof value==='string'}<textarea class="state-textarea" class:short-field={value.length<150} class:long-field={value.length>=150} aria-label={'State field '+key} value={value} oninput={e=>updateStateField(key,e.currentTarget.value)} spellcheck={false}></textarea>{:else}<textarea class="state-textarea mono" aria-label={'State field '+key} value={JSON.stringify(value,null,2)} oninput={e=>{try{stateText=JSON.stringify({...parsedState,[key]:JSON.parse(e.currentTarget.value)},null,2);delete editorErrors[key];error='';}catch{editorErrors[key]=`${key}: invalid JSON`;error=editorErrors[key];}}}></textarea>{/if}</div>{/each}{#if Object.keys(parsedState).length===0}<div class="empty-inline"><button class="btn" onclick={()=>stateText=JSON.stringify({text:''},null,2)}><Plus size={12}/> Add field</button></div>{/if}</div>{:else}<CodeEditor value={stateText} onchange={value=>stateText=value} label="State editor" language="json" wrap={wrapCode}/>{/if}</div>
            <div class="pane-footer"><span>{stateMode==='text'?'Plain text':parsedState===null?'Invalid JSON':'JSON'} · {stateText.split('\n').length} lines</span><span>{stateText.length.toLocaleString()} chars</span></div>
          </div>
          <!-- Focusable separators implement the WAI-ARIA window splitter pattern. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div class="pane-splitter" role="separator" aria-label="Resize state and questions" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="60" aria-valuenow={Math.round(paneWidths[0]*100)} tabindex="0" onpointerdown={e=>startResize(e,0)} onkeydown={e=>resizeKey(e,0)}></div>
          <div class="pane questions-pane"><div class="pane-header"><div><h2>Questions</h2><span class="count-pill">{parsedQuestions?Object.keys(parsedQuestions).length:0}</span></div><div class="pane-tools"><div class="segmented"><button class:chosen={questionMode==='json'} onclick={()=>{questionMode='json';questionEditorError='';}}>JSON</button><button class:chosen={questionMode==='visual'} onclick={()=>questionMode='visual'}>Visual</button></div><button class="icon-button" aria-label="Format questions JSON" title="Format JSON" onclick={()=>formatJSON('questions')}><Braces size={12}/></button><button class="icon-button" aria-label="Copy questions" title="Copy questions" onclick={()=>copy(questionsText)}><Copy size={12}/></button></div></div>
            <div class="pane-body">{#if questionMode==='json'}<CodeEditor value={questionsText} onchange={value=>questionsText=value} label="Questions JSON" wrap={wrapCode}/>{:else if parsedQuestions}<QuestionEditor value={parsedQuestions} onerror={message=>questionEditorError=message} onchange={q=>questionsText=JSON.stringify(q,null,2)}/>{:else}<div class="empty-inline"><p>Invalid question structure.</p><button class="btn" onclick={()=>questionMode='json'}>Edit JSON</button></div>{/if}</div>
            <div class="pane-footer"><button class="linter-status" class:warning={warnings.length>0||!parsedQuestions} onclick={()=>showWarnings=!showWarnings}>{#if !parsedQuestions}<AlertTriangle size={11}/>Invalid questions{:else if warnings.length}<AlertTriangle size={11}/>{warnings.length} lint warnings{:else}<Check size={11}/>Valid{/if}</button><span>{questionsText.split('\n').length} lines</span></div>
          </div>
          <!-- Focusable separators implement the WAI-ARIA window splitter pattern. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div class="pane-splitter" role="separator" aria-label="Resize questions and response" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="60" aria-valuenow={Math.round(paneWidths[2]*100)} tabindex="0" onpointerdown={e=>startResize(e,1)} onkeydown={e=>resizeKey(e,1)}></div>
          <div class="pane response-pane"><div class="pane-header"><div><h2>Response</h2>{#if response}<span class="response-status">{isExample?'example':response.model==='synthetic-demo'?'demo':'200'}</span>{/if}</div><div class="pane-tools"><div class="segmented"><button class:chosen={responseMode==='json'} onclick={()=>responseMode='json'}>JSON</button><button class:chosen={responseMode==='visual'} onclick={()=>responseMode='visual'}>Overview</button></div><button class="icon-button" aria-label="Copy response JSON" title="Copy response" disabled={!response} onclick={()=>copy(JSON.stringify(response,null,2))}><Copy size={12}/></button><button class="icon-button" aria-label={responseExpanded?"Restore editor layout":"Expand response"} title={responseExpanded?"Restore editor layout":"Expand response"} onclick={()=>responseExpanded=!responseExpanded}>{#if responseExpanded}<Minimize2 size={13}/>{:else}<Maximize2 size={13}/>{/if}</button></div></div>
            <div class="pane-body">{#if runningHere}<div class="tool-empty">Running evaluation…</div>{:else if responseMode==='json'}<CodeEditor value={response?JSON.stringify(response,null,2):''} readonly label="Response JSON" wrap={wrapCode}/>{:else}<ResponseView {response} questions={responseRequest?.questions||{}} requestedModel={responseRequest?.model} latencyMs={responseLatency} example={isExample} running={runningHere}/>{/if}</div>
            <div class="pane-footer"><span>{response?.model||'No response'}{#if response&&responseLatency!==null} · {responseLatency} ms{/if}</span><span title={responseDraftChanged?'Inputs have changed. Run again to update the response.':undefined}>{responseDraftChanged?'Inputs changed':response?.usage?.input_tokens!==null&&response?.usage?.input_tokens!==undefined?`${response.usage.input_tokens} input tokens`:isExample?'Synthetic example':currentRun?'Saved':''}</span></div>
          </div>
        </section>
        {#if showWarnings&&warnings.length}<div class="warning-panel">{#each warnings as warning}<p><AlertTriangle size={12}/><strong>{warning.questionId}</strong> {warning.message}</p>{/each}</div>{/if}
        <div class="run-toolbar"><div class="run-config"><label class="mode-select"><span class="live-dot" class:demo={mode==='demo'}></span><select aria-label="Execution mode" value={mode} disabled={loading||running} onchange={event=>setExecutionMode(event.currentTarget.value as ExecutionMode)}><option value="demo">Demo</option><option value="live" disabled={!desktop||!credentialExists}>Live API</option></select></label><span class="toolbar-divider"></span><label class="model-select"><span>Model</span><input aria-label="Requested model" bind:value={model}/></label><button class="icon-button" class:wrap-active={wrapCode} aria-label="Toggle line wrapping" title="Toggle line wrapping" onclick={()=>wrapCode=!wrapCode}><AlignLeft size={13}/></button></div><div class="run-actions"><span class="run-meta">{currentRun?`${currentRun.status} · ${date(currentRun.created_at)}`:mode==='demo'?'Synthetic responses':'Ready'}</span><button class="btn primary run-button" disabled={running||loading} onclick={runRequest}><Play size={11} fill="currentColor"/>{running?'Running…':'Run'}<kbd>⌘ ↵</kbd></button></div></div>
        <div class="tool-statusbar"><button onclick={focusHistory}><History size={11}/> History <span>{projectRuns.length}</span></button><span>{!canPersist?'Storage unavailable':persisted?'Saved locally':'Saving…'} · {desktop?'SQLite':'Browser storage'}</span></div>
      {:else if page==='Datasets'}
        {#if !selectedDataset}<div class="page-heading"><div><h1>Datasets</h1></div><div class="heading-actions"><button class="btn" onclick={()=>{modal='dataset';importError='';}}><Plus size={14}/> Create dataset</button><label class="btn primary upload-button"><Upload size={14}/> Import CSV / JSONL<input type="file" accept=".csv,.jsonl,.json" onchange={readDataset}/></label></div></div>{/if}
        {#if selectedDataset}<DatasetView dataset={selectedDataset} onback={()=>selectedDataset=null} oncopy={copy} onexperiment={()=>experimentForDataset(selectedDataset!)} onexport={()=>download(selectedDataset!.name.replace(/\.(csv|jsonl|json)$/,'')+'.jsonl',selectedDataset!.rows.map(r=>JSON.stringify(r)).join('\n'),'application/x-ndjson')}/>
        {:else}<div class="dataset-grid">{#each datasets.filter(d=>d.project_id===activeProjectId) as dataset}<button class="dataset-card" onclick={()=>selectedDataset=dataset}><div><span class="dataset-icon"><Database size={20}/></span><span class="small-badge">{dataset.id==='dataset-resumes-demo'?'SYNTHETIC':'LOCAL'}</span></div><h2>{dataset.name}</h2><p>{dataset.rows.length} examples · {dataset.rows.filter(r=>Object.keys(r.expected||{}).length).length} labeled</p><footer><span>{new Date(dataset.created_at).toLocaleDateString()}</span><ArrowUpRight size={14}/></footer></button>{/each}<button class="dataset-card create-card" onclick={()=>{modal='dataset';importError='';}}><Plus size={22}/><h2>Create dataset</h2><p>Paste JSONL or import a CSV file.</p></button></div><div class="info-card dataset-format-guide"><FileJson size={20}/><div><h3>State in datasets · questions in experiments</h3><p>Each row supplies a Jev <code>state</code>: text, an object, or an array. Choose the shared <code>questions</code> and <code>model</code> when you create an experiment.</p><details><summary>Import format and examples</summary><p>Paste a JSON array or one complete row per line (JSONL). <code>id</code> is optional. Add <code>expected</code> labels keyed by question ID for local scoring: boolean for Noul, option name for Choice, or a zero-based level for Score.</p><div class="dataset-example-code"><CodeEditor value={datasetFormatExample} readonly label="Dataset format example"/></div><p>The request preview in experiment setup shows the exact <code>state</code>, <code>model</code>, and <code>questions</code> sent to Jev. Row IDs and expected labels stay local.</p></details></div></div>{/if}
      {:else if page==='Projects'}
        <div class="page-heading"><div><h1>Projects</h1></div><button class="btn primary" onclick={()=>modal='new-project'}><Plus size={14}/> New project</button></div><div class="project-grid">{#each projects as p,i}<button class="project-card" onclick={()=>{changeProject(p.id);page='Playground';}}><div class="project-card-icon"><Folder size={23}/><ArrowUpRight size={16}/></div><h2>{p.name}</h2><p>{p.description||'No description'}</p><div class="project-card-stats"><span><Braces size={13}/>{sessions.filter(s=>s.project_id===p.id).length} question sets</span><span><Database size={13}/>{datasets.filter(d=>d.project_id===p.id).length} datasets</span></div><footer><span class="live-dot"></span>{runs.filter(r=>runProjectId(r)===p.id).length} saved runs</footer></button>{/each}</div>
      {:else if page==='History'}
        <div class="page-heading"><div><h1>Run history</h1></div><button class="btn" onclick={()=>download('jev-run-history.json',JSON.stringify(projectRuns,null,2))}><Download size={13}/> Export history</button></div><div class="history-controls"><div class="search-input"><Search size={15}/><input aria-label="Search history" placeholder="Search runs, models, status…" bind:value={historySearch}/></div><span>{filteredRuns.length} runs · {activeProject?.name||'No project'}</span></div><div class="data-table-wrap"><table class="data-table history-table"><thead><tr><th>RUN / QUESTION SET</th><th>MODEL</th><th>LATENCY</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>{#each filteredRuns as run}<tr><td><span class="history-run-name"><span class="run-result-icon" class:failed={run.status==='error'}>{#if run.status==='success'}<Check size={11}/>{:else}<X size={11}/>{/if}</span><strong>{run.name}</strong></span><span class="run-id mono">{run.id.slice(0,8)} · {run.source==='demo'?'Synthetic demo':'Live API'}</span></td><td><span class="mono">{run.resolved_model||run.requested_model}</span><small>Requested: {run.requested_model}</small></td><td class="mono">{run.latency_ms} ms</td><td>{date(run.created_at)}</td><td><div class="table-actions"><button class="btn" onclick={()=>restore(run)}>Restore</button><button class="icon-button" title="Fork run" aria-label={'Fork '+run.id} onclick={()=>restore(run,true)}><GitBranch size={14}/></button><button class="icon-button" title="Compare with current" aria-label={'Compare '+run.id} onclick={()=>{compareRun=run;modal='compare';}}><Columns3 size={14}/></button></div></td></tr>{/each}</tbody></table>{#if !filteredRuns.length}<div class="big-empty"><History size={32}/><h2>No saved runs</h2><p>Run an evaluation to save a request and response snapshot.</p><button class="btn primary" onclick={()=>page='Playground'}>Go to Playground <ArrowRight size={13}/></button></div>{/if}</div>
      {:else if page==='Settings'}
        <div class="page-heading"><div><h1>Settings</h1></div><span class="badge">{desktop?'Desktop app':'Browser preview'}</span></div><div class="settings-section"><div><h2>Appearance</h2></div><div class="settings-card"><div class="setting-row"><label for="appearance-theme">Theme</label><select class="appearance-select" id="appearance-theme" bind:value={themePreference}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div></div></div><div class="settings-section"><div><h2>TypeSafe connection</h2><p>Your API key is held by {desktop?'the operating system credential store':'the native desktop app'}.</p></div><div class="settings-card"><div class="provider-row"><span class="provider-logo">✳</span><div><h3>TypeSafe AI</h3><p>Structured judgments with Jev</p></div><span class="badge" class:connected={credentialExists}><span class="live-dot"></span>{credentialExists?'Connected':'Not connected'}</span></div>{#if desktop}<label for="api-key">API key</label><div class="key-input"><input id="api-key" type="password" bind:value={apiKey} autocomplete="off" placeholder={credentialExists?'Enter a replacement API key':'Paste your TypeSafe API key'}/><button class="btn primary" onclick={setKey} disabled={!apiKey.trim()||keyBusy}>{keyBusy?'Saving…':'Save key'}</button></div><p class="settings-note"><ShieldCheck size={12}/>Stored in your OS credential store. Never saved to SQLite or run history.</p>{#if credentialExists}<button class="text-button danger" onclick={removeKey}>Remove saved key</button>{/if}{:else}<div class="native-notice"><LockKeyhole size={19}/><div><strong>Live evaluations happen in the desktop app.</strong><p>Open jev dev with <code>npm run desktop</code> to connect your API key. This browser preview uses synthetic demo responses.</p></div></div>{/if}<a href="https://console.typesafe.ai/keys" onclick={e=>{if(desktop){e.preventDefault();void openDocumentation('keys');}}} target="_blank" rel="noreferrer" class="external-link">Manage TypeSafe API keys <ArrowUpRight size={12}/></a></div></div><div class="settings-section"><div><h2>Local workspace</h2></div><div class="settings-card"><div class="setting-row"><span>Storage</span><strong>{desktop?'SQLite · application data directory':'Browser local storage · this origin'}</strong></div><div class="setting-row"><span>Saved runs</span><strong>{runs.length} immutable snapshots</strong></div><div class="setting-row"><span>Workspace backup</span><button class="btn" onclick={()=>download('jev-dev-backup.json',JSON.stringify({...snapshot(),runs},null,2))}><Download size={13}/> Export all data</button></div><p class="settings-note">{desktop?'Your data is stored locally in the jev dev application data directory.':'Browser data persists across reloads. Clearing site data removes it; export a backup to keep a copy.'}</p></div></div>
      {/if}
      <div class:hidden={page!=='Experiments'}><Experiments bind:this={experimentPanel} {projects} {datasets} {sessions} {activeProjectId} {mode} liveAvailable={!loading&&desktop&&credentialExists} onmodechange={setExecutionMode} {execute} {experiments} onupdate={value=>{experiments=value;void persist();}}/></div>
    </div>
  </main>
</div>
{#if toast}<div class="toast" role="status"><CheckCheck size={15}/>{toast}</div>{/if}
{#if modal}<div class="modal-backdrop" role="presentation" onclick={event=>{if(event.target===event.currentTarget)modal='';}}><div bind:this={dialogElement} use:focusDialog onkeydown={trapFocus} tabindex="-1" class="modal" class:wide-modal={modal==='compare'||modal==='export'||modal==='dataset'} role="dialog" aria-modal="true" aria-label={modal}><div class="modal-header"><div><h2>{modal==='export'?'Export request':modal==='new-project'?'New project':modal==='move-session'?'Move to project':modal==='dataset'?'Create dataset':modal==='compare'?'Compare requests':'Documentation'}</h2></div><button class="icon-button" aria-label="Close dialog" onclick={()=>modal=''}><X size={19}/></button></div>
  {#if modal==='export'}<p class="modal-description">Export the current request. Credentials are read from your environment.</p><div class="export-tabs">{#each ['json','typescript','python','curl'] as format}<button class:active={exportFormat===format} onclick={()=>exportFormat=format as typeof exportFormat}>{format==='json'?'JSON':format==='typescript'?'TypeScript':format==='python'?'Python':'cURL'}</button>{/each}</div><pre class="export-code">{exportText}</pre><div class="modal-footer"><button class="btn" onclick={()=>copy(exportText)}><Copy size={13}/> Copy</button><button class="btn primary" onclick={()=>download('jev-request.'+({json:'json',typescript:'ts',python:'py',curl:'sh'}[exportFormat]),exportText,'text/plain')}><Download size={13}/> Download</button></div>
  {:else if modal==='new-project'}<form onsubmit={e=>{e.preventDefault();createProject();}}><label for="project-name">Project name</label><input id="project-name" bind:value={projectName} placeholder="e.g. Support triage" required/><label for="project-description">Description <span class="muted">(optional)</span></label><textarea id="project-description" bind:value={projectDescription} rows={3} placeholder="What are you exploring?"></textarea><div class="modal-footer"><button class="btn" type="button" onclick={()=>modal=''}>Cancel</button><button class="btn primary" disabled={!projectName.trim()}>Create project <ArrowRight size={13}/></button></div></form>
  {:else if modal==='move-session'}<form onsubmit={event=>{event.preventDefault();void moveSession();}}><p class="modal-description">Move <strong>{sessionName}</strong> and its run history.</p><label for="move-destination">Project</label><select id="move-destination" class="move-project-select" bind:value={moveDestination}><option value={UNFILED_PROJECT_ID}>No project</option>{#each projects as project}<option value={project.id}>{project.name}</option>{/each}<option value="__new__">+ New project…</option></select>{#if moveDestination==='__new__'}<label for="move-project-name">New project name</label><input id="move-project-name" bind:value={moveProjectName} placeholder="e.g. Support triage" required/>{/if}<div class="modal-footer"><button class="btn" type="button" onclick={()=>modal=''}>Cancel</button><button class="btn primary" disabled={moveDestination===activeProjectId||moveDestination==='__new__'&&!moveProjectName.trim()}>Move</button></div></form>
  {:else if modal==='dataset'}<p class="modal-description">Each row supplies <code>state</code> as text, an object, or an array. Choose shared <code>questions</code> and <code>model</code> in experiment setup.</p><label for="dataset-name">Dataset name</label><input id="dataset-name" bind:value={datasetName} placeholder="e.g. Support tickets"/><div class="dataset-editor-toolbar"><span>Rows · JSON array or JSONL</span><button class="btn" onclick={useCurrentDatasetState}>Use current state</button></div><div class="dataset-paste-code"><CodeEditor value={datasetText} onchange={value=>datasetText=value} label="Dataset rows"/></div><p class="dataset-format-note">Optional <code>id</code> identifies a row. Optional <code>expected</code> holds labels keyed by question ID; it is used locally for scoring.</p>{#if !datasetText.trim()}<details class="dataset-import-example"><summary>Show example</summary><div class="dataset-example-code"><CodeEditor value={datasetFormatExample} readonly label="Dataset import example"/></div></details>{/if}{#if importError}<p class="error-text">{importError}</p>{/if}<div class="modal-footer"><button class="btn" onclick={()=>modal=''}>Cancel</button><button class="btn primary" onclick={createDataset} disabled={!datasetText.trim()||!datasetName.trim()}>Create dataset</button></div>
  {:else if modal==='compare'&&compareRun}<p class="modal-description">Inspect exact requests side by side. Historical snapshots cannot be modified.</p><div class="compare-columns"><div><h3>Saved run · {date(compareRun.created_at)}</h3><pre>{JSON.stringify(compareRun.request_json,null,2)}</pre></div><div><h3>Current draft</h3><pre>{(()=>{try{return JSON.stringify(makeRequest(),null,2);}catch{return questionsText;}})()}</pre></div></div><div class="modal-footer"><button class="btn" onclick={()=>{restore(compareRun!,true);modal='';}}>Fork saved run <GitBranch size={13}/></button><button class="btn primary" onclick={()=>{restore(compareRun!);modal='';}}>Restore saved run</button></div>
  {:else if modal==='help'}<div class="help-copy"><p>Start with a <strong>state</strong> — the context you want Jev to evaluate — and add independent questions.</p><div><span class="type-tag">Noul</span><p>A yes/no judgment expressed as P(true).</p></div><div><span class="type-tag">Choice</span><p>One choice from a set of options, with probabilities and confidence.</p></div><div><span class="type-tag">Score</span><p>A probability-weighted level on an ordered rubric, with a full distribution.</p></div><p>Every run is saved. Save a question set to version it, then test it over a labeled dataset in Experiments.</p><div class="help-shortcuts"><span>Run evaluation <kbd>⌘ ↵</kbd></span><span>Save question set <kbd>⌘ S</kbd></span></div><a class="btn primary" href="https://docs.typesafe.ai/" onclick={e=>{if(desktop){e.preventDefault();void openDocumentation('docs');}}} target="_blank" rel="noreferrer">Read TypeSafe documentation <ArrowUpRight size={13}/></a></div>{/if}
</div></div>{/if}
