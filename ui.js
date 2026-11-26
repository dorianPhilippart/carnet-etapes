import {flightSearch} from './flights.js';
import {travelModes, validPoint, fetchTransport, fuelCost} from './transport.js';
import {durations, radii, interests, countries, stayDates, lodgingComparison, findCities, findCountryCities, fetchSuggestion, scheduleActivities} from './discover.js';
import {findStops} from './search.js';
import {stopMapLink, nextLeg} from './route.js';
import {getTrips, saveTrip, deleteTrip, subscribe, syncInfo} from './store.js';
import {icon, logo} from './icons.js';

const categories = {visite:'Visite', repas:'Repas', transport:'Transport', hebergement:'Hébergement', autre:'Autre'};
const pages = {voyages:'Mes voyages', itineraire:'Itinéraire', notes:'Notes de voyage', decouvrir:'Découvrir'};
const main = document.querySelector('#main');
const editor = document.querySelector('#editor');
const dayMillis = 86400000;
const text = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
const utc = iso => new Date(iso + 'T00:00:00Z');
const dayDistance = (from,to) => Math.round((utc(to) - utc(from)) / dayMillis);
const shiftDay = (from,count) => new Date(utc(from).getTime() + count * dayMillis).toISOString().slice(0,10);
const localToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
const fmt = (iso,options) => utc(iso).toLocaleDateString('fr-FR',{...options,timeZone:'UTC'});
const capitalize = string => string.charAt(0).toUpperCase() + string.slice(1);
const dateRange = trip => trip.startDate === trip.endDate ? fmt(trip.startDate,{day:'numeric',month:'long',year:'numeric'}) :
  fmt(trip.startDate,{day:'numeric',month:trip.startDate.slice(0,7) === trip.endDate.slice(0,7) ? undefined : 'short',year:trip.startDate.slice(0,4) === trip.endDate.slice(0,4) ? undefined : 'numeric'}) + ' – ' + fmt(trip.endDate,{day:'numeric',month:'long',year:'numeric'});
