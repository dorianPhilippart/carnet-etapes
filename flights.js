import { stayDates } from './discover.js';

export function flightSearch({ departure, arrival, start, end, adults, flexible }, today) {
  const origin = departure.trim().toUpperCase();
  const destination = arrival.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    throw new Error('Saisis les codes à trois lettres des deux aéroports, par exemple CDG et LIS.');
  }
  if (origin === destination) throw new Error('Choisis deux aéroports différents.');
  if (!stayDates(start,end)?.nights || start < today) {
    throw new Error('Indique dans Découvrir des dates d’aller et de retour à venir.');
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 8) throw new Error('La comparaison accepte 1 à 8 adultes.');
  const shift = (date, days) => new Date(+new Date(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  const windows = flexible === 1 || flexible === 3 ? [0,-flexible,flexible] : [0];
  return windows.map(delta => {
    const outbound = shift(start,delta), inbound = shift(end,delta);
    const kayak = 'https://www.kayak.fr/flights/'+origin+'-'+destination+'/'+outbound+'/'+inbound+
      '/'+adults+'adults?sort=price_a';
    const compact = date => date.slice(2).replaceAll('-','');
    const query = new URLSearchParams({adultsv2:String(adults), currency:'EUR', cabinclass:'economy'});
    const skyscanner = 'https://www.skyscanner.fr/transport/flights/'+origin.toLowerCase()+'/'+destination.toLowerCase()+
      '/'+compact(outbound)+'/'+compact(inbound)+'/?'+query;
    return {outbound,inbound,delta,kayak,skyscanner};
  }).filter(window=>window.outbound>=today);
}
