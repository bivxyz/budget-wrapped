import { useCallback,useEffect,useMemo,useState } from 'react'
import archivePayload from 'virtual:budget-archive'
import PortfolioDashboard from './components/PortfolioDashboardV2.jsx'
import { buildPortfolio } from './lib/portfolio.js'
import { budgetLimitsByMonth,budgetsByMonth } from './lib/tracker.js'
import { fetchSharedState,mergeArchive,postJson } from './lib/sharedState.js'
import { activeTransactions, dateKey } from './lib/weekly.js'

const emptyShared={transactions:[],budgets:[],budgetSettings:[],monthlyReviews:[],monthlyCloseouts:[],lastUpload:null,available:false}

export default function App(){
  const [shared,setShared]=useState(emptyShared),[loading,setLoading]=useState(true)
  const refreshShared=useCallback(async()=>{try{const state=await fetchSharedState();setShared({...state,available:true,error:null})}catch(error){setShared(current=>({...current,available:false,error:error.message}));throw error}finally{setLoading(false)}},[])
  useEffect(()=>{refreshShared().catch(()=>{})},[refreshShared])
  const mergedArchive=useMemo(()=>mergeArchive(shared.available?{[dateKey().slice(0,7)]:[]}:archivePayload.months,activeTransactions(shared.transactions)),[shared.transactions,shared.available])
  const monthlyBudgets=useMemo(()=>budgetsByMonth(shared.budgets),[shared.budgets])
  const monthlyLimits=useMemo(()=>budgetLimitsByMonth(shared.budgetSettings||[]),[shared.budgetSettings])
  const closeoutMonths=useMemo(()=>(shared.monthlyCloseouts||[]).map(row=>row.monthKey),[shared.monthlyCloseouts])
  const portfolio=useMemo(()=>buildPortfolio(mergedArchive,monthlyBudgets,new Date(),monthlyLimits,closeoutMonths),[mergedArchive,monthlyBudgets,monthlyLimits,closeoutMonths])
  const deepLink=new URLSearchParams(location.search).get('m')
  const override=async(row,patch)=>{if(!row.txnKey)throw new Error('Upload this transaction set to shared storage before editing.');const before=shared.transactions,nextBucket=patch.bucket??row.bucket,nextFlow=patch.flow??row.flow,overrideBucket=nextBucket===row.originalBucket?null:nextBucket,overrideFlow=nextFlow===row.importedFlow?null:nextFlow;setShared(current=>({...current,transactions:current.transactions.map(t=>t.txnKey===row.txnKey?{...t,bucket:nextBucket,flow:nextFlow,overrideBucket,overrideFlow}:t)}));try{await postJson('/api/transaction',{txnKey:row.txnKey,bucket:overrideBucket,flow:overrideFlow});await refreshShared()}catch(error){setShared(current=>({...current,transactions:before}));throw error}}
  if(loading)return <div className="dashboard-loading" role="status" aria-label="Connecting to shared family data"><div className="loading-rail"/><div className="loading-canvas"><div className="loading-titlebar"/><div className="loading-grid"><div className="loading-main"/><div className="loading-side"/></div></div></div>
  return <PortfolioDashboard portfolio={portfolio} archive={mergedArchive} shared={shared} onSharedChanged={refreshShared} onOverride={override} defaultBudgets={archivePayload.budgets[portfolio.currentKey.slice(0,4)]||{}} initialMonth={portfolio.analyses[deepLink]?deepLink:null}/>
}