const isJapan = trip => /japon|japan|ky[oō]to|tokyo|osaka|hokkaido|okinawa|hiroshima|nippon/i.test(trip.title+' '+trip.destination);
const duration = trip => Math.max(1,dayDistance(trip.startDate,trip.endDate)+1);
const plural = (n,singular,other = singular+'s') => n+' '+(n===1 ? singular : other);
const ordered = stops => [...stops].sort((a,b)=>a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
let selectedId;
try { sessionStorage.removeItem('escale.activeTrip'); } catch {}
let preferences = {destination:'', country:'', start:'', end:'', adults:2, budget:0, themes:[], days:2, radius:5};
const dayAssignments = new Map();
const destinationKey = values => values.country+':'+values.destination;
let citiesFor = '';
let cities = [], suggestion, discoveryError = '', discoveryRequest;
let date, dateTrip, allDays = false, noticeTimeout, modalState;
const page = () => Object.hasOwn(pages,location.hash.slice(1)) ? location.hash.slice(1) : 'itineraire';
const activeTrip = (trips=getTrips()) => trips.find(t => t.id === selectedId) || trips[0];
const remember = id => { selectedId=id; };
function openPage(name) {
  if (page() === name) render();
  else location.hash = name;
}
function toast(message) {
  const element=document.querySelector('#toast');
  element.textContent=message;
  element.classList.add('show');
  clearTimeout(noticeTimeout);
  noticeTimeout=setTimeout(()=>element.classList.remove('show'),3600);
}
const button = (action,label,name,kind='secondary') => `<button type="button" class="btn ${kind}" data-action="${action}">${icon(name,17)}<span>${label}</span></button>`;
const iconButton = (action,label,name,extra='') => `<button type="button" class="icon-button ${extra}" data-action="${action}" aria-label="${label}" title="${label}">${icon(name,18)}</button>`;
const smallTitle = (name,title) => `<span class="section-icon">${icon(name,18)}</span><h2>${title}</h2>`;
function hero(trip) {
  return `<section aria-label="Voyage sélectionné" class="hero ${isJapan(trip)?'japan':'generic'}">
    <div class="hero-content"><div class="hero-label">${icon('bag',15)} Voyage</div>
    <h2>${text(trip.title)}</h2><div class="hero-meta"><span>${icon('pin',16)}${text(trip.destination)}</span><span>${icon('calendar',16)}${text(dateRange(trip))}</span></div></div>
    <button type="button" class="hero-menu" data-action="trip-menu" aria-label="Options du voyage" title="Options du voyage">${icon('more',20)}</button>
  </section>`;
}
function summary(trip) {
  const days=duration(trip), stops=trip.stops.length, planned=new Set(trip.stops.map(s=>s.date)).size;
  return `<aside class="summary"><div class="side-title">${smallTitle('compass','En un coup d’œil')}</div>
    <dl class="stats"><div><dt>${icon('calendar',16)}Durée du voyage</dt><dd>${plural(days,'jour')}</dd></div>
    <div><dt>${icon('route',16)}Étapes prévues</dt><dd>${stops}</dd></div>
    <div><dt>${icon('sun',16)}Jours planifiés</dt><dd>${planned} / ${days}</dd></div></dl>
    <div class="summary-note"><div class="side-title">${smallTitle('note','Note de voyage')}</div>
    ${trip.notes ? `<p class="note-preview">${text(trip.notes)}</p>` : '<p class="empty-note">Gardez ici une adresse, une idée ou un détail pratique.</p>'}
    <button type="button" class="text-btn" data-action="view-notes">${trip.notes?'Ouvrir les notes':'Ajouter une note'}${icon('right',14)}</button></div></aside>`;
}
function dayTabs(trip) {
  const dayIdx=dayDistance(trip.startDate,date), total=duration(trip);
  const first=Math.floor(dayIdx/7)*7;
  const tabs=Array.from({length:Math.min(total-first,7)},(_,i)=>{
    const day=shiftDay(trip.startDate,i+first);
    return `<button type="button" data-action="day" data-date="${text(day)}" class="day-tab ${day===date?'active':''}" aria-pressed="${day===date}" aria-label="${text(fmt(day,{weekday:'long',day:'numeric',month:'long'}))}"><span>${text(fmt(day,{weekday:'short'}).replace('.',''))}</span><strong>${day.slice(-2)}</strong></button>`;
  }).join('');
  return `<div class="date-selector">${first>0?iconButton('prev-week','Jours précédents','left','week-nav'):''}<div class="day-tabs">${tabs}</div>${first+7<total?iconButton('next-week','Jours suivants','right','week-nav'):''}</div>`;
}
function stopRow(stop) {
  const cat=Object.hasOwn(categories,stop.category)?stop.category:'autre';
  return `<li class="time-row"><div class="time">${text(stop.time||'—')}</div>
  <div class="track"><i></i></div><button class="stop-card" data-action="stop-detail" data-id="${text(stop.id)}">
  <span class="stop-symbol ${cat}">${icon(cat,21)}</span><span class="stop-copy"><strong>${text(stop.title)}</strong>${stop.place?`<span class="stop-place">${icon('pin',13)}${text(stop.place)}</span>`:''}</span>
  <span class="category ${cat}">${categories[cat]}</span>${icon('right',15)}</button></li>`;
}
function transportForm(activities, day, discoveryMode = false) {
  if (activities.length < 2 || activities.length > 50 || !activities.every(activity=>validPoint(activity.coordinates))) return '';
  return `<details class="transport-panel"><summary>Calculer les déplacements</summary>
    <form data-transport-day="${text(day)}" data-discovery="${discoveryMode}">
      <label>Mode de déplacement<select name="mode">${Object.entries(travelModes).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
      <div class="transport-fuel" hidden>
        <label>Consommation (L/100 km)<input name="consumption" type="number" min=".1" max="100" step=".1"></label>
        <label>Prix du carburant (€/L)<input name="price" type="number" min=".01" max="100" step=".01"></label>
      </div>
      <p>Le calcul envoie les coordonnées des étapes à <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">FOSSGIS</a>. Distance et durée estimées, hors trafic en direct.</p>
      <button class="btn secondary" type="submit">Calculer le trajet</button>
      <p role="status" class="transport-result"></p>
      <p class="transport-attribution">Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributeurs OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Corriger la carte</a></p>
    </form>
  </details>`;
}

main.addEventListener('change', event=>{
  if(event.target.name==='mode' && event.target.form?.dataset.transportDay) {
    event.target.form.querySelector('.transport-fuel').hidden=event.target.value!=='car';
    event.target.form.querySelector('.transport-result').textContent='';
  }
});

main.addEventListener('submit', async event=>{
  const form=event.target;
  if(!form.dataset.transportDay) return;
  event.preventDefault();
  const {transportDay,discovery}=form.dataset;
  const stops=discovery==='true' ? scheduleActivities(suggestion.matches,dayAssignments,suggestion.duration)[Number(transportDay)-1] :
    ordered(activeTrip()?.stops || []).filter(stop=>stop.date===transportDay);
  const values=new FormData(form), mode=values.get('mode');
  const output=form.querySelector('.transport-result'), button=form.querySelector('[type="submit"]');
  button.disabled=true;
  const select=form.elements.mode;
  select.disabled=true;
  output.textContent='Calcul en cours…';
  try {
    const {meters,seconds}=await fetchTransport(stops,mode);
    const minutes=Math.round(seconds/60);
    const time=minutes>=60 ? Math.floor(minutes/60)+' h '+String(minutes%60).padStart(2,'0') : minutes+' min';
    const fuel=mode==='car' ? fuelCost(meters,Number(values.get('consumption')),Number(values.get('price'))) : null;
    output.textContent=(meters/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})+' km · '+time+
      (fuel===null ? '' : ' · carburant estimé à '+fuel.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})+' (hors péages et stationnement)');
  } catch(error) { output.textContent=error.message; }
  finally { button.disabled=false; select.disabled=false; }
});

function daily(trip,day,stops) {
  const number=dayDistance(trip.startDate,day)+1;
  return `<section class="daily"><div class="day-heading"><h3>${capitalize(fmt(day,{weekday:'long',day:'numeric',month:'long'}))}</h3><span>Jour ${number}</span></div>
  ${stops.length ? `<ol class="timeline">${stops.map(stopRow).join('')}</ol>` : `<div class="day-empty">${icon('route',24)}<p>Aucune étape prévue pour cette journée.</p>${button('add-stop','Ajouter une étape','plus')}</div>`}${transportForm(stops,day)}</section>`;
}
function refreshSearch(trip) {
  const matches = findStops(trip.stops, editor.querySelector('#stop-query').value, editor.querySelector('#stop-category').value);
  const count = matches.length;
  editor.querySelector('#search-count').textContent = count ? plural(count,'étape') : 'Aucune étape trouvée.';
  const list = editor.querySelector('#search-results');
  const markup = matches.map(stop => `<li><button type="button" data-action="search-result" data-id="${text(stop.id)}">
    <strong>${text(stop.title)}</strong><span>${text(fmt(stop.date,{weekday:'short',day:'numeric',month:'short'}))}${stop.time?' · '+text(stop.time):''}${stop.place?' · '+text(stop.place):''}</span>
    </button></li>`).join('');
  if (modalState.markup !== markup) {
    const focused = list.contains(document.activeElement) && document.activeElement.dataset.id;
    modalState.markup = markup;
    list.innerHTML = markup;
    if (focused) (Array.from(list.querySelectorAll('button')).find(item => item.dataset.id === focused) || editor.querySelector('#stop-query')).focus();
  }
}

