import { assignImportKeys } from './importIdentity.js'

export async function fetchSharedState(){const r=await fetch('/api/state',{headers:{accept:'application/json'}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Shared state unavailable');return r.json()}
export async function postJson(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await r.json().catch(()=>({}));if(!r.ok)throw new Error(result.error||'Request failed');return result}
export function groupTransactions(rows){return rows.reduce((months,row)=>{const month=row.date.slice(0,7);(months[month]||=[]).push(row);return months},{})}
export function mergeArchive(local,sharedRows){const merged=structuredClone(local);for(const [month,incoming] of Object.entries(groupTransactions(sharedRows))){const keyed=new Map(assignImportKeys(merged[month]||[]).map(t=>[t.importKey,t]));for(const t of incoming)keyed.set(t.txnKey||t.importKey||assignImportKeys([t])[0].importKey,t);merged[month]=[...keyed.values()]}return merged}
