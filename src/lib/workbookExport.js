import { activeTransactions } from './weekly.js'
import { monthlySummary, transactionDisposition } from './tracker.js'

const COLORS={navy:'111318',panel:'181C24',green:'00FF87',white:'F7F7F7'}
const currency='"$"#,##0.00;[Red]-"$"#,##0.00'
const percent='0.0%'

function localDate(value){const [year,month,day]=String(value).slice(0,10).split('-').map(Number);return new Date(year,month-1,day,12)}
function todayKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function cellText(value){return value==null?'':String(value)}
function formatMoney(value){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value||0)}
function topList(rows,label){return (rows||[]).map((row,index)=>`${index+1}. ${label(row)}`).join('\n')}

function styleSheet(sheet,widths,currencyColumns=[],percentColumns=[]){
  sheet.views=[{state:'frozen',ySplit:1}];sheet.properties.defaultRowHeight=19;sheet.getRow(1).height=28
  sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:COLORS.white}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.panel}};cell.alignment={vertical:'middle'}})
  sheet.columns.forEach((column,index)=>{column.width=widths[index]||16})
  currencyColumns.forEach(index=>{sheet.getColumn(index).numFmt=currency;sheet.getColumn(index).alignment={horizontal:'right'}})
  percentColumns.forEach(index=>{sheet.getColumn(index).numFmt=percent;sheet.getColumn(index).alignment={horizontal:'right'}})
  if(sheet.rowCount>1)sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}}
  sheet.eachRow((row,rowNumber)=>{if(rowNumber>1&&rowNumber%2===0)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F3F4F6'}}})})
}

function addTracking(workbook,transactions){
  const sheet=workbook.addWorksheet('Tracking',{properties:{tabColor:{argb:COLORS.green}}})
  sheet.addRow(['Date','Expense / merchant','Amount','Effective category','Effective flow','Account','Rocket Money category','Original app category','Category override','Flow override','Transaction key','Source','Created at','Created by','Matched import key','Deleted at','Active record','Counts as true spending','Disposition'])
  transactions.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)).forEach(row=>{const disposition=transactionDisposition(row),active=!row.matchedTxnKey&&!row.deletedAt;sheet.addRow([localDate(row.date),cellText(row.name),Number(row.amount)||0,cellText(row.bucket),cellText(row.flow),cellText(row.account),cellText(row.rawCategory),cellText(row.originalBucket),cellText(row.overrideBucket),cellText(row.overrideFlow),cellText(row.txnKey),row.source||'import',cellText(row.createdAt),cellText(row.createdBy),cellText(row.matchedTxnKey),cellText(row.deletedAt),active?'Yes':'No',active&&disposition.kind==='purchase'?'Yes':active&&disposition.kind==='refund'?'Refund / credit':'No',disposition.kind])})
  sheet.getColumn(1).numFmt='mmm d, yyyy';styleSheet(sheet,[14,32,14,24,16,20,25,24,24,16,48,14,22,24,48,22,14,22,22],[3])
}

function budgetRows(months,budgets,portfolio){return months.flatMap(month=>budgets.filter(row=>row.monthKey===month).map(row=>{const monthly=portfolio.monthly[month],metric=monthly?.pacing.find(item=>item.bucket===row.bucket),actual=metric?.actual||0,target=Number(row.target)||0;return [month,row.bucket,target,row.paced?'Paced':'Lumpy',actual,target-actual,target?actual/target:null,row.paced?(metric?.projected??actual):null,monthly?.budgetTotal||0,(monthly?.budgetTotal||0)-(monthly?.allocatedTotal||0)]}))}
function addBudgets(workbook,months,budgets,portfolio,name='Monthly Budgets'){const sheet=workbook.addWorksheet(name);sheet.addRow(['Month','Category','Target','Pacing','Actual','Remaining','Percent used','Projected finish','Official monthly limit','Unallocated / over']);sheet.addRows(budgetRows(months,budgets,portfolio));styleSheet(sheet,[13,25,15,13,15,15,15,18,20,20],[3,5,6,8,9,10],[7])}

function summaryFor(month,transactions,portfolio){const monthRows=transactions.filter(row=>row.date.startsWith(month)),computed=monthlySummary(monthRows),saved=portfolio.monthly[month],income=portfolio.analyses[month]?.income??monthRows.filter(row=>row.flow==='Income').reduce((sum,row)=>sum+Math.max(0,-Number(row.amount)||0),0),budget=saved?.budgetTotal||0,spent=computed.totalSpent;return [month,spent,income,computed.investmentContributions,computed.savingsLoss,budget,budget-spent,saved?.projectedTotal??spent,topList(computed.topCategories,row=>`${row.bucket} (${formatMoney(row.amount)}; highest ${row.highestExpense?.name||'—'} ${formatMoney(row.highestExpense?.amount||0)})`),topList(computed.topExpenses,row=>`${row.name} (${row.bucket}, ${formatMoney(row.amount)})`)]}
function addSummary(workbook,months,transactions,portfolio,name='Monthly Summary'){const sheet=workbook.addWorksheet(name,{properties:{tabColor:{argb:COLORS.green}}});sheet.addRow(['Month','True spending','Income','Investment contributions','Savings / loss','Budget','Remaining / over','Projected finish','Top 5 categories','Top 5 qualifying expenses']);months.forEach(month=>sheet.addRow(summaryFor(month,transactions,portfolio)));styleSheet(sheet,[13,16,16,22,18,16,18,18,55,55],[2,3,4,5,6,7,8]);[9,10].forEach(index=>{sheet.getColumn(index).alignment={vertical:'top',wrapText:true}});for(let row=2;row<=sheet.rowCount;row++)sheet.getRow(row).height=130}

