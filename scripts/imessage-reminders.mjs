#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { dateKey, monday, shiftDay } from '../src/lib/weekly.js'

const account = 'budget-wrapped', services = {
  recipient: 'budget-wrapped-recipient', baseUrl: 'budget-wrapped-base-url', accessId: 'budget-wrapped-access-client-id',
  accessSecret: 'budget-wrapped-access-client-secret', agentToken: 'budget-wrapped-agent-token',
}
const support = resolve(homedir(), 'Library/Application Support/Budget Wrapped'), ledgerPath = resolve(support, 'reminder-ledger.json')
const scriptPath = fileURLToPath(import.meta.url), command = process.argv[2] || 'poll'

const keychain = name => execFileSync('/usr/bin/security', ['find-generic-password', '-a', account, '-s', services[name], '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const saveKeychain = (name, value) => execFileSync('/usr/bin/security', ['add-generic-password', '-U', '-a', account, '-s', services[name], '-w', value], { stdio: 'ignore' })
const config = () => ({ recipient: keychain('recipient'), baseUrl: keychain('baseUrl').replace(/\/$/, ''), accessId: keychain('accessId'), accessSecret: keychain('accessSecret'), agentToken: keychain('agentToken') })
const readLedger = () => { try { return JSON.parse(readFileSync(ledgerPath, 'utf8')) } catch { return {} } }
const saveLedger = ledger => { mkdirSync(dirname(ledgerPath), { recursive: true, mode: 0o700 }); writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 }) }

