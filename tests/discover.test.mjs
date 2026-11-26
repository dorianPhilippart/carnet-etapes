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

test('Wikipédia fournit des résultats réels lorsque les deux serveurs Overpass échouent', async t => {
  t.mock.method(globalThis,'fetch',async url => {
    const endpoint = new URL(url);
    if (endpoint.hostname !== 'fr.wikipedia.org') return new Response('',{status:503});
    if(endpoint.searchParams.get('prop')==='coordinates') return Response.json({query:{pages:{123:{coordinates:[{lat:35.02,lon:135.76,globe:'earth'}]}}}});
    assert.match(endpoint.searchParams.get('srsearch'),/nearcoord:5km,35\.01,135\.76/);
    return Response.json({query:{search:[{pageid:123,title:'Musée trouvé'}]}});
  });
  const idea=await fetchSuggestion(city,{themes:['visite'],days:1});
  assert.equal(idea.via,'Wikipédia');
  assert.equal(idea.plan[0].source,'https://fr.wikipedia.org/?curid=123');
  assert.ok(idea.plan[0].distance>1);
  assert.match(idea.plan[0].map,/mlat=35.02/);
});

test('Le rayon choisi est borné et les activités sont placées sur les jours choisis', async () => {
  const {distanceKm, scheduleActivities} = await import('../discover.js');
  assert.match(activityQuery(city,[],2),/around:2000,/);
  assert.match(activityQuery(city,[],900),/around:5000,/);
  assert.equal(distanceKm(city,city.latitude,city.longitude),0);
  assert.ok(distanceKm(city,city.latitude+.01,city.longitude)>1);
  assert.equal(distanceKm(city,undefined,undefined),null);
  const places=[{id:'a'},{id:'b'},{id:'c'}];
  assert.deepEqual(scheduleActivities(places,new Map([['a',2],['c',2]]),3),[[],[places[0],places[2]],[]]);
});

test('Les dates calculent le budget par nuit et sont transmises au comparateur', async () => {
  const {stayDates,lodgingComparison}=await import('../discover.js');
  const dates=stayDates('2027-03-27','2027-04-02');
  assert.deepEqual([dates.days,dates.nights],[7,6]);
  assert.equal(stayDates('2027-03-01','2027-03-30').days,30);
  assert.throws(()=>stayDates('2027-03-01','2027-03-31'),/30 jours/);
  assert.throws(()=>stayDates('2027-02-30','2027-03-02'));
  const result=lodgingComparison('Lisbonne, Portugal',dates,3,500);
  assert.equal(result.nightly,83.33);
  assert.equal(new URL(result.url).searchParams.get('checkin'),'2027-03-27');
  assert.equal(new URL(result.url).searchParams.get('group_adults'),'3');
  assert.equal(lodgingComparison('Portugal',null,1,0),null);
});

test('La recherche pays récupère la capitale puis limite le géocodage au pays choisi', async t => {
  const {findCountryCities}=await import('../discover.js');
  t.mock.method(globalThis,'fetch',async url => {
    const endpoint=new URL(url);
    if(endpoint.hostname==='api.worldbank.org') return Response.json([{},[{capitalCity:'Lisbon'}]]);
    assert.equal(endpoint.searchParams.get('countryCode'),'PT');
    assert.equal(endpoint.searchParams.get('name'),'Lisbon');
    return Response.json({results:[{id:20,name:'Lisbonne',country_code:'PT',feature_code:'PPLC',latitude:38.7,longitude:-9.1}]});
  });
  assert.equal((await findCountryCities('PT'))[0].city,'Lisbonne');
});
