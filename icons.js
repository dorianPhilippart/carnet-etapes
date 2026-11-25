const paths = {
  plane: '<path d="m3 13 7 1 4 7 2-1-2-8 6-6c1-1 1-3 0-3s-2 0-3 1l-6 6-8-2-1 2 5 3"/>',
  bag: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M8 8v12m8-12v12"/>',
  route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H16a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h7.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v17H6a2 2 0 0 0 0 3M4 5v15.5M7 17h12M9 7h6m-6 4h4"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="m15 5 4 4M4 20l4-.8L20 7.3a2.8 2.8 0 0 0-4-4L4.8 15.5Z"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/>',
  cloud: '<path d="M7 18h10a4.5 4.5 0 1 0-.9-8.9 6 6 0 0 0-11.5 2A3.5 3.5 0 0 0 7 18Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.7 8.3-2.1 5.3-5.3 2.1 2.1-5.3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', stack: '<path d="m3 8 9-5 9 5-9 5ZM3 12l9 5 9-5m-18 4 9 5 9-5"/>',
  visite: '<path d="M3 20h18M5 20v-8m5 8v-8m4 8v-8m5 8v-8M3 9l9-6 9 6v2H3Z"/>',
  repas: '<path d="M5 3v5a3 3 0 0 0 6 0V3M8 3v18m11 0V3c-3 2-4 6-4 10h4"/>',
  transport: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14m-7-8v8M9 15h.1m5.9 0h.1M8 18l-3 3m11-3 3 3"/>',
  hebergement: '<path d="M3 20V5m18 15V10a2 2 0 0 0-2-2h-6v7m-10 0h18"/><circle cx="8" cy="10" r="2"/>',
  autre: '<path d="m12 3 2.7 5.7L21 9.6 16.5 14l1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.3-.9Z"/>',
  note: '<path d="M5 3h14v12l-6 6H5ZM13 21v-6h6M8 7h8m-8 4h5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>',
  layers: '<rect x="4" y="5" width="12" height="15" rx="2"/><path d="M8 2h10a2 2 0 0 1 2 2v12"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', check: '<path d="m4 12 5 5L20 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
};

export function icon(name, size = 20) {
  return `<svg class="icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}

export const logo = '<svg viewBox="0 0 42 42" aria-hidden="true" fill="none"><path fill="currentColor" d="m2 19.4 36.5-15-8 33.2-9.2-10.2-6.3 5 .1-10.2Z"/><path d="m15 22.2 17.4-12.5-11.1 17.7" stroke="#fffaf1" stroke-width="1.7" stroke-linejoin="round"/></svg>';
