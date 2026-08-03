import { useCallback,useEffect,useMemo,useState } from 'react'
import archivePayload from 'virtual:budget-archive'
import Upload from './components/Upload.jsx'
import MappingReview from './components/MappingReview.jsx'
import Slideshow from './components/Slideshow.jsx'
import Dashboard from './components/Dashboard.jsx'
import PortfolioDashboard from './components/PortfolioDashboard.jsx'
import { analyze } from './lib/finance.js'
import { buildPortfolio } from './lib/portfolio.js'
import { budgetsByMonth } from './lib/tracker.js'
import { detectProvider } from './lib/providers.js'
import { fetchSharedState,mergeArchive,postJson } from './lib/sharedState.js'

export default function App(){
  const [shared,setShared]=useState({transactions:[],budgets:[],lastUpload:null,available:false})
  const refreshShared=useCallback(async()=>{try{const state=await fetchSharedState();setShared({...state,available:true})}catch(error){setShared(current=>({...current,available:false,error:error.message}))}},[])
  useEffect(()=>{refreshShared()},[refreshShared])
  const mergedArchive=useMemo(()=>mergeArchive(archivePayload.months,shared.transactions),[shared.transactions]),monthlyBudgets=useMemo(()=>budgetsByMonth(shared.budgets),[shared.budgets]),portfolio=useMemo(()=>buildPortfolio(mergedArchive,monthlyBudgets),[mergedArchive,monthlyBudgets]),hasArchive=portfolio.months.length>0,deepLink=new URLSearchParams(location.search).get('m')
  const [stage,setStage]=useState(hasArchive?'portfolio':'loading'),[parsed,setParsed]=useState(null),[detected,setDetected]=useState(null),[data,setData]=useState(null)
  useEffect(()=>{if(stage!=='loading')return;if(shared.available)setStage('portfolio');else if(shared.error)setStage('upload')},[stage,shared.available,shared.error])
  const handleParsed=({rows,headers,sample})=>{const det=detectProvider(headers);setParsed({rows,headers});setDetected(det);if(sample){setData(analyze(rows,det.provider.makeConfig(headers)));setStage('slideshow')}else setStage('review')}
  const reset=()=>{setData(null);setParsed(null);setDetected(null);setStage(hasArchive?'portfolio':'upload')}
  const override=async(row,patch)=>{if(!row.txnKey)throw new Error('Upload this transaction set to shared storage before editing.');const before=shared.transactions;const nextBucket=patch.bucket??row.bucket,nextFlow=patch.flow??row.flow,overrideBucket=nextBucket===row.originalBucket?null:nextBucket,overrideFlow=nextFlow===row.importedFlow?null:nextFlow;setShared(current=>({...current,transactions:current.transactions.map(t=>t.txnKey===row.txnKey?{...t,bucket:nextBucket,flow:nextFlow,overrideBucket,overrideFlow}:t)}));try{await postJson('/api/transaction',{txnKey:row.txnKey,bucket:overrideBucket,flow:overrideFlow})}catch(error){setShared(current=>({...current,transactions:before}));throw error}}
  if(stage==='portfolio')return <PortfolioDashboard portfolio={portfolio} archive={mergedArchive} shared={shared} onSharedChanged={refreshShared} onOverride={override} defaultBudgets={archivePayload.budgets[portfolio.currentKey.slice(0,4)]||{}} initialMonth={portfolio.analyses[deepLink]?deepLink:null}/>
  return <div className="min-h-full">{stage==='loading'&&<div className="min-h-screen grid place-items-center text-sm text-white/45">Connecting to shared family data…</div>} {stage==='upload'&&<Upload onParsed={handleParsed}/>} {stage==='review'&&parsed&&<MappingReview headers={parsed.headers} rows={parsed.rows} detected={detected} onConfirm={config=>{setData(analyze(parsed.rows,config));setStage('slideshow')}} onCancel={reset}/>} {stage==='slideshow'&&data&&<Slideshow data={data} onDone={()=>setStage('dashboard')}/>} {stage==='dashboard'&&data&&<Dashboard data={data} onReplay={()=>setStage('slideshow')}/>} {stage!=='upload'&&stage!=='loading'&&<button onClick={reset} className="fixed bottom-4 right-4 z-30 text-xs text-white/50">← back</button>}</div>
}
