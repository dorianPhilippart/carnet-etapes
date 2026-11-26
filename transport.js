export const travelModes = {foot:'À pied', bike:'À vélo', car:'En voiture'};
const profile = {foot:'walking', bike:'cycling', car:'driving'};
const endpoint = 'https://routing.openstreetmap.de';
let lastRequest = 0;

export function validPoint(point) {
  return Number.isFinite(point?.lat) && Math.abs(point.lat)<=90 &&
    Number.isFinite(point?.lon) && Math.abs(point.lon)<=180;
}

export function routeRequest(stops, mode) {
  if (!Object.hasOwn(profile,mode) || stops.length < 2 || stops.length > 50 || !stops.every(stop=>validPoint(stop.coordinates))) {
    throw new Error('Choisis une journée avec 2 à 50 étapes géolocalisées.');
  }
  const coordinates = stops.map(({coordinates:{lat,lon}})=>lon.toFixed(5)+','+lat.toFixed(5)).join(';');
  return endpoint+'/routed-'+mode+'/route/v1/'+profile[mode]+'/'+coordinates+'?overview=false&steps=false';
}

export function fuelCost(meters, litresPer100km, eurosPerLitre) {
  if (![meters,litresPer100km,eurosPerLitre].every(Number.isFinite) ||
      meters<0 || litresPer100km<=0 || eurosPerLitre<=0) return null;
  return meters/100000*litresPer100km*eurosPerLitre;
}

export async function fetchTransport(stops, mode) {
  const url = routeRequest(stops,mode);
  const run = async () => {
    const delay = Math.max(0,1050-(Date.now()-lastRequest));
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    lastRequest = Date.now();
    let response;
    try {
      response = await fetch(url,{credentials:'omit',cache:'no-store',referrerPolicy:'origin',signal:AbortSignal.timeout(12000)});
    } catch {
      throw new Error('Le service de calcul de trajet ne répond pas. Réessaie dans un instant.');
    }
    if (!response.ok && response.status!==400) throw new Error('Le service de calcul de trajet est indisponible.');
    const data = await response.json();
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !Number.isFinite(route?.distance) || !Number.isFinite(route?.duration)) {
      throw new Error('Aucun trajet trouvé pour ce mode entre ces étapes.');
    }
    return {meters:route.distance, seconds:route.duration};
  };
  if (!globalThis.navigator?.locks) return run();
  return navigator.locks.request('carnet-etapes-transport',async ()=>{
    try { return await run(); }
    finally {
      const cooldown = Math.max(0,1050-(Date.now()-lastRequest));
      if(cooldown) await new Promise(resolve=>setTimeout(resolve,cooldown));
    }
  });
}
