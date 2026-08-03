export const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
export const actor = (request) => request.headers.get('Cf-Access-Authenticated-User-Email') || 'local-user'
export const requireDb = (env) => { if (!env.DB) throw new Error('The D1 binding DB is not configured'); return env.DB }
