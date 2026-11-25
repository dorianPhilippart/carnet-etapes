import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pruneSynced,legacyGroups,recoverGroup,discardGroup} from '../legacy.js';
import {SUPABASE_URL} from '../config.js';

test('La récupération conserve le brouillon après échec et isole chaque compte', async () => {
  const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
  const prefix='escale:data:v1:'+SUPABASE_URL+':', guest='escale:data:v1:guest';
  const draft={trip:{id:'old',title:'Rome'},dirty:true,revision:'old-v1'};
  const saved={...draft, dirty:false, base:'synced'};
  const data=new Map([[prefix+a, JSON.stringify({draft,saved})],[prefix+b, JSON.stringify({saved})],[guest,JSON.stringify({draft})],['other-app','keep']]);
  globalThis.localStorage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,removeItem:k=>data.delete(k),setItem:(k,v)=>data.set(k,v)};
  pruneSynced();
  assert.equal(data.has(prefix+b),false);
  assert.deepEqual(Object.keys(JSON.parse(data.get(prefix+a))),['draft']);
  assert.equal(legacyGroups(b).length,1);
  await assert.rejects(recoverGroup(prefix+a,b,()=>b,()=>{}));
  let firstId;
  await assert.rejects(recoverGroup(prefix+a,a,()=>a,trip=>{firstId=trip.id; throw Error('network');}));
  assert.ok(data.get(prefix+a));
  await recoverGroup(prefix+a,a,()=>a,trip=>assert.equal(trip.id,firstId));
  assert.equal(data.has(prefix+a),false);
  assert.ok(data.get(guest));
  assert.throws(()=>discardGroup(guest,b,()=>a));
  discardGroup(guest,a,()=>a);
  assert.equal(data.get('other-app'),'keep');
  assert.equal(data.has(guest),false);
});
