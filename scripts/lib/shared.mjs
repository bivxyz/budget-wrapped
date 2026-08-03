import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
export const ROOT = path.resolve(import.meta.dirname, '../..')
export const DATA_DIR = path.join(ROOT, 'data')

export function parseArgs(argv = process.argv.slice(2)) { return Object.fromEntries(argv.map((arg) => { const [k, ...rest] = arg.replace(/^--/, '').split('='); return [k, rest.length ? rest.join('=') : true] })) }
export function parseLocalDate(value) { const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) throw new Error(`Invalid date: ${value}`); return new Date(+m[1], +m[2]-1, +m[3]) }
export function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function revive(row) { return { ...row, date: parseLocalDate(row.date) } }
export async function readArchive() { const result = {}; try { for (const file of await fs.readdir(DATA_DIR)) if (/^\d{4}-\d{2}\.json$/.test(file)) result[file.slice(0,7)] = JSON.parse(await fs.readFile(path.join(DATA_DIR,file),'utf8')).map(revive) } catch (e) { if (e.code !== 'ENOENT') throw e } return result }
export function flattenArchive(archive) { return Object.values(archive).flat() }
export function latestDate(rows) { return rows.reduce((latest,t) => !latest || t.date > latest ? t.date : latest, null) }
export async function newestCsv(dir = path.join(os.homedir(),'Downloads')) { const files = (await fs.readdir(dir)).filter((f)=>f.toLowerCase().includes('transactions') && f.toLowerCase().endsWith('.csv')); if (!files.length) throw new Error(`No *transactions*.csv files in ${dir}`); const stats = await Promise.all(files.map(async f => ({ file:path.join(dir,f), stat:await fs.stat(path.join(dir,f)) }))); return stats.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs)[0].file }
