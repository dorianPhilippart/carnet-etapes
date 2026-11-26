import assert from 'node:assert/strict';
import test from 'node:test';
import {activityQuery, makeSuggestion, findCities, fetchSuggestion} from '../discover.js';

const city = {id:'20',city:'Kyoto',country:'Japon',latitude:35.01,longitude:135.76};
const row = (id, name, tags) => ({type:'node',id,lat:35,lon:135.7,tags:{name,...tags}});

test('La requête n’envoie que des coordonnées validées et les catégories choisies', () => {
  const query=activityQuery(city,['nature','inconnue']);
  assert.match(query,/around:5000,35\.01000,135\.76000/);
  assert.match(query,/\["leisure"/);
  assert.doesNotMatch(query,/restaurant|inconnue|Kyoto/);
  assert.throws(()=>activityQuery({...city, latitude:');'}, []), /coordonnées/);
});

test('Le programme utilise les résultats distants, filtre et déduplique les lieux', () => {
  const places=[row(1,'Jardin',{leisure:'park'}), row(2,'Jardin',{leisure:'garden'}),
    row(3,'Marché',{amenity:'marketplace'}),row(4,'Musée',{tourism:'museum'})];
  const idea=makeSuggestion(city,places,{themes:['nature','repas'],days:4});
  assert.deepEqual(idea.plan.map(p=>p.title),['Jardin','Marché']);
  assert.equal(idea.duration,4);
  assert.equal(idea.matches[0].source,'https://www.openstreetmap.org/node/1');
});

test('Les deux étapes appellent des services distants sans transmettre de profil', async t => {
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,init) => {
    requests.push({url,init});
    return Response.json(requests.length===1 ? {results:[{...city,id:20,name:'Kyoto',feature_code:'PPLA'}]} :
      {elements:[row(42,'Musée',{tourism:'museum'})]});
  });
  const [destination]=await findCities('Kyoto');
  const result=await fetchSuggestion(destination,{days:1,themes:['visite']});
  assert.equal(result.matches[0].title,'Musée');
  assert.equal(new URL(requests[0].url).searchParams.get('name'),'Kyoto');
  assert.equal(new URL(requests[1].url).hostname,'overpass.private.coffee');
  assert.equal(requests[1].init.credentials,'omit');
  assert.doesNotMatch(new URL(requests[1].url).searchParams.get('data'),/Kyoto/);
});

test('Le secours Overpass répond si le premier serveur est indisponible', async t => {
  const hosts=[];
  t.mock.method(globalThis,'fetch',async url => {
    hosts.push(new URL(url).hostname);
    return hosts.length === 1 ? new Response('',{status:503}) : Response.json({elements:[]});
  });
  assert.deepEqual((await fetchSuggestion(city,{days:1,themes:[]})).matches,[]);
  assert.deepEqual(hosts,['overpass.private.coffee','overpass-api.de']);
});
