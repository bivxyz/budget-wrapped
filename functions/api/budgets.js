import { actor, json, requireDb } from './_utils.js'
const validMonth=(value)=>/^\d{4}-\d{2}$/.test(value||'')
export async function onRequestPost({request,env}){
  try{
    const db=requireDb(env),body=await request.json(),email=actor(request),now=new Date().toISOString()
    if(!validMonth(body.monthKey))return json({error:'Invalid month'},400)
    if(body.action==='initialize'){
      const count=await db.prepare('SELECT COUNT(*) count FROM monthly_budgets WHERE month_key=?').bind(body.monthKey).first()
      if(!count.count){const previous=await db.prepare('SELECT MAX(month_key) month_key FROM monthly_budgets WHERE month_key<?').bind(body.monthKey).first();if(previous?.month_key)await db.prepare(`INSERT INTO monthly_budgets(month_key,bucket,target,paced,updated_at,updated_by) SELECT ?,bucket,target,paced,?,? FROM monthly_budgets WHERE month_key=?`).bind(body.monthKey,now,email,previous.month_key).run();else if(Array.isArray(body.defaults)&&body.defaults.length){const statements=body.defaults.filter(x=>x.bucket).map(x=>db.prepare('INSERT OR IGNORE INTO monthly_budgets(month_key,bucket,target,paced,updated_at,updated_by) VALUES(?,?,?,?,?,?)').bind(body.monthKey,String(x.bucket),Number(x.target)||0,x.paced===false?0:1,now,email));for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50))}}
      return json({ok:true})
    }
    if(body.action==='save'&&body.bucket&&Number.isFinite(Number(body.target))){await db.prepare(`INSERT INTO monthly_budgets(month_key,bucket,target,paced,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(month_key,bucket) DO UPDATE SET target=excluded.target,paced=excluded.paced,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(body.monthKey,String(body.bucket),Number(body.target),body.paced===false?0:1,now,email).run();return json({ok:true})}
    return json({error:'Invalid budget update'},400)
  }catch(error){return json({error:error.message},400)}
}
