import { actor, json, requireDb } from './_utils.js'
const FLOWS = new Set(['Expense','Income','Transfer','Investment','Ignore'])
export async function onRequestPost({ request, env }) {
  try {
    const db=requireDb(env), body=await request.json(), email=actor(request)
    if (!body.txnKey || (body.flow != null && !FLOWS.has(body.flow))) return json({error:'Invalid transaction update'},400)
    const result=await db.prepare(`UPDATE transactions SET override_bucket=?,override_flow=?,uploaded_at=uploaded_at,uploaded_by=uploaded_by WHERE txn_key=?`).bind(body.bucket||null,body.flow||null,body.txnKey).run()
    if (!result.meta?.changes) return json({error:'Transaction not found'},404)
    return json({ok:true,updatedBy:email})
  } catch(error){return json({error:error.message},400)}
}
