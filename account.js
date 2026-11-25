import { authenticate } from './cloud.js';
import { syncInfo, synchronize, signOut, guestTrips, importGuest } from './store.js';

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
let confirmLogout = false;
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
  return syncInfo().user ? 'Mon compte' : 'Compte local';
}

function updateLabel() {
  for (const label of document.querySelectorAll('[data-account-label]')) label.textContent = getAccountLabel();
}

function statusText(info) {
  if (!info.online) return 'Hors connexion. Vos changements seront envoyés au retour du réseau.';
  if (info.state === 'syncing') return 'Synchronisation en cours…';
  if (info.state === 'reauth') return 'Votre session a expiré. Reconnectez-vous pour reprendre la synchronisation.';
  if (info.state === 'error') return 'Synchronisation interrompue. Vos changements restent sur cet appareil.';
  if (info.pending) return 'Des changements attendent d’être envoyés.';
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
      dialog.querySelector('.acct-message').textContent = message;
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
  if (!info.configured) {
    body.append(el('h3', 'Carnet sur cet appareil'),
      el('p', 'Vos voyages sont enregistrés dans ce navigateur et restent disponibles hors connexion.'),
      el('p', 'La synchronisation entre appareils sera disponible dès qu’un projet Supabase sera relié à cette installation.'));
  } else if (info.user && mode !== 'reauth') {
    body.append(el('p', info.user.email, 'acct-email'));
    const status = el('p', statusText(info), 'acct-status');
    status.setAttribute('role', 'status');
    body.append(status);
    if (info.conflict) body.append(el('p', 'Un voyage avait aussi changé sur un autre appareil. Sa version distante a été conservée. Toute modification locale concurrente se trouve dans un voyage portant la mention « copie locale ».'));
    if (info.state === 'reauth') {
      body.append(button('Me reconnecter', () => { mode = 'reauth'; render(); }, true));
    } else {
      const sync = button('Synchroniser maintenant', () => { void synchronize(); }, true);
      sync.disabled = busy || !info.online || info.state === 'syncing';
      body.append(sync);
    }
    if (guestTrips().length) {
      const group = el('div', '', 'acct-group');
      group.append(el('h3', 'Carnet local'), el('p', 'Vous pouvez copier les voyages du mode local dans ce compte.'),
        button('Copier mes voyages locaux', async () => {
          try { await importGuest(); message = 'Les voyages locaux ont été copiés dans votre compte.'; }
          catch (error) { message = error.message; }
          render();
        }));
      body.append(group);
    }
    if (confirmLogout) {
      body.append(el('p', 'Des changements attendent la synchronisation. En vous déconnectant, vous effacerez ces changements de cet appareil.'),
        button('Rester connecté', () => { confirmLogout = false; render(); }, true),
        button('Effacer et me déconnecter', logout));
    } else body.append(button('Me déconnecter', () => {
      if (syncInfo().pending) { confirmLogout = true; render(); }
      else void logout();
    }));
  } else {
    const register = mode === 'signup';
    body.append(el('p', register
      ? 'Créez un compte pour retrouver vos itinéraires sur ordinateur et téléphone.'
      : 'Connectez-vous pour retrouver vos itinéraires sur tous vos appareils.'));
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
  try { await signOut(); mode = 'signin'; confirmLogout = false; message = ''; }
  finally { busy = false; render(); }
}

function openAccount(initialMessage = '') {
  if (dialog.open) return;
  opener = document.activeElement;
  mode = 'signin'; message = initialMessage; confirmLogout = false;
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
