export const interests = {
  visite: 'Culture',
  nature: 'Plein air',
  repas: 'Gastronomie',
  quartier: 'Quartiers et balades',
};

const catalog = [
  ['paris', 'Paris', 'Europe', 'France', [
    ['Musée d’Orsay', 'Musée d’Orsay, Paris', 'visite'],
    ['Jardin du Luxembourg', 'Jardin du Luxembourg, Paris', 'nature'],
    ['Marché d’Aligre', 'Place d’Aligre, Paris', 'repas'],
    ['Balade au canal Saint-Martin', 'Canal Saint-Martin, Paris', 'quartier'],
  ]],
  ['lisbonne', 'Lisbonne', 'Europe', 'Portugal', [
    ['Musée national de l’Azulejo', 'Museu Nacional do Azulejo, Lisboa', 'visite'],
    ['Jardin botanique', 'Jardim Botânico de Lisboa', 'nature'],
    ['Pause gourmande à Belém', 'Belém, Lisboa', 'repas'],
    ['Balade dans l’Alfama', 'Alfama, Lisboa', 'quartier'],
  ]],
  ['rome', 'Rome', 'Europe', 'Italie', [
    ['Le Panthéon', 'Pantheon, Roma', 'visite'],
    ['Promenade à la Villa Borghèse', 'Villa Borghese, Roma', 'nature'],
    ['Le marché de Testaccio', 'Mercato Testaccio, Roma', 'repas'],
    ['Les rues du Trastevere', 'Trastevere, Roma', 'quartier'],
  ]],
  ['kyoto', 'Kyoto', 'Asie', 'Japon', [
    ['Les torii de Fushimi Inari', 'Fushimi Inari Taisha, Kyoto', 'visite'],
    ['Balade à Arashiyama', 'Arashiyama, Kyoto', 'nature'],
    ['Déjeuner au marché de Nishiki', 'Nishiki Market, Kyoto', 'repas'],
    ['Les ruelles de Higashiyama', 'Higashiyama, Kyoto', 'quartier'],
  ]],
  ['tokyo', 'Tokyo', 'Asie', 'Japon', [
    ['Le temple Sensō-ji', 'Sensō-ji, Asakusa, Tokyo', 'visite'],
    ['Promenade au parc d’Ueno', 'Ueno Park, Tokyo', 'nature'],
    ['Pause gourmande à Tsukiji', 'Tsukiji Outer Market, Tokyo', 'repas'],
    ['Balade à Daikanyama', 'Daikanyama, Tokyo', 'quartier'],
  ]],
  ['taipei', 'Taipei', 'Asie', 'Taïwan', [
    ['Musée national du Palais', 'National Palace Museum, Taipei', 'visite'],
    ['Parc forestier de Daan', 'Daan Forest Park, Taipei', 'nature'],
    ['Marché de nuit de Raohe', 'Raohe Night Market, Taipei', 'repas'],
    ['Balade dans Dadaocheng', 'Dadaocheng, Taipei', 'quartier'],
  ]],
].map(([id, city, region, country, places]) => ({
  id, city, region, country,
  activities: places.map(([title, place, theme], index) => ({
    id: id + '-' + index, title, place, theme, category: theme === 'repas' ? 'repas' : 'visite',
  }))
}));

export const destinations = Object.fromEntries(catalog.map(({id, city}) => [id, city]));
export const durations = [1, 2, 3, 4];

export function suggest({ destination = '', themes = [], days = 2 }) {
  const duration = durations.includes(days) ? days : 2;
  const selected = themes.filter(theme => Object.hasOwn(interests, theme));
  return catalog.filter(city => !destination || [city.id, city.region].includes(destination)).map(city => {
    const matches = city.activities.filter(activity => !selected.length || selected.includes(activity.theme));
    const extras = city.activities.filter(activity => !matches.includes(activity));
    const plan = [...matches, ...extras].slice(0, duration);
    return { ...city, duration, matches, plan };
  });
}