async function api(settings, body) {
  const response = await fetch(`${settings.baseUrl}/api/reminders`, { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Access-Client-Id': settings.accessId, 'CF-Access-Client-Secret': settings.accessSecret, 'X-Budget-Reminder-Token': settings.agentToken }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Reminder API returned ${response.status}.`)
  return result
}

const appleScript = `on run argv
  set recipientAddress to item 1 of argv
  set messageBody to item 2 of argv
  tell application "Messages"
    set targetService to first service whose service type = iMessage
    set targetBuddy to buddy recipientAddress of targetService
    send messageBody to targetBuddy
  end tell
end run`

export function sendMessage(recipient, text, executable = '/usr/bin/osascript') {
  const result = spawnSync(executable, ['-e', appleScript, recipient, text], { encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) throw new Error((result.stderr || 'Messages did not accept the reminder.').trim())
}

async function processQueue(settings) {
  const ledger = readLedger()
  for (let count = 0; count < 10; count += 1) {
    const { item } = await api(settings, { action: 'claim' })
    if (!item) return
    const prior = ledger[item.id]?.status
    if (prior === 'sent') {
      await api(settings, { action: 'complete', id: item.id, claimToken: item.claimToken })
      console.log(`finalized reminder ${item.id}`)
      continue
    }
    if (prior === 'attempting') {
      ledger[item.id] = { status: 'uncertain', at: new Date().toISOString() }; saveLedger(ledger)
      await api(settings, { action: 'uncertain', id: item.id, claimToken: item.claimToken, error: 'The sender restarted during delivery; retry manually to avoid an accidental duplicate.' })
      console.log(`marked reminder ${item.id} uncertain`)
      continue
    }
    ledger[item.id] = { status: 'attempting', at: new Date().toISOString() }; saveLedger(ledger)
    try {
      sendMessage(settings.recipient, item.text)
      ledger[item.id] = { status: 'sent', at: new Date().toISOString() }; saveLedger(ledger)
      await api(settings, { action: 'complete', id: item.id, claimToken: item.claimToken })
      console.log(`sent reminder ${item.id}`)
    } catch (error) {
      ledger[item.id] = { status: 'failed', at: new Date().toISOString() }; saveLedger(ledger)
      await api(settings, { action: 'fail', id: item.id, claimToken: item.claimToken, error: error.message }).catch(() => {})
      console.error(`failed reminder ${item.id}`)
    }
  }
}

async function configure() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  let recipient, baseUrl, accessId
  try {
    recipient = (await prompt.question('Wife’s iMessage phone number or Apple ID: ')).trim()
    baseUrl = (await prompt.question('Budget Wrapped URL [https://budget.bivens.xyz]: ')).trim() || 'https://budget.bivens.xyz'
    accessId = (await prompt.question('Cloudflare Access service-token client ID: ')).trim()
  } finally { prompt.close() }
  const accessSecret = (await hiddenQuestion('Cloudflare Access service-token client secret: ')).trim()
  const agentToken = (await hiddenQuestion('REMINDER_AGENT_TOKEN value: ')).trim()
  try {
    if (![recipient, baseUrl, accessId, accessSecret, agentToken].every(Boolean)) throw new Error('Every setting is required.')
    saveKeychain('recipient', recipient); saveKeychain('baseUrl', baseUrl); saveKeychain('accessId', accessId); saveKeychain('accessSecret', accessSecret); saveKeychain('agentToken', agentToken)
    console.log('Saved reminder settings in macOS Keychain.')
  } catch (error) { throw error }
}

function hiddenQuestion(label) {
  if (!process.stdin.isTTY) throw new Error('Secret setup requires an interactive terminal.')
  process.stdout.write(label); process.stdin.resume(); process.stdin.setRawMode(true)
  return new Promise((resolve, reject) => {
    let value = ''
    const read = chunk => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') { cleanup(); reject(new Error('Setup cancelled.')); return }
        if (character === '\r' || character === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else value += character
      }
    }
    const cleanup = () => { process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause() }
    process.stdin.on('data', read)
  })
}

const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const plist = ({ label, mode, schedule }) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(scriptPath)}</string><string>${mode}</string></array>
  ${schedule}
  <key>EnvironmentVariables</key><dict><key>TZ</key><string>America/Los_Angeles</string></dict>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>${xml(resolve(homedir(), 'Library/Logs/BudgetWrapped/reminders.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(resolve(homedir(), 'Library/Logs/BudgetWrapped/reminders-error.log'))}</string>
</dict></plist>\n`

function install() {
  if (process.platform !== 'darwin') throw new Error('The iMessage sender requires macOS.')
  config()
  const launchAgents = resolve(homedir(), 'Library/LaunchAgents'), logs = resolve(homedir(), 'Library/Logs/BudgetWrapped'), uid = process.getuid()
  mkdirSync(launchAgents, { recursive: true }); mkdirSync(logs, { recursive: true })
  const legacy = resolve(launchAgents, 'com.bivens.budget-wrapped-reminder-weekly.plist')
  try { execFileSync('/bin/launchctl', ['bootout', `gui/${uid}`, legacy], { stdio: 'ignore' }) } catch {}
  rmSync(legacy, { force: true })
  const jobs = [{ label: 'com.bivens.budget-wrapped-reminder-poll', mode: 'poll', schedule: '<key>StartInterval</key><integer>60</integer>' }]
  for (const job of jobs) {
    const path = resolve(launchAgents, `${job.label}.plist`)
    try { execFileSync('/bin/launchctl', ['bootout', `gui/${uid}`, path], { stdio: 'ignore' }) } catch {}
    writeFileSync(path, plist(job), { mode: 0o600 })
    execFileSync('/bin/launchctl', ['bootstrap', `gui/${uid}`, path])
  }
  console.log('Installed the Budget Wrapped reminder polling agent and removed the legacy Monday scheduler.')
}

function uninstall() {
  const launchAgents = resolve(homedir(), 'Library/LaunchAgents'), uid = process.getuid()
  for (const label of ['com.bivens.budget-wrapped-reminder-poll', 'com.bivens.budget-wrapped-reminder-weekly']) {
    const path = resolve(launchAgents, `${label}.plist`)
    try { execFileSync('/bin/launchctl', ['bootout', `gui/${uid}`, path], { stdio: 'ignore' }) } catch {}
    rmSync(path, { force: true })
  }
  console.log('Removed the Budget Wrapped reminder polling agent. Keychain settings were retained.')
}

async function main() {
  if (command === 'configure') return configure()
  if (command === 'install') return install()
  if (command === 'uninstall') return uninstall()
  if (command === 'permission-check') { execFileSync('/usr/bin/osascript', ['-e', 'tell application "Messages" to get name']); console.log('Messages automation permission is available.'); return }
  const settings = config()
  if (command === 'dry-run') {
    const current = monday(dateKey()), prior = shiftDay(current, -7)
    const result = await api(settings, { action: 'preview', kind: 'weekly', weekStart: current, confirmationWeekStart: prior })
    console.log(result.text); return
  }
  if (command === 'weekly') { console.log('automatic weekly reminders are disabled; send from the dashboard'); return }
  if (command !== 'poll') throw new Error(`Unknown reminder command: ${command}`)
  await processQueue(settings)
}

if (process.argv[1] === scriptPath) main().catch(error => { console.error(error.message); process.exitCode = 1 })
