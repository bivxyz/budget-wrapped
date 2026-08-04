import { actor, json, requireDb } from './_utils.js'
const validMonth=(value)=>/^\d{4}-\d{2}$/.test(value||'')
export async function onRequestPost({request,env}){
  try{
    const db=requireDb(env),body=await request.json(),email=actor(request),now=new Date().toISOString()
    if(!validMonth(body.monthKey))return json({error:'Invalid month'},400)
    if(body.action==='savePlan'){
      const limit=Number(body.spendingLimit),categories=Array.isArray(body.categories)?body.categories:[]
      if(!Number.isFinite(limit)||limit<0||categories.length>200)return json({error:'Invalid budget plan'},400)
      const seen=new Set()
      for(const item of categories){const target=Number(item.target),bucket=String(item.bucket||'').trim();if(!bucket||seen.has(bucket)||!Number.isFinite(target)||target<0)return json({error:'Invalid category allocation'},400);seen.add(bucket)}
      const statements=[
        db.prepare(`INSERT INTO monthly_budget_settings(month_key,spending_limit,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(month_key) DO UPDATE SET spending_limit=excluded.spending_limit,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(body.monthKey,limit,now,email),
        db.prepare('DELETE FROM monthly_budgets WHERE month_key=?').bind(body.monthKey),
        ...categories.map((item,index)=>db.prepare('INSERT INTO monthly_budgets(month_key,bucket,target,paced,sort_order,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)').bind(body.monthKey,String(item.bucket).trim(),Number(item.target),item.paced===false?0:1,index,now,email)),
      ]
      await db.batch(statements)
      return json({ok:true,categoryCount:categories.length})
    }
    return json({error:'Invalid budget update'},400)
  }catch(error){return json({error:error.message},400)}
}
