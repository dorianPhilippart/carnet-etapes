// Only the explicitly entered places are shared when a traveller opens a map.
function placeOf(stop) {
  return typeof stop?.place === 'string' ? stop.place.trim() : '';
}

export function stopMapLink(stop) {
  const place = placeOf(stop);
  if (!place) return null;
  const url = new URL('https://www.google.com/maps/search/');
  url.search = new URLSearchParams({ api: '1', query: place }).toString();
  return url.href;
}

// Use the displayed timeline order, including its ordering of untimed stops.
export function nextLeg(sortedStops, stop) {
  const index = sortedStops.findIndex(candidate => candidate.id === stop.id);
  if (index < 0) return null;
  const next = sortedStops[index + 1];
  if (!next || next.date !== stop.date) return null;
  const origin = placeOf(stop);
  const destination = placeOf(next);
  if (!origin || !destination) return { next, hint: 'Renseignez les deux lieux pour ouvrir le trajet.' };
  const normalize = value => value.normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase('fr');
  if (normalize(origin) === normalize(destination)) return { next, hint: 'Même lieu indiqué pour les deux étapes.' };
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = new URLSearchParams({ api: '1', origin, destination }).toString();
  return { next, url: url.href };
}
