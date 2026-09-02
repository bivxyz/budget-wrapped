import { actor, json, requireDb } from './_utils.js'
const FLOWS = new Set(['Expense','Income','Transfer','Investment','Ignore'])
export async function onRequestPost({ request, env }) {
  try {
    const db=requireDb(env), body=await request.json(), email=actor(request)
    if (!body.txnKey || (body.flow != null && !FLOWS.has(body.flow))) return json({error:'Invalid transaction update'},400)
    const transaction=await db.prepare('SELECT date FROM transactions WHERE txn_key=?').bind(body.txnKey).first()
    if(!transaction)return json({error:'Transaction not found'},404)
    const closeout=await db.prepare('SELECT month_key FROM monthly_closeouts WHERE month_key=?').bind(String(transaction.date).slice(0,7)).first()
    if(closeout)return json({error:'Reopen this month before editing its transactions.'},409)
    const result=await db.prepare(`UPDATE transactions SET override_bucket=?,override_flow=?,uploaded_at=uploaded_at,uploaded_by=uploaded_by WHERE txn_key=?`).bind(body.bucket||null,body.flow||null,body.txnKey).run()
    return json({ok:true,updatedBy:email})
  } catch(error){return json({error:error.message},400)}
}
