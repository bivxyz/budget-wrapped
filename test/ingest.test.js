import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeTransactions } from '../scripts/ingest.mjs'
const a={date:'2026-03-01',amount:10,name:'Cafe',account:'Card'}
test('upsert is key based and idempotent',()=>{const first=mergeTransactions([], [a]); const second=mergeTransactions(first.rows,[a]); assert.equal(first.added,1); assert.equal(second.added,0); assert.equal(second.rows.length,1)})
test('partial export unions with stored month',()=>{const b={...a,date:'2026-03-15'}; const result=mergeTransactions([a],[b]); assert.equal(result.rows.length,2)})
test('exact duplicate keys collapse deterministically',()=>{const result=mergeTransactions([], [a,{...a}]);assert.equal(result.rows.length,1);assert.equal(result.added,1)})
