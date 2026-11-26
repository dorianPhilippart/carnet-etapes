// A fictional demonstration itinerary. Dates and times use the destination's local time.
const stages = [
  [10, '09:00', 'Le temple Sensō-ji', 'Sensō-ji, Asakusa, Tokyo', 'visite', 'Entrer par la porte Kaminarimon et prendre le temps de parcourir la rue Nakamise.'],
  [10, '12:30', 'Déjeuner à Asakusa', 'Asakusa, Tokyo', 'repas', 'Une pause autour d’un bol de soba.'],
  [10, '15:00', 'Promenade au parc d’Ueno', 'Ueno, Tokyo', 'visite', 'Longer l’étang de Shinobazu avant de rentrer.'],
  [11, '10:00', 'Les jardins de Meiji-jingū', 'Harajuku, Tokyo', 'visite', 'Suivre les allées boisées depuis la gare de Harajuku.'],
  [11, '17:30', 'Shibuya à la tombée du jour', 'Shibuya, Tokyo', 'visite', 'Retrouver la statue de Hachikō à la sortie de la gare.'],
  [12, '09:15', 'Train vers Hakone', 'Shinjuku, Tokyo', 'transport', 'Vérifier l’horaire choisi au moment de la réservation.'],
  [12, '16:00', 'Arrivée au ryokan', 'Hakone-Yumoto', 'hebergement', 'Prévoir une soirée au calme.'],
  [13, '10:00', 'Balade au bord du lac Ashi', 'Motohakone, Hakone', 'visite', 'Suivre la rive jusqu’au sanctuaire.'],
  [14, '09:30', 'En route pour Kyoto', 'Gare d’Odawara', 'transport', 'Prévoir une marge pour la correspondance.'],
  [14, '16:00', 'Les ruelles de Higashiyama', 'Higashiyama, Kyoto', 'visite', 'Se promener à pied en fin de journée.'],
  [15, '08:00', 'Les torii de Fushimi Inari', 'Fushimi, Kyoto', 'visite', 'Remplir la gourde avant de commencer la montée.'],
  [16, '11:30', 'Dernier déjeuner à Nishiki', 'Marché de Nishiki, Kyoto', 'repas', 'Choisir quelques spécialités avant le départ.']
];

export const demoTrip = {
  id: '4897b393-e2f5-40ad-bfa4-67a15da7bf5e',
  title: 'Japon au printemps',
  destination: 'Japon',
  startDate: '2027-04-10',
  endDate: '2027-04-16',
  notes: 'De Tokyo à Kyoto, avec une halte à Hakone. Prévoir une journée pour profiter des paysages autour du lac Ashi.',
  stops: stages.map(([day, time, title, place, category, notes], index) => ({
    id: 'c70d2e88-354a-4916-841c-' + String(index + 1).padStart(12, '0'),
    date: '2027-04-' + day, time, title, place, category, notes
  }))
};
