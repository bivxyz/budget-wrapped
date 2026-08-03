import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

function archivePlugin() {
  const id = '\0virtual:budget-archive'
  return { name: 'budget-archive', resolveId(source) { if (source === 'virtual:budget-archive') return id }, load(source) {
    if (source !== id) return
    const dir = path.resolve('data'); const payload = { months: {}, budgets: {} }
    if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const value = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
      if (file === 'budgets.json') payload.budgets = value
      else if (/^\d{4}-\d{2}\.json$/.test(file)) payload.months[file.slice(0, 7)] = value
    }
    return `export default ${JSON.stringify(payload)}`
  }}
}
export default defineConfig({ plugins: [archivePlugin(), react(), tailwindcss()] })