function openStopSearch(trip) {
  const options = Object.entries(categories).map(([key,label]) => `<option value="${key}">${label}</option>`).join('');
  showDialog('Rechercher une étape', `<div class="search-fields">
    <label>Dans tout le voyage<input id="stop-query" type="search" autocomplete="off" placeholder="Nom, lieu ou note"></label>
    <label>Catégorie<select id="stop-category"><option value="">Toutes les catégories</option>${options}</select></label></div>
    <p role="status" id="search-count"></p><ul id="search-results"></ul>`, {type:'search',trip});
  refreshSearch(trip);
}

function itinerary(trip) {
  const sorted=ordered(trip.stops);
  let days='';
  if(allDays && sorted.length) {
    const groups=new Map();
    for(const stop of sorted){if(!groups.has(stop.date))groups.set(stop.date,[]);groups.get(stop.date).push(stop);}
    days=[...groups].map(([day,stops])=>daily(trip,day,stops)).join('');
  } else {
    days=daily(trip,date,sorted.filter(s=>s.date===date));
  }
  return `<div class="page-heading"><h1>Mon itinéraire</h1>${button('add-stop','Ajouter une étape','plus','primary')}</div>
    ${hero(trip)}<div class="body-grid"><section class="program" aria-label="Programme">
    <div class="section-heading"><h2>Au programme</h2><div class="program-actions"><button class="view-mode" type="button" data-action="find-stop" aria-label="Rechercher une étape" title="Rechercher une étape"><svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><span>Rechercher</span></button><button type="button" class="view-mode" data-action="toggle-days" aria-pressed="${allDays}">${icon(allDays?'calendar':'list',16)}${allDays?'Par journée':'Tout voir'}</button></div></div>
    ${allDays?'':dayTabs(trip)}${days}</section>${summary(trip)}</div>`;
}
function travelCards(trips) {
  return trips.map(trip => `<button type="button" data-action="select-trip" data-id="${text(trip.id)}" class="trip-card">
    <span class="trip-cover ${isJapan(trip)?'japan':'generic'}">${icon('bag',24)}</span><span class="trip-info">
    <strong>${text(trip.title)}</strong><span>${icon('pin',15)}${text(trip.destination)}</span><span>${icon('calendar',15)}${text(dateRange(trip))}</span></span>
    <span class="trip-bottom">${plural(trip.stops.length,'étape')}<span>Ouvrir ${icon('right',14)}</span></span></button>`).join('');
}
function empty() {
  return `<div class="empty-state">${icon('bag',42)}<h2>Votre prochain voyage commence ici</h2><p>Choisissez une destination et des dates pour ouvrir votre carnet.</p>${button('new-trip','Créer un voyage','plus','primary')}</div>`;
}
function notesPage(trip) {
  const withNotes=ordered(trip.stops).filter(s=>s.notes);
  return `<div class="page-heading"><h1>Notes de voyage</h1>${button('edit-notes','Modifier la note','edit','primary')}</div>
    ${hero(trip)}<div class="notes-layout"><section class="note-sheet"><div class="side-title">${smallTitle('book','Mon carnet')}</div><p class="long-note">${text(trip.notes || 'Aucune note pour ce voyage.')}</p></section>
    <section class="stop-notes"><h2>Notes des étapes</h2>${withNotes.length?withNotes.map(stop=>`<button type="button" data-action="stop-detail" data-id="${text(stop.id)}"><strong>${text(stop.title)}</strong><span>${text(fmt(stop.date,{day:'numeric',month:'long'}))}</span><p>${text(stop.notes)}</p></button>`).join(''):'<p>Les notes ajoutées aux étapes apparaîtront ici.</p>'}</section></div>`;
}
function discoveryPlan(idea) {
  const days = scheduleActivities(idea.matches,dayAssignments,idea.duration);
  return `<ol class="discovery-days">${days.map((activities,index)=>`<li><strong>Jour ${index+1}</strong>
    ${activities.length ? `<ul>${activities.map(activity=>`<li>${text(activity.title)}</li>`).join('')}</ul>` : '<p>Libre</p>'}${transportForm(activities,index+1,true)}</li>`).join('')}</ol>`;
}

function discoveryLodging() {
  if (!preferences.start || !preferences.end) return '';
  let dates;
  try { dates=stayDates(preferences.start,preferences.end); } catch { return ''; }
  const country = countries.find(([code])=>code===preferences.country)?.[1];
  const selected = destinationKey(preferences) === citiesFor ? suggestion : null;
  const target = [selected?.city || preferences.destination,selected?.country || country].filter(Boolean).join(', ');
  const comparison = lodgingComparison(target,dates,preferences.adults,preferences.budget);
  if (!comparison || preferences.start < localToday()) return '';
  const nightly = comparison.nightly === null ? '' : ` · plafond moyen de ${comparison.nightly.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})} par nuit`;
  return `<section class="discovery-card discovery-lodging"><h2>Budget hébergement</h2>
    <p>${text(target)} · ${plural(comparison.nights,'nuit')} · ${plural(preferences.adults,'adulte')}${nightly}</p>
    <p>Le plafond est calculé à partir de ton budget. Consulte les prix disponibles pour ces dates chez le comparateur.</p>
    <a class="btn secondary" href="${text(comparison.url)}" target="_blank" rel="noopener noreferrer">Comparer les hébergements sur Booking.com</a></section>`;
}

