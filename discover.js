export const interests = {
  visite: 'Culture', nature: 'Plein air', repas: 'Gastronomie', quartier: 'Quartiers et balades',
};
export const maxDuration = 30;
export const durations = Array.from({length:maxDuration}, (_,i)=>i+1);
const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const displayCountries = new Intl.DisplayNames(['fr'], {type:'region'});
export const countries = countryCodes.map(code=>[code,displayCountries.of(code)])
  .sort((a,b)=>a[1].localeCompare(b[1],'fr'));

export function stayDates(start, end) {
  const iso = value => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = new Date(value+'T00:00:00Z');
    return Number.isFinite(+date) && date.toISOString().slice(0,10)===value ? +date : NaN;
  };
  if (!start && !end) return null;
  const nights = (iso(end)-iso(start))/86400000;
  if (!Number.isInteger(nights) || nights < 0 || nights >= maxDuration) {
    throw new Error('Indiquez des dates dans l’ordre, pour un séjour de 1 à '+maxDuration+' jours.');
  }
  return {start, end, days:nights+1, nights};
}

export function lodgingComparison(target, dates, adults, budget) {
  if (!dates?.nights || !target) return null;
  const query = new URLSearchParams({ss:target, checkin:dates.start, checkout:dates.end,
    group_adults:String(adults), no_rooms:'1', selected_currency:'EUR'});
  return {url:'https://www.booking.com/searchresults.fr.html?'+query,
    nightly:budget > 0 ? Math.floor(budget*100/dates.nights)/100 : null, nights:dates.nights};
}

export const radii = [2, 5, 10];
const radiusKm = value => radii.includes(value) ? value : 5;
const geocoding = 'https://geocoding-api.open-meteo.com/v1/search';
const overpass = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const perTheme = 8;
const tags = {
  visite: { tourism: /^(museum|gallery|artwork)$/, historic: /^(castle|monument|archaeological_site)$/ },
  nature: { leisure: /^(park|garden|nature_reserve)$/, natural: /^beach$/ },
  repas: { amenity: /^(marketplace|restaurant|food_court)$/ },
  quartier: { tourism: /^(viewpoint|attraction)$/, place: /^(quarter|neighbourhood)$/ },
};

async function json(url, options = {}) {
  const {signal, timeoutMs = 22000, ...init} = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
    signal:signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error('Le service de recherche est momentanément indisponible. Réessayez dans un instant.');
  return response.json();
}

export async function findCities(name, signal, country) {
  const query = new URLSearchParams({name:name.trim(), language:'fr', count:'10', format:'json'});
  if(countryCodes.includes(country)) query.set('countryCode',country);
  const data = await json(geocoding+'?'+query, {signal});
  return (data.results || []).filter(row => /^PPL/.test(row.feature_code || '') &&
    (!country || row.country_code === country) && Number.isSafeInteger(row.id) && Number.isFinite(row.latitude) && Number.isFinite(row.longitude))
    .slice(0, 6).map(row => ({
      id:String(row.id), city:row.name, region:row.admin1, country:row.country,
      latitude:row.latitude, longitude:row.longitude
    }));
}

export async function findCountryCities(country, signal) {
  if (!countryCodes.includes(country)) throw new Error('Choisissez un pays.');
  const data = await json('https://api.worldbank.org/v2/country/'+country+'?format=json', {signal});
  const capital = Array.isArray(data) ? data[1]?.[0]?.capitalCity : '';
  if (!capital) return [];
  return findCities(capital,signal,country);
}

function themesFor(themes) {
  const selected = Object.keys(tags).filter(theme => themes.includes(theme));
  return selected.length ? selected : Object.keys(tags);
}

export function activityQuery(city, themes, radius) {
  const {latitude, longitude} = city;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) {
    throw new Error('Les coordonnées de la destination sont invalides.');
  }
  const around = '(around:'+radiusKm(radius)*1000+','+latitude.toFixed(5)+','+longitude.toFixed(5)+');';
  return '[out:json][timeout:14];' + themesFor(themes).map(theme => {
    const selectors = Object.entries(tags[theme]).map(([key, regex]) =>
      'nwr["name"]["'+key+'"~"'+regex.source+'"]'+around);
    return '('+selectors.join('')+');out center 65;';
  }).join('');
}

