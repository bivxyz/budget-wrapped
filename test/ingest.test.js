import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeTransactions } from '../scripts/ingest.mjs'
const a={date:'2026-03-01',amount:10,name:'Cafe',account:'Card'}
test('upsert is key based and idempotent',()=>{const first=mergeTransactions([], [a]); const second=mergeTransactions(first.rows,[a]); assert.equal(first.added,1); assert.equal(second.added,0); assert.equal(second.rows.length,1)})
test('partial export unions with stored month',()=>{const b={...a,date:'2026-03-15'}; const result=mergeTransactions([a],[b]); assert.equal(result.rows.length,2)})
test('identical purchases get deterministic occurrence keys and remain idempotent',()=>{const first=mergeTransactions([], [a,{...a}]);assert.equal(first.rows.length,2);assert.equal(first.added,2);assert.match(first.rows[1].importKey,/duplicate:2$/);const second=mergeTransactions(first.rows,[a,{...a}]);assert.equal(second.rows.length,2);assert.equal(second.added,0)})