function addUploads(workbook,uploads){const sheet=workbook.addWorksheet('Upload History');sheet.addRow(['Uploaded at','Filename','Uploader','Rows','Added','Unchanged']);uploads.forEach(row=>sheet.addRow([new Date(row.uploadedAt),row.fileName,row.uploadedBy,Number(row.rowCount)||0,Number(row.added)||0,Number(row.unchanged)||0]));sheet.getColumn(1).numFmt='mmm d, yyyy h:mm AM/PM';styleSheet(sheet,[23,42,30,12,12,14])}

function addInfo(workbook,{scope,months,transactions,lastUpload}){const sheet=workbook.addWorksheet('Export Info',{properties:{tabColor:{argb:COLORS.green}}}),dates=transactions.map(row=>row.date).sort();sheet.addRows([['Budget Wrapped export',''],['Generated at',new Date()],['Scope',scope],['Included months',months.join(', ')||'None'],['Transaction rows',transactions.length],['Date range',dates.length?`${dates[0]} through ${dates.at(-1)}`:'No transactions'],['Latest source file',lastUpload?.fileName||'None'],['Latest source upload',lastUpload?.uploadedAt?new Date(lastUpload.uploadedAt):'None'],['Source of truth','Budget Wrapped and its Cloudflare D1 database remain authoritative. Spreadsheet edits do not sync back.']]);sheet.getRow(1).height=32;sheet.mergeCells('A1:B1');sheet.getCell('A1').font={bold:true,size:18,color:{argb:COLORS.green}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:COLORS.navy}};sheet.getColumn(1).width=24;sheet.getColumn(2).width=88;sheet.getColumn(1).font={bold:true};sheet.getColumn(2).alignment={wrapText:true,vertical:'top'};sheet.getCell('B2').numFmt='mmm d, yyyy h:mm AM/PM';if(lastUpload?.uploadedAt)sheet.getCell('B8').numFmt='mmm d, yyyy h:mm AM/PM'}

async function saveWorkbook(workbook,fileName){const buffer=await workbook.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export async function buildBudgetWorkbook({scope,month,shared,portfolio}){
  if(!shared.available)throw new Error('Shared family data is unavailable. Reconnect before exporting.')
  const module=await import('exceljs'),ExcelJS=module.default||module,workbook=new ExcelJS.Workbook();workbook.creator='Budget Wrapped';workbook.created=new Date();workbook.modified=new Date();workbook.subject='Private family budget snapshot'
  const allTransactions=shared.transactions||[],months=scope==='month'?[month]:[...new Set([...allTransactions.map(row=>row.date.slice(0,7)),...(shared.budgets||[]).map(row=>row.monthKey)])].sort(),transactions=scope==='month'?allTransactions.filter(row=>row.date.startsWith(month)):allTransactions
  addTracking(workbook,transactions);addBudgets(workbook,months,shared.budgets||[],portfolio,scope==='month'?'Budget':'Monthly Budgets');addSummary(workbook,months,activeTransactions(transactions),portfolio,scope==='month'?'Summary':'Monthly Summary');if(scope==='full')addUploads(workbook,shared.uploadHistory||[]);addInfo(workbook,{scope:scope==='full'?'Complete family archive':`Selected month: ${month}`,months,transactions,lastUpload:shared.lastUpload})
  if((shared.transactionMatches||[]).length){const audit=workbook.addWorksheet('Reconciliation Audit');audit.addRow(['Manual key','Imported key','Prior override','Applied override','Matched at','Matched by','Undone at']);(shared.transactionMatches||[]).filter(match=>scope==='full'||transactions.some(row=>row.txnKey===match.manualKey||row.txnKey===match.importedKey)).forEach(match=>audit.addRow([match.manualKey,match.importedKey,match.previousOverride,match.appliedOverride,match.linkedAt,match.linkedBy,match.undoneAt]));styleSheet(audit,[48,48,24,24,25,30,25]);}
  const settings=(shared.savingsSettings||[]).filter(row=>scope==='full'||row.monthKey===month);if(settings.length){const sheet=workbook.addWorksheet('Savings Plan');sheet.addRow(['Month','Expected income','Savings target','Grocery baseline','Restaurant baseline','Updated at','Updated by']);settings.forEach(row=>sheet.addRow([row.monthKey,row.income/100,row.savings/100,row.groceriesBaseline/100,row.restaurantsBaseline/100,row.updatedAt,row.updatedBy]));styleSheet(sheet,[14,20,20,20,20,25,30],[2,3,4,5]);}
  const stamp=todayKey(),fileName=scope==='full'?`budget-wrapped-full-${stamp}.xlsx`:`budget-wrapped-${month}-${stamp}.xlsx`;return {workbook,fileName}
}

export async function exportBudgetWorkbook(options){
  const {workbook,fileName}=await buildBudgetWorkbook(options);await saveWorkbook(workbook,fileName);return fileName
}
