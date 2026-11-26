import test from 'node:test';
import assert from 'node:assert/strict';
import {findStops} from '../search.js';

const stops = [
  {id:'b',title:'Déjeuner',place:'Lyon',category:'repas',notes:'Table côté cour',date:'2027-04-11'},
  {id:'c',title:'Musée',place:'Île de la Cité',category:'visite',date:'2027-04-10'},
  {id:'a',title:'À l’hôtel',category:'hebergement',notes:'Cœur de Lyon',date:'2027-04-10',time:'09:00'}
];
const ids = (...args) => findStops(stops,...args).map(stop=>stop.id);
test('Recherche sur toutes les dates, plusieurs champs, accents et ligatures', () => {
  assert.deepEqual(ids('lyon cote'), ['b']);
  assert.deepEqual(ids('coeur hotel'), ['a']);
  assert.deepEqual(ids('île cité'), ['c']);
  assert.deepEqual(ids('hébergement'), ['a']);
});
test('Filtre combiné, ordre chronologique et absence de résultat', () => {
  assert.deepEqual(ids('','visite'), ['c']);
  assert.deepEqual(ids('lyon','visite'), []);
  assert.deepEqual(ids('  '), ['a','c','b']);
  assert.deepEqual(stops.map(s=>s.id), ['b','c','a']);
});
