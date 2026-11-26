function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function findStops(stops, query, category = '') {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return stops.filter(stop => {
    if (category && stop.category !== category) return false;
    const fields = normalize([stop.title, stop.place, stop.notes, stop.category].join(' '));
    return terms.every(term => fields.includes(term));
  }).sort((a, b) => a.date.localeCompare(b.date) ||
    (a.time || '99:99').localeCompare(b.time || '99:99'));
}
