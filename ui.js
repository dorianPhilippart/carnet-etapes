import {getTrips, saveTrip, deleteTrip, subscribe, syncInfo} from './store.js';
import {icon, logo} from './icons.js';

const categories = {visite:'Visite', repas:'Repas', transport:'Transport', hebergement:'Hébergement', autre:'Autre'};
const pages = {voyages:'Mes voyages', itineraire:'Itinéraire', notes:'Notes de voyage'};
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
function daily(trip,day,stops) {
  const number=dayDistance(trip.startDate,day)+1;
  return `<section class="daily"><div class="day-heading"><h3>${capitalize(fmt(day,{weekday:'long',day:'numeric',month:'long'}))}</h3><span>Jour ${number}</span></div>
  ${stops.length ? `<ol class="timeline">${stops.map(stopRow).join('')}</ol>` : `<div class="day-empty">${icon('route',24)}<p>Aucune étape prévue pour cette journée.</p>${button('add-stop','Ajouter une étape','plus')}</div>`}</section>`;
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
    <div class="section-heading"><h2>Au programme</h2><button type="button" class="view-mode" data-action="toggle-days" aria-pressed="${allDays}">${icon(allDays?'calendar':'list',16)}${allDays?'Par journée':'Tout voir'}</button></div>
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
function render() {
  const trips=getTrips(), trip=activeTrip(trips), view=page();
  const info=syncInfo();
  if(editor.open && (!info.online || info.state==='error' || info.state==='reauth' || modalState?.owner !== (info.user?.id ?? null))) {
    editor.close();
    editor.replaceChildren(); modalState=null;
  }
  const connectionText=!info.online?'Hors connexion':info.state==='syncing'?'Synchronisation…':info.state==='error'?'Synchronisation interrompue':info.state==='reauth'?'Session expirée':info.user && info.lastSync?'À jour':'Synchronisation';
  document.querySelector('#connection').innerHTML=icon('cloud',17)+'<span>'+connectionText+'</span>';
  if(trip && (dateTrip!==trip.id || !date || date<trip.startDate || date>trip.endDate)) {
    date=trip.startDate;dateTrip=trip.id;allDays=false;
  }
  document.title=pages[view]+' · Carnet d’étapes';
  document.querySelector('#navigation').innerHTML=Object.entries(pages).map(([key,label])=>`<a href="#${key}" ${key===view?'aria-current="page"':''}>${icon({voyages:'bag',itineraire:'route',notes:'book'}[key],20)}<span>${label}</span></a>`).join('');
  document.querySelector('#crumb').innerHTML=`${icon('compass',17)}<span>Mon espace</span>${icon('right',13)}<strong>${pages[view]}</strong>`;
  if(!info.online || info.state==='reauth' || info.state==='error') {
    main.innerHTML='<section class="empty-state"><h1>Carnet indisponible</h1><p>Vérifiez votre connexion pour accéder aux voyages.</p>'+button('account','Ouvrir mon compte','person')+'</section>';
    return;
  }
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
function tripForm(trip) {
  const today=localToday();
  showDialog(trip?'Modifier le voyage':'Nouveau voyage',`<form id="trip-form">
  ${field('Nom du voyage','title','text',trip?.title || '', 'required maxlength="120" placeholder="Ex. Un été en Italie"')}
  ${field('Destination','destination','text',trip?.destination || '', 'required maxlength="160" placeholder="Ville, région ou pays"')}
  <div class="form-pair">${field('Départ','startDate','date',trip?.startDate||today,'required')}${field('Retour','endDate','date',trip?.endDate||today,'required')}</div>
  ${area('Note de voyage','notes',trip?.notes || '')}${actions(trip?'Enregistrer':'Créer le voyage')}</form>`,{type:'trip',trip});
}
function stopForm(trip,stop) {
  const catOptions=Object.entries(categories).map(([v,label])=>`<option value="${v}" ${(stop?.category||'visite')===v?'selected':''}>${label}</option>`).join('');
  showDialog(stop?'Modifier l’étape':'Ajouter une étape',`<form id="stop-form">
    ${field('Nom de l’étape','title','text',stop?.title||'', 'required maxlength="120" placeholder="Ex. Visite du temple"')}
    ${field('Lieu ou adresse','place','text',stop?.place||'', 'maxlength="200" placeholder="Ex. Asakusa, Tokyo"')}
    <div class="form-pair">${field('Date','date','date',stop?.date||date,`required min="${text(trip.startDate)}" max="${text(trip.endDate)}"`)}${field('Heure (facultatif)','time','time',stop?.time||'')}</div>
    <label>Catégorie<select name="category">${catOptions}</select></label>${area('Notes','notes',stop?.notes || '')}${actions(stop?'Enregistrer':'Ajouter l’étape')}</form>`,{type:'stop',trip,stop});
}
function stopDetail(trip,stop) {
  const cat=Object.hasOwn(categories,stop.category)?stop.category:'autre';
  showDialog(stop.title,`<div class="stop-detail"><span class="category ${cat}">${icon(cat,15)} ${categories[cat]}</span>
    <p>${icon('calendar',18)}${text(fmt(stop.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</p>
    ${stop.time?`<p>${icon('clock',18)}${text(stop.time)}</p>`:''}
    ${stop.place?`<p>${icon('pin',18)}${text(stop.place)} <a href="https://www.google.com/maps/search/?api=1&amp;query=${text(encodeURIComponent(stop.place))}" target="_blank" rel="noopener noreferrer">Carte</a></p>`:''}
    ${stop.notes?`<div class="detail-note">${text(stop.notes)}</div>`:''}
    </div><footer class="form-actions">${syncInfo().user ? button('remove-stop','Supprimer','trash','danger-text')+button('edit-stop','Modifier','edit','primary') : button('close','Fermer','close')}</footer>`,{type:'detail',trip,stop});
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
  const {type,trip,stop}=modalState;
  submit.disabled=true;
  try {
    let result;
    if(type==='trip') {
      if(!data.title || !data.destination) throw Error('Indiquez un nom et une destination.');
      if(data.startDate > data.endDate) throw Error('Le retour doit avoir lieu à partir du jour de départ.');
      if(trip?.stops.some(s=>s.date<data.startDate || s.date>data.endDate)) throw Error('Des étapes se trouvent hors de ces dates. Déplacez-les avant de raccourcir le voyage.');
      const updated={...trip,...data,id:trip?.id || crypto.randomUUID(),stops:trip?.stops || []};
      remember(await saveTrip(updated,trip));
      openPage('itineraire');
      result=trip?'Voyage modifié.':'Voyage créé.';
    } else if(type==='stop') {
      if(!data.title) throw Error('Indiquez le nom de l’étape.');
      const updated={...stop,...data,id:stop?.id || crypto.randomUUID()};
      const stops=stop?trip.stops.map(s=>s.id===stop.id?updated:s):[...trip.stops,updated];
      remember(await saveTrip({...trip,stops},trip));
      dateTrip=selectedId;
      date=updated.date;
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
  const form=event.target.form;
  if(form?.id==='trip-form' && event.target.name==='startDate') {
    const end=form.elements.endDate;
    if(!end.value || end.value<event.target.value) end.value=event.target.value;
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
