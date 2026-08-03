import fs from 'node:fs/promises'
import path from 'node:path'
import Papa from 'papaparse'
import { buildTransactions } from '../src/lib/fields.js'
import { getProvider } from '../src/lib/providers.js'
import { DATA_DIR, dateKey, newestCsv, parseArgs } from './lib/shared.mjs'
export const transactionKey = (t) => [t.date instanceof Date ? dateKey(t.date) : t.date, t.amount, t.name, t.account].join('|')
export function mergeTransactions(stored, incoming) { const map = new Map(stored.map((t)=>[transactionKey(t),t])); let added=0; for (const t of incoming) if (!map.has(transactionKey(t))) { map.set(transactionKey(t),t); added++ } return { rows:[...map.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))), added, unchanged:incoming.length-added } }
export async function ingest({ file, dryRun=false, downloadsDir }={}) {
  const csv = file || await newestCsv(downloadsDir)
  const parsed = Papa.parse(await fs.readFile(csv,'utf8'),{header:true,skipEmptyLines:true}); if (parsed.errors.length) throw new Error(parsed.errors[0].message)
  const headers = parsed.meta.fields || Object.keys(parsed.data[0] || {}); const config = getProvider('rocket-money').makeConfig(headers)
  const canonical = buildTransactions(parsed.data,config).filter((t)=>t.date).map((t)=>({...t,date:dateKey(t.date)})); const groups = {}
  for (const t of canonical) (groups[t.date.slice(0,7)] ||= []).push(t)
  await fs.mkdir(DATA_DIR,{recursive:true}); const summary=[]
  for (const [month,incoming] of Object.entries(groups).sort()) { const target=path.join(DATA_DIR,`${month}.json`); let stored=[]; try { stored=JSON.parse(await fs.readFile(target,'utf8')) } catch(e){if(e.code!=='ENOENT')throw e} const merged=mergeTransactions(stored,incoming); summary.push({month,...merged}); console.log(`${month}: ${merged.added} new, ${merged.unchanged} unchanged`); if(!dryRun) await fs.writeFile(target,JSON.stringify(merged.rows,null,2)+'\n',{mode:0o600}) }
  return summary
}
if (import.meta.url === `file://${process.argv[1]}`) { const args=parseArgs(); ingest({file:args.file,dryRun:!!args['dry-run']}).catch((e)=>{console.error(e.message);process.exitCode=1}) }
