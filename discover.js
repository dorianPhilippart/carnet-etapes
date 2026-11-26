export const interests = {
  visite: 'Culture', nature: 'Plein air', repas: 'Gastronomie', quartier: 'Quartiers et balades',
};
export const durations = [1, 2, 3, 4];
const geocoding = 'https://geocoding-api.open-meteo.com/v1/search';
const overpass = 'https://overpass-api.de/api/interpreter';
const tags = {
  visite: { tourism: /^(museum|gallery|artwork)$/, historic: /^(castle|monument|archaeological_site)$/ },
  nature: { leisure: /^(park|garden|nature_reserve)$/, natural: /^beach$/ },
  repas: { amenity: /^(marketplace|restaurant|food_court)$/ },
  quartier: { tourism: /^(viewpoint|attraction)$/, place: /^(quarter|neighbourhood)$/ },
};

async function json(url, options = {}) {
  const {signal, ...init} = options;
  const timeout = AbortSignal.timeout(22000);
  const response = await fetch(url, { ...init, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
    signal:signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error('Le service de recherche est momentanément indisponible. Réessayez dans un instant.');
  return response.json();
}

export async function findCities(name, signal) {
  const query = new URLSearchParams({name:name.trim(), language:'fr', count:'10', format:'json'});
  const data = await json(geocoding+'?'+query, {signal});
  return (data.results || []).filter(row => /^PPL/.test(row.feature_code || '') &&
    Number.isSafeInteger(row.id) && Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
    .slice(0, 6).map(row => ({
      id:String(row.id), city:row.name, region:row.admin1, country:row.country,
      latitude:row.latitude, longitude:row.longitude
    }));
}

function themesFor(themes) {
  const selected = Object.keys(tags).filter(theme => themes.includes(theme));
  return selected.length ? selected : Object.keys(tags);
}

export function activityQuery(city, themes) {
  const {latitude, longitude} = city;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) {
    throw new Error('Les coordonnées de la destination sont invalides.');
  }
  const around = '(around:5000,'+latitude.toFixed(5)+','+longitude.toFixed(5)+');';
  return '[out:json][timeout:14];' + themesFor(themes).map(theme => {
    const selectors = Object.entries(tags[theme]).map(([key, regex]) =>
      'nwr["name"]["'+key+'"~"'+regex.source+'"]'+around);
    return '('+selectors.join('')+');out center 65;';
  }).join('');
}

export function makeSuggestion(city, elements, {themes = [], days = 2}) {
  const duration = durations.includes(days) ? days : 2;
  const selected = themesFor(themes);
  const seen = new Set();
  const byTheme = selected.map(theme => {
    const matching = elements.filter(row => Object.entries(tags[theme]).some(([key,re]) => re.test(row.tags?.[key] || '')));
    function distance(row) {
      const lat = row.lat ?? row.center?.lat;
      const lon = row.lon ?? row.center?.lon;
      return Number.isFinite(lat) && Number.isFinite(lon) ?
        (lat-city.latitude)**2 + ((lon-city.longitude)*Math.cos(city.latitude*Math.PI/180))**2 : Infinity;
    }
    function rank(row) { return (row.tags?.wikidata ? 2 : 0) + (row.tags?.wikipedia ? 1 : 0); }
    const ranked = matching.sort((a,b) => rank(b)-rank(a) || distance(a)-distance(b));
    const result = [];
    for (const row of ranked) {
      const title = (row.tags?.['name:fr'] || row.tags?.name || '').trim().slice(0,120);
      if (!title || seen.has(title.toLocaleLowerCase('fr')) || !['node','way','relation'].includes(row.type) || !Number.isSafeInteger(row.id)) continue;
      seen.add(title.toLocaleLowerCase('fr'));
      const street = [row.tags['addr:housenumber'], row.tags['addr:street']].filter(Boolean).join(' ');
      const place = [title, street, city.city, city.country].filter(Boolean).join(', ').slice(0,200);
      result.push({id:row.type+'-'+row.id, title, place, theme, category:theme==='repas'?'repas':'visite',
        source:'https://www.openstreetmap.org/'+row.type+'/'+row.id});
      if (result.length === 4) break;
    }
    return result;
  });
  const matches = byTheme.flatMap(group => group);
  const ordered = [0,1,2,3].flatMap(i => byTheme.flatMap(group => group[i] ? [group[i]] : []));
  return {...city, duration, matches, plan:ordered.slice(0,duration)};
}

export async function fetchSuggestion(city, preferences, signal) {
  const data = await json(overpass, {method:'POST', body:new URLSearchParams({data:activityQuery(city,preferences.themes)}), signal});
  if (!Array.isArray(data.elements) || data.remark) throw new Error('La recherche de lieux a été interrompue. Réessayez dans un instant.');
  return makeSuggestion(city,data.elements,preferences);
}
