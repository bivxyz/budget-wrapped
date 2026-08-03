import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { buildTransactions } from '../lib/fields.js'
import { getProvider } from '../lib/providers.js'
import { localDateKey } from '../lib/portfolio.js'
import { importedFlow } from '../lib/tracker.js'
import { postJson } from '../lib/sharedState.js'

export default function TrackerUpload({lastUpload,onChanged}){
  const input=useRef(),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('')
  const upload=async(file)=>{if(!file)return;setBusy(true);setError('');try{const parsed=Papa.parse(await file.text(),{header:true,skipEmptyLines:true});if(parsed.errors.length)throw new Error(parsed.errors[0].message);const config=getProvider('rocket-money').makeConfig(parsed.meta.fields||[]),transactions=buildTransactions(parsed.data,config).filter(t=>t.date).map(t=>{const row={...t,date:localDateKey(t.date)};return{...row,flow:importedFlow(row)}});const result=await postJson('/api/upload',{fileName:file.name,transactions});setNotice(`${result.added} new · ${result.unchanged} refreshed`);await onChanged()}catch(e){setError(e.message)}finally{setBusy(false);input.current.value=''}}
  return <div className="bg-base-2 border border-white/10 rounded-xl p-4 flex flex-wrap items-center gap-4 mb-6"><div className="flex-1 min-w-[240px]"><div className="font-bold">Update from Rocket Money</div>{lastUpload?<div className="text-xs text-white/45 mt-1">{lastUpload.fileName} · {lastUpload.rowCount} rows · {new Date(lastUpload.uploadedAt).toLocaleString()} · {lastUpload.uploadedBy}</div>:<div className="text-xs text-white/45 mt-1">Upload a YTD export; repeat uploads are safe.</div>}{notice&&<div className="text-xs text-accent-green mt-1">{notice}</div>}{error&&<div className="text-xs text-accent-coral mt-1">{error}</div>}</div><input ref={input} className="hidden" type="file" accept=".csv,text/csv" onChange={e=>upload(e.target.files[0])}/><button disabled={busy} onClick={()=>input.current.click()} className="primary-button">{busy?'Importing…':'Upload YTD CSV'}</button></div>
}
