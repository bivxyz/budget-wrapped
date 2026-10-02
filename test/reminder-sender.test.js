import test from 'node:test'
import assert from 'node:assert/strict'
import { sendMessage } from '../scripts/imessage-reminders.mjs'

test('Messages sender passes recipient and body as arguments and reports command failure',()=>{
  assert.doesNotThrow(()=>sendMessage('+15555550123','Groceries $250; do not interpolate "quotes".','/usr/bin/true'))
  assert.throws(()=>sendMessage('+15555550123','Test','/usr/bin/false'),/Messages did not accept/)
})