export function distanceKm(city, lat, lon) {
  if (![city.latitude,city.longitude,lat,lon].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const a = Math.sin((lat-city.latitude)*radians/2)**2 +
    Math.cos(city.latitude*radians)*Math.cos(lat*radians)*Math.sin((lon-city.longitude)*radians/2)**2;
  return 12742*Math.asin(Math.sqrt(Math.min(1,a)));
}

function locationDetails(city, lat, lon) {
  const distance = distanceKm(city,lat,lon);
  return distance===null ? {} : {distance, map:'https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lon+'#map=16/'+lat+'/'+lon};
}

export function scheduleActivities(activities, assignments, duration) {
  return Array.from({length:duration}, (_,index) => activities.filter(activity=>assignments.get(activity.id)===index+1));
}

export function makeSuggestion(city, elements, {themes = [], days = 2}) {
  const duration = durations.includes(days) ? days : 2;
  const selected = themesFor(themes);
  const seen = new Set();
  const byTheme = selected.map(theme => {
    const matching = elements.filter(row => Object.entries(tags[theme]).some(([key,re]) => re.test(row.tags?.[key] || '')));
    const distance = row => distanceKm(city, row.lat ?? row.center?.lat, row.lon ?? row.center?.lon);
    function rank(row) { return (row.tags?.wikidata ? 2 : 0) + (row.tags?.wikipedia ? 1 : 0); }
    const ranked = matching.sort((a,b) => rank(b)-rank(a) || (distance(a) ?? Infinity)-(distance(b) ?? Infinity));
    const result = [];
    for (const row of ranked) {
      const title = (row.tags?.['name:fr'] || row.tags?.name || '').trim().slice(0,120);
      if (!title || seen.has(title.toLocaleLowerCase('fr')) || !['node','way','relation'].includes(row.type) || !Number.isSafeInteger(row.id)) continue;
      seen.add(title.toLocaleLowerCase('fr'));
      const street = [row.tags['addr:housenumber'], row.tags['addr:street']].filter(Boolean).join(' ');
      const place = [title, street, city.city, city.country].filter(Boolean).join(', ').slice(0,200);
      result.push({id:row.type+'-'+row.id, title, place, theme, ...locationDetails(city,row.lat ?? row.center?.lat,row.lon ?? row.center?.lon), category:theme==='repas'?'repas':'visite',
        source:'https://www.openstreetmap.org/'+row.type+'/'+row.id});
      if (result.length === perTheme) break;
    }
    return result;
  });
  const matches = byTheme.flatMap(group => group);
  const ordered = Array.from({length:perTheme},(_,i)=>i).flatMap(i => byTheme.flatMap(group => group[i] ? [group[i]] : []));
  return {...city, duration, matches, plan:ordered.slice(0,duration)};
}

const wikiTerms = {
  visite: 'musée OR monument OR château',
  nature: 'parc OR jardin OR réserve',
  repas: 'marché OR gastronomie OR halles',
  quartier: 'quartier OR promenade OR place',
};

async function encyclopediaSuggestion(city, preferences, signal) {
  const duration = durations.includes(preferences.days) ? preferences.days : 2;
  const groups = await Promise.allSettled(themesFor(preferences.themes).map(async theme => {
    const search = new URLSearchParams({action:'query', list:'search', format:'json', origin:'*',
      srnamespace:'0', srlimit:String(perTheme), srprop:'',
      srsearch:'nearcoord:'+radiusKm(preferences.radius)+'km,'+city.latitude+','+city.longitude+' ('+wikiTerms[theme]+')'});
    const data = await json('https://fr.wikipedia.org/w/api.php?'+search, {signal, timeoutMs:7500});
    if (!Array.isArray(data.query?.search)) throw new Error('Réponse Wikipédia indisponible.');
    return data.query.search.filter(row => Number.isSafeInteger(row.pageid) && typeof row.title === 'string')
      .map(row => ({
        id:'wiki-'+row.pageid, title:row.title.slice(0,120), theme, category:theme==='repas'?'repas':'visite',
        place:[row.title, city.city, city.country].filter(Boolean).join(', ').slice(0,200),
        source:'https://fr.wikipedia.org/?curid='+row.pageid
      }));
  }));
  if (groups.every(group=>group.status==='rejected')) throw new Error('La recherche de lieux est momentanément indisponible. Réessayez dans un instant.');
  const seen = new Set();
  const lists = groups.map(group=>group.status==='fulfilled' ? group.value : []);
  const matches = Array.from({length:perTheme},(_,i)=>i).flatMap(index=>lists.flatMap(list=>list[index]?[list[index]]:[]))
    .filter(place=>!seen.has(place.id) && seen.add(place.id));
  if(matches.length) {
    const query = new URLSearchParams({action:'query', prop:'coordinates', format:'json', origin:'*',
      pageids:matches.map(place=>place.id.slice(5)).join('|')});
    try {
      const data = await json('https://fr.wikipedia.org/w/api.php?'+query, {signal, timeoutMs:4000});
      for(const place of matches) {
        const coordinates = data.query?.pages?.[place.id.slice(5)]?.coordinates?.[0];
        if(coordinates?.globe === 'earth') Object.assign(place,locationDetails(city,coordinates.lat,coordinates.lon));
      }
    } catch(error) {
      if(signal?.aborted) throw error;
    }
  }
  return {...city, duration, matches, plan:matches.slice(0,duration), via:'Wikipédia'};
}

export async function fetchSuggestion(city, preferences, signal) {
  const query = new URLSearchParams({data:activityQuery(city,preferences.themes,preferences.radius)});
  for (const endpoint of overpass) {
    try {
      const data = await json(endpoint+'?'+query, {signal, timeoutMs:7000});
      if (Array.isArray(data.elements) && !data.remark) {
        return makeSuggestion(city,data.elements,preferences);
      }
    } catch(error) {
      if (signal?.aborted) throw error;
    }
  }
  return encyclopediaSuggestion(city, preferences, signal);
}