let flightPreferences = {departure:'',arrival:'',flexible:0};
let flightResults = [];
let flightError = '';

function flightComparisons() {
  return `<p role="status">${text(flightError || (flightResults.length ? plural(flightResults.length,'aller-retour à comparer','allers-retours à comparer') : ''))}</p>
    ${flightResults.length ? `<ul class="flight-options">${flightResults.map(option=>`<li>
      <strong>${text(dateRange({startDate:option.outbound,endDate:option.inbound}))}</strong>
      <span>${option.delta===0?'Dates choisies':plural(Math.abs(option.delta),'jour')+(option.delta<0?' plus tôt':' plus tard')}</span>
      <div><a class="btn secondary" href="${text(option.kayak)}" target="_blank" rel="noopener noreferrer">Voir les prix sur KAYAK</a>
      <a class="btn secondary" href="${text(option.skyscanner)}" target="_blank" rel="noopener noreferrer">Voir les prix sur Skyscanner</a></div>
    </li>`).join('')}</ul>` : ''}`;
}

function discoveryFlights() {
  return `<section class="discovery-card discovery-lodging" aria-labelledby="flight-title">
    <h2 id="flight-title">Comparer les vols</h2>
    <p>Les dates de départ et de retour et le nombre d’adultes viennent des champs ci-dessus. Les comparateurs affichent les tarifs par compagnie et par date.</p>
    <form id="flight-form" class="discovery-filters">
      <div class="search-fields discovery-trip-fields">
      <label>Aéroport de départ (code IATA)<input name="departure" type="text" pattern="[A-Za-z]{3}" maxlength="3" required placeholder="CDG" value="${text(flightPreferences.departure)}"></label>
      <label>Aéroport d’arrivée (code IATA)<input name="arrival" type="text" pattern="[A-Za-z]{3}" maxlength="3" required placeholder="LIS" value="${text(flightPreferences.arrival)}"></label>
      <label>Dates flexibles<select name="flexible">${[[0,'Dates exactes'],[1,'Un jour avant et après'],[3,'Trois jours avant et après']].map(([value,label])=>`<option value="${value}" ${flightPreferences.flexible===value?'selected':''}>${label}</option>`).join('')}</select></label></div>
      <button type="submit" class="btn primary">Préparer la comparaison</button>
    </form>
    <div id="flight-results">${flightComparisons()}</div>
  </section>`;
}

main.addEventListener('input', event=>{
  if(event.target.form?.id!=='flight-form') return;
  const fields = new FormData(event.target.form);
  flightPreferences = {departure:fields.get('departure'),arrival:fields.get('arrival'),flexible:Number(fields.get('flexible'))};
  flightResults = [];
  flightError = '';
  main.querySelector('#flight-results').innerHTML = flightComparisons();
});
main.addEventListener('submit', event=>{
  if(event.target.id!=='flight-form') return;
  event.preventDefault();
  const dates = discoveryChoices(main.querySelector('#discover-form'));
  const fields = new FormData(event.target);
  flightPreferences = {departure:fields.get('departure'),arrival:fields.get('arrival'),flexible:Number(fields.get('flexible'))};
  flightResults = [];
  flightError = '';
  try { flightResults = flightSearch({...dates,...flightPreferences},localToday()); }
  catch(error) { flightError=error.message; }
  main.querySelector('#flight-results').innerHTML = flightComparisons();
});

