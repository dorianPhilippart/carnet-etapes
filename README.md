# Carnet d’étapes

*Ton voyage, jour par jour.*

[Ouvrir Carnet d’étapes](https://dorianphilippart.github.io/carnet-etapes/)

Carnet d’étapes est un carnet de voyage en français pour préparer un séjour sur ordinateur et consulter chaque journée sur téléphone. Un itinéraire modifiable de sept jours entre Tokyo, Hakone et Kyoto permet de découvrir l’application.

## Utiliser le carnet

- Créez un voyage avec une destination et des dates. Ajoutez les visites, repas, transports et hébergements avec leur heure, leur lieu et vos notes. Les heures correspondent à l’heure locale de la destination.
- Sélectionnez une journée pour retrouver ses étapes dans l’ordre. Le carnet invité est conservé dans le navigateur sur cet appareil.
- Pour synchroniser vos voyages, ouvrez le panneau **Synchronisation** et connectez les deux appareils avec la même adresse e-mail. Le bouton **Copier mes voyages locaux** ajoute le carnet invité à votre compte.
- Ouvrez le site une première fois en ligne et laissez-le charger avant de partir. Pour l’installer, utilisez la commande d’installation du navigateur, ou **Partager → Sur l’écran d’accueil** dans Safari sur iPhone. Le chargement hors ligne nécessite HTTPS ou localhost.

## Démarrer en local

Avec Node.js 22 ou plus récent et Python 3 pour le serveur d’exemple, depuis la racine du dépôt :

```sh
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

Ouvrez http://localhost:8000. Le projet utilise des modules JavaScript natifs et se construit sans téléchargement de dépendances. Relancez la compilation après une modification. Fermez les autres fenêtres du carnet pour activer une mise à jour du service worker.

## Connecter sa propre instance Supabase

1. Créez un projet Supabase, puis exécutez `supabase/schema.sql` depuis son éditeur SQL. Ce schéma crée la table `public.trips` et ses règles d’accès par propriétaire.
2. Activez le fournisseur **Email** dans Authentication. Renseignez l’URL HTTPS du site dans **URL Configuration** et ajoutez l’URL de l’application à la liste des redirections autorisées, chemin du dépôt inclus sur GitHub Pages.
   Pour envoyer les confirmations aux utilisateurs en dehors de votre équipe Supabase, configurez également un fournisseur SMTP dans Authentication.
3. Dans `config.js`, renseignez `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` avec l’URL du projet et sa clé *publishable*. Conservez les clés secrètes, `service_role`, mots de passe et jetons d’administration en dehors du dépôt et du navigateur.
4. Reconstruisez et déployez `dist/`. Dans un projet de test, `supabase/tests/access.sql` vérifie les droits du rôle anonyme et l’isolation entre comptes dans une transaction annulée à la fin.

La table stocke une ligne par voyage et par propriétaire, avec un identifiant de révision pour détecter les modifications concurrentes. Les appels d’authentification et de synchronisation sont exclus du cache du service worker. Le navigateur conserve une copie des voyages sur l’appareil pour la consultation hors ligne. Effacer les données du site supprime le carnet invité et les modifications locales en attente.

## Héberger

Publiez le contenu de `dist/` sur un hébergeur statique HTTPS, à la racine ou dans un sous-répertoire. Le manifeste et le service worker utilisent des chemins relatifs. Ce dépôt publie la racine de la branche `gh-pages`. À chaque mise à jour de `main`, le workflow **Publier sur GitHub Pages** teste l’application, compile `dist/`, actualise `gh-pages` et demande la publication. Il peut aussi être lancé depuis l’onglet Actions. Les URL Supabase de redirection doivent correspondre à l’adresse de cet hébergement.

## Organisation du code

- `ui.js`, `styles.css` et `icons.js` — écrans, navigation et formulaires.
- `store.js`, `cloud.js` et `account.js` — carnet local, authentification et synchronisation.
- `supabase/` — schéma SQL, politiques d’accès et tests.
- `build.mjs`, `sw.js` et `manifest.webmanifest` — compilation, cache hors ligne et installation.

Le fonctionnement mobile, la consultation hors ligne et la synchronisation par e-mail s’inspirent de [Kanji Sprint](https://github.com/dorianPhilippart/japanese-review-app).
