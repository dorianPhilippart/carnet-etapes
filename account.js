import { authenticate } from './cloud.js';
import { syncInfo, synchronize, signOut, saveTrip } from './store.js';
import {pruneSynced, legacyGroups, recoverGroup, discardGroup} from './legacy.js';

pruneSynced();

// Confirmation links may carry an implicit grant. The user signs in explicitly
// with a password; remove callback credentials from browser history immediately.
function consumeConfirmation() {
  const callback = new URLSearchParams(location.hash.slice(1));
  if (!['access_token', 'refresh_token', 'error_description'].some(key => callback.has(key))) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return callback.has('error') || callback.has('error_description') ? 'failed' : 'confirmed';
}
const confirmation = consumeConfirmation();

const dialog = document.createElement('dialog');
dialog.className = 'account-dialog';
dialog.setAttribute('aria-labelledby', 'escale-account-title');
document.body.append(dialog);
let mode = 'signin';
let busy = false;
let opener;

let message = '';

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, handler, primary = false) {
  const btn = el('button', text, primary ? 'acct-primary' : 'acct-secondary');
  btn.type = 'button';
  btn.disabled = busy;
  btn.addEventListener('click', handler);
  return btn;
}

export function getAccountLabel() {
  return syncInfo().user ? 'Mon compte' : 'Se connecter';
}

function updateLabel() {
  for (const label of document.querySelectorAll('[data-account-label]')) label.textContent = getAccountLabel();
}

function statusText(info) {
  if (!info.online) return 'Connexion Internet nécessaire pour accéder au carnet.';
  if (info.state === 'syncing') return 'Synchronisation en cours…';
  if (info.state === 'reauth') return 'Votre session a expiré. Reconnectez-vous pour reprendre la synchronisation.';
  if (info.state === 'error') return 'Connexion au carnet interrompue. Réessayez en ligne.';
  if (info.lastSync) return 'À jour à ' + info.lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.';
  return 'Connexion au carnet en ligne…';
}

function accountFields(form, registration, email) {
  const username = el('input');
  username.type = 'email';
  username.name = 'email';
  username.required = true;
  username.autocomplete = 'username';
  username.value = email || '';
  username.readOnly = Boolean(email);
  username.maxLength = 254;
  const password = el('input');
  password.type = 'password';
  password.name = 'password';
  password.required = true;
  password.autocomplete = registration ? 'new-password' : 'current-password';
  password.minLength = registration ? 8 : 1;
  password.maxLength = 256;
  const emailLabel = el('label', 'Adresse e-mail');
  emailLabel.append(username);
  const passwordLabel = el('label', registration ? 'Mot de passe (8 caractères minimum)' : 'Mot de passe');
  passwordLabel.append(password);
  const submit = el('button', registration ? 'Créer mon compte' : 'Me connecter', 'acct-primary');
  submit.type = 'submit';
  form.append(emailLabel, passwordLabel, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Connexion…';
    try {
      const accepted = await authenticate(username.value.trim(), password.value, registration);
      password.value = '';
      message = accepted ? '' : 'Consultez votre messagerie pour confirmer votre adresse, puis connectez-vous.';
      mode = 'signin';
      if (accepted) void synchronize();
      busy = false;
      render();
    } catch (error) {
      const errors = {
        invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
        email_not_confirmed: 'Confirmez d’abord votre adresse depuis le lien reçu par e-mail.',
        weak_password: 'Choisissez un mot de passe plus robuste.',
        signup_disabled: 'La création de comptes est désactivée sur ce projet.',
        email_address_invalid: 'Vérifiez le format de votre adresse e-mail.'
      };
      message = errors[error.code] || (error.status === 429
        ? 'Trop de tentatives. Réessayez dans quelques minutes.'
        : 'Connexion impossible. Vérifiez votre accès au réseau et réessayez.');
      busy = false;
      submit.disabled = false;
      submit.textContent = registration ? 'Créer mon compte' : 'Me connecter';
      const feedback = dialog.querySelector('.acct-message');
      if (feedback) feedback.textContent = message;
    }
  });
}