function discovery(trip, signedIn) {
  const {destination, country, start, end, adults, budget, themes, days, radius} = preferences;
  const showAdd = signedIn && trip;
  const idea = suggestion;
  const results = idea?.matches.length ? `<article class="discovery-card">
    <p class="discovery-country">${text(idea.country)} · ${plural(idea.duration,'jour')}${idea.dates ? ' · '+text(dateRange({startDate:idea.dates.start,endDate:idea.dates.end})) : ''}</p><h2>${text(idea.city)}</h2>
    ${idea.via ? `<p>Suggestions repérées dans ${text(idea.via)}.</p>` : ''}
    <section class="discovery-preview"><h3>Mon programme</h3><p>Choisis le jour de chaque activité dans les résultats.</p>
    <div id="discovery-days" aria-live="polite">${discoveryPlan(idea)}</div>
    <button type="button" class="btn primary" data-action="suggest-trip">Préparer ce séjour</button></section>
    <h3>${plural(idea.matches.length,'activité trouvée','activités trouvées')}</h3>
    <ul class="discovery-activities">${idea.matches.map(activity=>`<li><div>
      <a href="${text(activity.source)}" target="_blank" rel="noopener noreferrer"><strong>${text(activity.title)}</strong></a>
      <small>${interests[activity.theme]}${Number.isFinite(activity.distance)?' · '+activity.distance.toLocaleString('fr-FR',{maximumFractionDigits:1})+' km du centre à vol d’oiseau':''}</small>
      ${activity.map?`<a class="discovery-map" href="${text(activity.map)}" target="_blank" rel="noopener noreferrer">Voir sur la carte</a>`:''}
      </div><div class="discovery-place-actions"><select data-plan-day="${text(activity.id)}" aria-label="Jour pour ${text(activity.title)}">
        <option value="0">Hors programme</option>${Array.from({length:idea.duration},(_,i)=>`<option value="${i+1}" ${dayAssignments.get(activity.id)===i+1?'selected':''}>Jour ${i+1}</option>`).join('')}
      </select>${showAdd?`<button type="button" class="btn secondary" data-action="suggest-stop" data-id="${text(activity.id)}" aria-label="Ajouter ${text(activity.title)} au voyage en cours">Ajouter</button>`:''}</div></li>`).join('')}</ul>
    </article>` : '';
  return `<div class="page-heading"><h1>Découvrir</h1></div>
    <form id="discover-form" class="discovery-filters">
      <div class="search-fields discovery-trip-fields">
      <label>Pays<select name="country"><option value="">Tous les pays</option>${countries.map(([code,label])=>`<option value="${code}" ${code===country?'selected':''}>${text(label)}</option>`).join('')}</select></label>
      <label>Ville<input name="destination" type="search" maxlength="100" autocomplete="off" placeholder="Facultatif si un pays est choisi" value="${text(destination)}"></label>
      <label>Départ<input type="date" name="start" value="${text(start)}"></label>
      <label>Retour<input type="date" name="end" value="${text(end)}"></label>
      <label>Durée sans dates<select name="days">${durations.map(day=>`<option value="${day}" ${day===days?'selected':''}>${plural(day,'jour')}</option>`).join('')}</select></label>
      <label>Rayon autour de la ville<select name="radius">${radii.map(value=>`<option value="${value}" ${value===radius?'selected':''}>${value} km</option>`).join('')}</select></label>
      <label>Adultes<input type="number" name="adults" min="1" max="16" required value="${adults}"></label>
      <label>Budget total hébergement (€)<input type="number" name="budget" min="0" max="100000" step=".01" value="${budget || ''}" placeholder="Facultatif"></label>
      </div><p>Avec un pays seul, la capitale sert de point de départ. Les dates déterminent la durée du séjour.</p>
      <fieldset><legend>Vos envies</legend><div class="discovery-themes">${Object.entries(interests).map(([key,label])=>`<label><input type="checkbox" name="theme" value="${key}" ${themes.includes(key)?'checked':''}>${label}</label>`).join('')}</div></fieldset>
      <button type="submit" class="btn primary">Chercher la destination</button>
    </form>
    ${cities.length ? `<form id="discover-city" class="discovery-filters discovery-results"><label>Ville trouvée<select name="city">${cities.map(city=>`<option value="${text(city.id)}" ${city.id===idea?.id?'selected':''}>${text([...new Set([city.city,city.region,city.country].filter(Boolean))].join(', '))}</option>`).join('')}</select></label>
    <button type="submit" class="btn primary">Rechercher des activités</button></form>` : ''}
    <div id="lodging-results">${discoveryLodging()}</div>
    ${discoveryFlights()}
    <section class="discovery-results" aria-label="Suggestions">
      <p id="discovery-status" role="status" tabindex="-1">${discoveryRequest?'Recherche en ligne…':text(discoveryError || (idea && !idea.matches.length ? 'Aucun lieu trouvé pour ces envies. Essayez d’autres catégories.' : ''))}</p>
      ${results && showAdd?`<p>Tu peux ajouter les activités à « ${text(trip.title)} ».</p>`:''}
      ${results ? `<div class="discovery-grid">${results}</div>` : ''}
      <p>Villes par <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noopener noreferrer">Open-Meteo</a> et <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>. Lieux © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributeurs OpenStreetMap</a>.</p>
    </section>`;
}

function discoveryChoices(form) {
  const values = new FormData(form);
  return {destination:values.get('destination').trim(), country:values.get('country'), start:values.get('start'), end:values.get('end'),
    adults:Number(values.get('adults')), budget:Number(values.get('budget')), themes:values.getAll('theme'),
    days:Number(values.get('days')), radius:Number(values.get('radius'))};
}
main.addEventListener('change', event => {
  if (event.target.form?.id === 'discover-form') {
    preferences = discoveryChoices(event.target.form);
    main.querySelector('#lodging-results').innerHTML = discoveryLodging();
    if(['start','end','adults'].includes(event.target.name)) {
      flightResults = []; flightError = '';
      main.querySelector('#flight-results').innerHTML = flightComparisons();
    }
  }
  if (!suggestion || !event.target.dataset.planDay) return;
  dayAssignments.set(event.target.dataset.planDay,Number(event.target.value));
  main.querySelector('#discovery-days').innerHTML = discoveryPlan(suggestion);
});
main.addEventListener('input', event => {
  if (event.target.name === 'destination' && event.target.form?.id === 'discover-form') {
    preferences = {...preferences, destination:event.target.value};
  }
});
main.addEventListener('submit', async event => {
  if (!['discover-form','discover-city'].includes(event.target.id)) return;
  event.preventDefault();
  const values = discoveryChoices(main.querySelector('#discover-form'));
  const findCity = event.target.id === 'discover-form';
  const city = findCity ? null : cities.find(item=>item.id===new FormData(event.target).get('city'));
  if (!findCity && !city) return;
  let dates;
  try {
    if (values.destination && values.destination.length < 2) throw new Error('Indiquez au moins deux caractères pour la ville.');
    if (!values.destination && !values.country) throw new Error('Choisissez un pays ou saisissez une ville.');
    dates = stayDates(values.start,values.end);
    if (dates) values.days = dates.days;
    if (!findCity && destinationKey(values)!==citiesFor) throw new Error('La destination a changé. Relancez sa recherche.');
  } catch (error) {
    discoveryError = error.message;
    render();
    return;
  }
  discoveryRequest?.abort();
  const request = new AbortController();
  discoveryRequest = request;
  preferences = values;
  discoveryError = '';
  suggestion = null;
  dayAssignments.clear();
  if(findCity) cities = [];
  render();
  try {
    if(findCity) {
      const found = values.destination ? await findCities(values.destination,request.signal,values.country) :
        await findCountryCities(values.country,request.signal);
      if (discoveryRequest !== request) return;
      cities = found;
      citiesFor = destinationKey(values);
      if (!cities.length) discoveryError = 'Aucune ville trouvée. Essayez de saisir le nom d’une ville.';
    } else {
      const result = await fetchSuggestion(city, values, request.signal);
      if (discoveryRequest === request) {
        suggestion = {...result,dates};
        result.plan.forEach((activity,index)=>dayAssignments.set(activity.id,index+1));
      }
    }
  } catch(error) {
    if(discoveryRequest === request) discoveryError = error.name === 'TimeoutError' || error instanceof TypeError ?
      'La recherche ne répond pas. Vérifiez la connexion et réessayez.' : error.message;
  } finally {
    if(discoveryRequest === request) {
      discoveryRequest = null;
      render();
      if(page()==='decouvrir') main.querySelector(cities.length && findCity ? '#discover-city select' : suggestion?.matches.length ? '[data-action="suggest-trip"]' : '#discovery-status')?.focus();
    }
  }
});

