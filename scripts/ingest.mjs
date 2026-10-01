import fs from 'node:fs/promises'
import path from 'node:path'
import Papa from 'papaparse'
import { buildTransactions } from '../src/lib/fields.js'
import { getProvider } from '../src/lib/providers.js'
import { DATA_DIR, dateKey, newestCsv, parseArgs } from './lib/shared.mjs'
import { assignImportKeys, transactionBaseKey } from '../src/lib/importIdentity.js'
export const transactionKey = transactionBaseKey
export function mergeTransactions(stored, incoming) {
  const map = new Map(assignImportKeys(stored).map(transaction => [transaction.importKey, transaction])), keyed = assignImportKeys(incoming)
  let added = 0
  for (const transaction of keyed) {
    if (!map.has(transaction.importKey)) added += 1
    map.set(transaction.importKey, { ...map.get(transaction.importKey), ...transaction })
  }
  return { rows: [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.importKey.localeCompare(b.importKey)), added, unchanged: incoming.length - added }
}
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
