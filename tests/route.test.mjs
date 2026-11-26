import assert from 'node:assert/strict';
import test from 'node:test';
import { nextLeg, stopMapLink } from '../route.js';

const first = { id:'1', date:'2027-03-01', title:'Note personnelle', place:'Rue A & B, Lyon' };
const second = { id:'2', date:first.date, time:'15:00', title:'Visite privée', place:'Musée, Lyon' };
test('Google Maps reçoit uniquement les deux lieux dans le bon ordre', () => {
  const {next, url} = nextLeg([first,second], first);
  assert.equal(next,second);
  const link = new URL(url);
  assert.equal(link.origin + link.pathname,'https://www.google.com/maps/dir/');
  assert.deepEqual(Object.fromEntries(link.searchParams), {api:'1', origin:first.place, destination:second.place});
  assert.equal(new URL(stopMapLink(first)).searchParams.get('query'),first.place);
});
test('La dernière étape, un autre jour et les lieux imprécis ne génèrent pas de trajet', () => {
  assert.equal(nextLeg([first,second], second),null);
  assert.equal(nextLeg([first,{...second,date:'2027-03-02'}],first),null);
  for(const place of ['', '  ', first.place.toUpperCase()]){
    const leg=nextLeg([first,{...second,place}],first);
    assert.equal(leg.next.id,second.id);
    assert.ok(leg.hint);
    assert.equal(leg.url,undefined);
  }
  assert.equal(stopMapLink({}),null);
});
