import assert from 'node:assert/strict';
import test from 'node:test';
import {routeRequest, fuelCost, fetchTransport} from '../transport.js';

const stops = [
  {title:'Note privée',coordinates:{lat:48.581,lon:7.752}},
  {title:'Musée',coordinates:{lat:48.58,lon:7.76}}
];

test('Le trajet choisit le bon profil et ne transmet que les coordonnées ordonnées', () => {
  const url=routeRequest(stops,'bike');
  assert.match(url,/routed-bike\/route\/v1\/cycling\/7\.75200,48\.58100;7\.76000,48\.58000/);
  assert.doesNotMatch(url,/Musée|privée/);
  assert.throws(()=>routeRequest([stops[0],{}],'car'),/géolocalisées/);
  assert.throws(()=>routeRequest(stops,'train'),/géolocalisées/);
});

test('Le coût utilise les kilomètres et les valeurs de consommation fournies', () => {
  assert.equal(fuelCost(100000,6,2),12);
  assert.equal(fuelCost(20000,0,2),null);
});

test('Le service de trajet fournit les mètres et secondes sans cache ni session', async t => {
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.match(url,/routed-foot/);
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    return Response.json({code:'Ok',routes:[{distance:1234,duration:987}]});
  });
  assert.deepEqual(await fetchTransport(stops,'foot'),{meters:1234,seconds:987});
});