function render() {
  const info = syncInfo();
  const title = el('h2', info.user ? 'Mon compte' : 'Synchronisation');
  title.id = 'escale-account-title';
  const close = button('×', () => dialog.close());
  close.className = 'acct-close';
  close.setAttribute('aria-label', 'Fermer');
  const header = el('header');
  header.append(title, close);
  const body = el('div', '', 'acct-body');
  if (!info.online) {
    body.append(el('p','Reconnectez cet appareil à Internet pour accéder à votre carnet.'));
  } else if (!info.configured) {
    body.append(el('p','Le service de comptes est indisponible.'));
  } else if (info.user && mode !== 'reauth') {
    body.append(el('p', info.user.email, 'acct-email'));
    const status = el('p', statusText(info), 'acct-status');
    status.setAttribute('role', 'status');
    body.append(status);
    if (info.state === 'reauth') {
      body.append(button('Me reconnecter', () => { mode = 'reauth'; render(); }, true));
    } else {
      const sync = button('Synchroniser maintenant', () => { void synchronize(); }, true);
      sync.disabled = busy || !info.online || info.state === 'syncing';
      body.append(sync);
    }
    for (const group of legacyGroups(info.user.id)) {
      const section = el('section', '', 'acct-group');
      const owner = info.user.id;
      const currentUser = () => syncInfo().user?.id;
      section.append(el('h3', group.guest ? 'Ancien carnet invité' : 'Anciennes modifications sur cet appareil'));
      if (group.trips) {
        section.append(el('p', 'Récupérez les voyages sous forme de copies dans le compte '+info.user.email+'. Chaque copie locale est effacée après confirmation de son enregistrement en ligne.'));
        section.append(button('Récupérer dans ce compte', async () => {
          busy = true; render();
          try {
            await recoverGroup(group.key, owner, currentUser, saveTrip);
            message = 'Récupération terminée.';
          } catch { message = 'Récupération interrompue. Les éléments en attente sont conservés pour un nouvel essai.'; }
          finally { busy = false; render(); }
        }));
      }
      if (group.total > group.trips) section.append(el('p', 'Des entrées anciennes ne peuvent pas être importées. Les suppressions en attente ne sont pas appliquées au compte en ligne.'));
      section.append(button('Effacer ces anciennes données', () => {
        if (!window.confirm('Effacer définitivement ces anciennes données de cet appareil ? Les modifications non récupérées seront perdues.')) return;
        discardGroup(group.key, owner, currentUser); render();
      }));
      body.append(section);
    }
    body.append(button('Me déconnecter', logout));
  } else {
    const register = mode === 'signup';
    body.append(el('p', register
      ? 'Créez un compte pour retrouver vos itinéraires sur ordinateur et téléphone.'
      : 'Connectez-vous pour retrouver vos itinéraires sur tous vos appareils.'));
    if (legacyGroups(null).length) body.append(el('p','Un ancien carnet invité est présent sur cet appareil. Connectez-vous pour le récupérer ou l’effacer.'));
    const form = el('form');
    accountFields(form, register, mode === 'reauth' ? info.user?.email : '');
    body.append(form);
    if (mode !== 'reauth') body.append(button(register ? 'J’ai déjà un compte' : 'Créer un compte', () => {
      mode = register ? 'signin' : 'signup';
      message = '';
      render();
    }));
  }
  const feedback = el('p', message, 'acct-message');
  feedback.setAttribute('role', 'status');
  body.append(feedback);
  dialog.replaceChildren(header, body);
}

async function logout() {
  busy = true;
  try { await signOut(); mode = 'signin'; message = ''; }
  finally { busy = false; render(); }
}

function openAccount(initialMessage = '') {
  if (dialog.open) return;
  opener = document.activeElement;
  mode = 'signin'; message = initialMessage;
  render();
  dialog.showModal();
}
document.addEventListener('escale-account', () => openAccount());
dialog.addEventListener('close', () => { opener?.focus(); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
let previousUser = syncInfo().user?.id;
document.addEventListener('escale-sync', () => {
  const user = syncInfo().user?.id;
  updateLabel();
  if (dialog.open && !busy && ((user && mode !== 'reauth') || previousUser !== user)) render();
  previousUser = user;
});
updateLabel();
if (confirmation && syncInfo().configured && !syncInfo().user) {
  openAccount(confirmation === 'failed'
    ? 'Le lien de confirmation a expiré ou ne peut plus être utilisé.'
    : 'Le lien de confirmation a été ouvert. Connectez-vous avec votre adresse et votre mot de passe.');
}

window.addEventListener('offline', () => { if(dialog.open){dialog.close(); dialog.replaceChildren();} });
