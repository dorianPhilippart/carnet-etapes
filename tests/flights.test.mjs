import assert from 'node:assert/strict';
import test from 'node:test';
import { flightSearch } from '../flights.js';

const input={departure:'cdg',arrival:'lis',start:'2027-05-10',end:'2027-05-20',adults:2,flexible:3};

test('Les comparateurs reçoivent l’aller-retour, le nombre d’adultes et les dates flexibles',()=>{
  const choices=flightSearch(input,'2026-11-26');
  assert.deepEqual(choices.map(c=>[c.outbound,c.inbound]),[
    ['2027-05-10','2027-05-20'],['2027-05-07','2027-05-17'],['2027-05-13','2027-05-23']
  ]);
  assert.equal(new URL(choices[0].kayak).pathname,'/flights/CDG-LIS/2027-05-10/2027-05-20/2adults');
  assert.equal(new URL(choices[0].kayak).searchParams.get('sort'),'price_a');
  assert.equal(new URL(choices[0].skyscanner).pathname,'/transport/flights/cdg/lis/270510/270520/');
  assert.equal(new URL(choices[0].skyscanner).searchParams.get('adultsv2'),'2');
});

test('La comparaison refuse les dates et aéroports invalides et retire les variantes passées',()=>{
  assert.throws(()=>flightSearch({...input,departure:'CDG/foo'},'2026-11-26'),/aéroports/);
  assert.throws(()=>flightSearch({...input,arrival:'cdg'},'2026-11-26'),/différents/);
  assert.throws(()=>flightSearch({...input,end:input.start},'2026-11-26'),/dates/);
  assert.equal(flightSearch(input,'2027-05-09').length,2);
});