function render() {
  const trips=getTrips(), trip=activeTrip(trips), view=page();
  const info=syncInfo();
  if(editor.open && (!info.online || info.state==='error' || info.state==='reauth' || modalState?.owner !== (info.user?.id ?? null))) {
    editor.close();
    editor.replaceChildren(); modalState=null;
  }
  if (editor.open && modalState?.type === 'search') {
    const current = trips.find(item => item.id === modalState.trip.id);
    if (current) { modalState.trip = current; refreshSearch(current); }
    else editor.close();
  }
  const connectionText=!info.online?'Hors connexion':info.state==='syncing'?'Synchronisation…':info.state==='error'?'Synchronisation interrompue':info.state==='reauth'?'Session expirée':info.user && info.lastSync?'À jour':'Synchronisation';
  document.querySelector('#connection').innerHTML=icon('cloud',17)+'<span>'+connectionText+'</span>';
  if(trip && (dateTrip!==trip.id || !date || date<trip.startDate || date>trip.endDate)) {
    date=trip.startDate;dateTrip=trip.id;allDays=false;
  }
  document.title=pages[view]+' · Carnet d’étapes';
  document.querySelector('#navigation').innerHTML=Object.entries(pages).map(([key,label])=>`<a href="#${key}" ${key===view?'aria-current="page"':''}>${icon({voyages:'bag',itineraire:'route',notes:'book',decouvrir:'compass'}[key],20)}<span>${label}</span></a>`).join('');
  document.querySelector('#crumb').innerHTML=`${icon('compass',17)}<span>Mon espace</span>${icon('right',13)}<strong>${pages[view]}</strong>`;
  if(!info.online || info.state==='reauth' || info.state==='error') {
    main.innerHTML='<section class="empty-state"><h1>Carnet indisponible</h1><p>Vérifiez votre connexion pour accéder aux voyages.</p>'+button('account','Ouvrir mon compte','person')+'</section>';
    return;
  }
  if(view==='decouvrir') { main.innerHTML=discovery(trip, Boolean(info.user)); return; }
  if(view==='voyages') main.innerHTML=`<div class="page-heading"><h1>Mes voyages</h1>${trips.length?button('new-trip','Nouveau voyage','plus','primary'):''}</div>${trips.length?`<div class="trip-grid">${travelCards(trips)}</div>`:empty()}`;
  else if(!trip) main.innerHTML=`<div class="page-heading"><h1>${view==='itineraire'?'Mon itinéraire':pages[view]}</h1></div>${empty()}`;
  else main.innerHTML=view==='notes'?notesPage(trip):itinerary(trip);
  if(!info.user) {
    main.querySelectorAll('[data-action="new-trip"], [data-action="edit-notes"], [data-action="add-stop"]').forEach(control=>{
      control.dataset.action='account'; control.textContent='Se connecter';
    });
    main.querySelector('.hero-label')?.replaceChildren('Voyage de démonstration');
    main.querySelector('[data-action="trip-menu"]')?.remove();
  }
}
function showDialog(title,body,state) {
  modalState={...state,owner:syncInfo().user?.id ?? null};
  editor.setAttribute('aria-labelledby','editor-title');
  editor.innerHTML=`<div class="modal-heading"><h2 id="editor-title">${text(title)}</h2>${iconButton('close','Fermer','x')}</div>${body}<p role="alert" class="form-error" hidden></p>`;
  if(!editor.open) editor.showModal();
  const first=editor.querySelector('input,textarea,select,[data-initial-focus]');
  if(first) first.focus();
}
const field=(label,name,type,value,attrs='')=>`<label>${label}<input name="${name}" type="${type}" value="${text(value)}" ${attrs}></label>`;
const area=(label,name,value)=>`<label>${label}<textarea name="${name}" rows="4" maxlength="4000">${text(value)}</textarea></label>`;
const actions=(submit='Enregistrer')=>`<footer class="form-actions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn primary">${submit}</button></footer>`;
function tripForm(trip, idea) {
  const today=localToday();
  showDialog(trip?'Modifier le voyage':'Nouveau voyage',`<form id="trip-form">
  ${field('Nom du voyage','title','text',trip?.title || (idea ? 'Séjour à '+idea.city : ''), 'required maxlength="120" placeholder="Ex. Un été en Italie"')}
  ${field('Destination','destination','text',trip?.destination || (idea ? idea.city+', '+idea.country : ''), 'required maxlength="160" placeholder="Ville, région ou pays"')}
  <div class="form-pair">${field('Départ','startDate','date',trip?.startDate||idea?.dates?.start||today,'required')}${field('Retour','endDate','date',trip?.endDate||idea?.dates?.end||(idea ? shiftDay(today,idea.duration-1) : today),'required')}</div>
  ${area('Note de voyage','notes',trip?.notes || '')}${actions(trip?'Enregistrer':'Créer le voyage')}</form>`,{type:'trip',trip,idea});
}
function stopForm(trip,stop,preset) {
  const catOptions=Object.entries(categories).map(([v,label])=>`<option value="${v}" ${(stop?.category||preset?.category||'visite')===v?'selected':''}>${label}</option>`).join('');
  showDialog(stop?'Modifier l’étape':'Ajouter une étape',`<form id="stop-form">
    ${field('Nom de l’étape','title','text',stop?.title||preset?.title||'', 'required maxlength="120" placeholder="Ex. Visite du temple"')}
    ${field('Lieu ou adresse','place','text',stop?.place||preset?.place||'', 'maxlength="200" placeholder="Ex. Asakusa, Tokyo"')}
    <div class="form-pair">${field('Date','date','date',stop?.date||date,`required min="${text(trip.startDate)}" max="${text(trip.endDate)}"`)}${field('Heure (facultatif)','time','time',stop?.time||'')}</div>
    <label>Catégorie<select name="category">${catOptions}</select></label>${area('Notes','notes',stop?.notes || '')}${actions(stop?'Enregistrer':'Ajouter l’étape')}</form>`,{type:'stop',trip,stop,preset});
}
function stopDetail(trip,stop) {
  const cat=Object.hasOwn(categories,stop.category)?stop.category:'autre';
  const mapUrl = stopMapLink(stop);
  const leg = nextLeg(ordered(trip.stops), stop);
  const nextStep = leg ? `<section class="detail-note" aria-label="Prochaine étape">
    <h3>Prochaine étape</h3><p>${leg.next.time ? text(leg.next.time)+' · ' : ''}${text(leg.next.title)}</p>
    ${leg.url ? `<a href="${text(leg.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le trajet dans Google Maps</a>` : `<p>${text(leg.hint)}</p>`}
  </section>` : '';
  showDialog(stop.title,`<div class="stop-detail"><span class="category ${cat}">${icon(cat,15)} ${categories[cat]}</span>
    <p>${icon('calendar',18)}${text(fmt(stop.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</p>
    ${stop.time?`<p>${icon('clock',18)}${text(stop.time)}</p>`:''}
    ${mapUrl?`<p>${icon('pin',18)}${text(stop.place)} <a href="${text(mapUrl)}" target="_blank" rel="noopener noreferrer">Voir sur Google Maps</a></p>`:''}
    ${stop.notes?`<div class="detail-note">${text(stop.notes)}</div>`:''}
    ${nextStep}</div><footer class="form-actions">${syncInfo().user ? button('remove-stop','Supprimer','trash','danger-text')+button('edit-stop','Modifier','edit','primary') : button('close','Fermer','close')}</footer>`,{type:'detail',trip,stop});
}
function tripMenu(trip) {
  showDialog(trip.title,`<div class="menu-options">${button('edit-trip','Modifier le voyage','edit')}${button('switch-trip','Mes voyages','bag')}${button('remove-trip','Supprimer le voyage','trash','danger-text')}</div>`,{type:'options',trip});
}
function confirmRemoval(trip,stop) {
  showDialog(stop?'Supprimer cette étape ?':'Supprimer ce voyage ?',`<p class="confirmation">« ${text(stop?.title || trip.title)} » ${stop?'sera supprimée de votre itinéraire.':'et toutes ses étapes seront supprimés.'}</p><form>${actions('Supprimer')}</form>`,{type:stop?'remove-stop':'remove-trip',trip,stop});
}
function notesForm(trip) {
  showDialog('Modifier la note du voyage',`<form>${area('Note de voyage','notes',trip.notes)}${actions()}</form>`,{type:'notes',trip});
}
function errorMessage(error) {
  const p=editor.querySelector('.form-error');
  const message=error.message || 'La modification n’a pas pu être enregistrée.';
  if(editor.open && p){p.textContent=message; p.hidden=false;} else toast(message);
}
editor.addEventListener('submit', async event=>{
  event.preventDefault();
  const form=event.target;
  if(!form.reportValidity()) return;
  const submit=form.querySelector('[type="submit"]');
  if(submit.disabled) return;
  const data=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,String(v).trim()]));
  const {type,trip,stop,idea,preset}=modalState;
  submit.disabled=true;
  try {
    let result;
    if(type==='trip') {
      if(!data.title || !data.destination) throw Error('Indiquez un nom et une destination.');
      if(data.startDate > data.endDate) throw Error('Le retour doit avoir lieu à partir du jour de départ.');
      if(trip?.stops.some(s=>s.date<data.startDate || s.date>data.endDate)) throw Error('Des étapes se trouvent hors de ces dates. Déplacez-les avant de raccourcir le voyage.');
      if(idea && dayDistance(data.startDate,data.endDate)+1 < idea.duration) throw Error('Prévoyez '+plural(idea.duration,'jour')+' pour ce programme.');
      const planned=idea?.schedule.flatMap((activities,index)=>activities.map(activity=>({
        id:crypto.randomUUID(), title:activity.title, place:activity.place, category:activity.category,
        date:shiftDay(data.startDate,index), time:'', notes:'',
        ...(validPoint(activity.coordinates)?{coordinates:activity.coordinates}:{})
      })));
      const updated={...trip,...data,id:trip?.id || crypto.randomUUID(),stops:trip?.stops || planned || []};
      remember(await saveTrip(updated,trip));
      openPage('itineraire');
      result=trip?'Voyage modifié.':'Voyage créé.';
    } else if(type==='stop') {
      if(!data.title) throw Error('Indiquez le nom de l’étape.');
      const updated={...stop,...data,id:stop?.id || crypto.randomUUID()};
      if(preset && data.place===preset.place && validPoint(preset.coordinates)) updated.coordinates=preset.coordinates;
      if(stop && stop.place!==data.place) delete updated.coordinates;
      const stops=stop?trip.stops.map(s=>s.id===stop.id?updated:s):[...trip.stops,updated];
      remember(await saveTrip({...trip,stops},trip));
      dateTrip=selectedId;
      date=updated.date;
      if(page()==='decouvrir') openPage('itineraire');
      result=stop?'Étape modifiée.':'Étape ajoutée.';
    } else if(type==='notes') {
      remember(await saveTrip({...trip,notes:data.notes},trip));result='Note enregistrée.';
    } else if(type==='remove-stop') {
      remember(await saveTrip({...trip,stops:trip.stops.filter(s=>s.id!==stop.id)},trip));result='Étape supprimée.';
    } else if(type==='remove-trip') {
      await deleteTrip(trip.id,trip);openPage('voyages');result='Voyage supprimé.';
    }
    editor.close();
    render();
    main.focus({preventScroll:true});
    toast(result);
  } catch(error) { errorMessage(error); }
  finally { submit.disabled=false; }
});
editor.addEventListener('input', event=>{
  if (modalState?.type==='search') { refreshSearch(modalState.trip); return; }
  const form=event.target.form;
  if(form?.id==='trip-form' && event.target.name==='startDate') {
    const end=form.elements.endDate;
    if(modalState?.idea && event.target.value) end.value=shiftDay(event.target.value,modalState.idea.duration-1);
    else if(!end.value || end.value<event.target.value) end.value=event.target.value;
  }
});
editor.addEventListener('click',event=>{
  if(event.target===editor) {
    const r=editor.getBoundingClientRect();
    if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) editor.close();
  }
});
document.addEventListener('click',event=>{
  const control=event.target.closest('[data-action]');
  if(!control)return;
  const act=control.dataset.action;
  const dialogTrip=editor.open?modalState?.trip:null;
  const trip=dialogTrip || activeTrip();
  switch(act) {
    case 'account': document.dispatchEvent(new Event('escale-account'));return;
    case 'suggest-trip': {
      if (!syncInfo().user) { document.dispatchEvent(new Event('escale-account')); return; }
      const idea=suggestion;
      if (idea) tripForm(null,{...idea,schedule:scheduleActivities(idea.matches,dayAssignments,idea.duration)});
      return;
    }
    case 'suggest-stop': {
      const idea=suggestion;
      const activity=idea?.matches.find(item=>item.id===control.dataset.id);
      if (trip && activity && syncInfo().user) stopForm(trip,null,activity);
      return;
    }
    case 'new-trip': tripForm(null);return;
    case 'close': editor.close();return;
    case 'select-trip': remember(control.dataset.id);openPage('itineraire');break;
    case 'trip-menu': tripMenu(trip);return;
    case 'switch-trip': editor.close();openPage('voyages');return;
    case 'view-notes': openPage('notes');return;
    case 'edit-notes': notesForm(trip);return;
    case 'edit-trip': tripForm(trip);return;
    case 'remove-trip': confirmRemoval(trip);return;
    case 'day': date=control.dataset.date;break;
    case 'prev-week': date=shiftDay(trip.startDate,Math.max(0,(Math.floor(dayDistance(trip.startDate,date)/7)-1)*7));break;
    case 'next-week': date=shiftDay(trip.startDate,Math.min(duration(trip)-1,(Math.floor(dayDistance(trip.startDate,date)/7)+1)*7));break;
    case 'toggle-days': allDays=!allDays;break;
    case 'add-stop': stopForm(trip);return;
    case 'find-stop': openStopSearch(trip);return;
    case 'search-result': {
      const stop=trip.stops.find(item=>item.id===control.dataset.id);
      if(stop) { date=stop.date; allDays=false; render(); stopDetail(trip,stop); editor.querySelector('[data-action="close"]').focus(); }
      return;
    }
    case 'stop-detail': {const copy=trip;const stop=copy.stops.find(s=>s.id===control.dataset.id);if(stop)stopDetail(copy,stop);return;}
    case 'edit-stop': stopForm(trip,modalState.stop);return;
    case 'remove-stop': confirmRemoval(trip,modalState.stop);return;
    default: return;
  }
  render();
  if(act==='day' || act==='prev-week' || act==='next-week') document.querySelector('.day-tab.active')?.focus({preventScroll:true});
  if(act==='toggle-days') document.querySelector('[data-action="toggle-days"]')?.focus({preventScroll:true});
});
editor.addEventListener('close',()=>{ if(!editor.open){editor.replaceChildren();modalState=null;} });
window.addEventListener('offline',render);
window.addEventListener('hashchange',()=>{render();main.focus({preventScroll:true});window.scrollTo(0,0);});
document.querySelector('#brand-mark').innerHTML=logo;
document.querySelector('#account-icon').innerHTML=icon('person',18);
subscribe(render);
render();
