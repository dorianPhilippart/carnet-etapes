# Carnet d’étapes

*Ton voyage, jour par jour.*

[Ouvrir Carnet d’étapes](https://dorianphilippart.github.io/carnet-etapes/)

Carnet d’étapes est un carnet de voyage en français pour préparer un séjour sur ordinateur et consulter chaque journée sur téléphone. Un itinéraire de démonstration de sept jours entre Tokyo, Hakone et Kyoto permet de découvrir l’application.

## Utiliser le carnet

- Créez un voyage avec une destination et des dates. Ajoutez les visites, repas, transports et hébergements avec leur heure, leur lieu et vos notes. Les heures correspondent à l’heure locale de la destination.
- Sélectionnez une journée pour consulter ses étapes. Une connexion Internet est nécessaire.
- Connectez-vous sur chaque appareil avec la même adresse e-mail pour modifier vos voyages. La session et les informations chargées sont gardées en mémoire pendant l’utilisation. Une actualisation ou la fermeture de la page demande une nouvelle connexion.
- Après la mise à jour, ouvrez le carnet en ligne sur chaque appareil et sur chaque adresse où vous l’aviez utilisé. Les anciens voyages invités et les modifications non envoyées peuvent être récupérés depuis le panneau du compte. Fermez les onglets de l’ancienne version.
- Sur téléphone, vous pouvez ajouter l’application à l’écran d’accueil pour y accéder rapidement.


Dans **Au programme**, recherchez une étape dans tout le voyage. Depuis sa fiche, ouvrez le trajet vers la prochaine étape de la journée si les deux lieux sont renseignés. Google Maps reçoit les lieux lorsque vous ouvrez le lien.

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

La table stocke une ligne par voyage et par propriétaire, avec un identifiant de révision pour détecter les modifications concurrentes. Les écritures sont confirmées par Supabase. L’application ne crée pas de copie persistante des nouveaux voyages ou des jetons de session dans le navigateur.


## Héberger

Publiez le contenu de `dist/` sur un hébergeur statique HTTPS, à la racine ou dans un sous-répertoire. Le manifeste et le service worker utilisent des chemins relatifs. Ce dépôt publie la racine de la branche `gh-pages`. À chaque mise à jour de `main`, le workflow **Publier sur GitHub Pages** teste l’application, compile `dist/`, actualise `gh-pages` et demande la publication. Il peut aussi être lancé depuis l’onglet Actions. Les URL Supabase de redirection doivent correspondre à l’adresse de cet hébergement.

## Organisation du code

- `ui.js`, `styles.css` et `icons.js` — écrans, navigation et formulaires.
- `store.js`, `cloud.js` et `account.js` — accès au carnet en ligne, authentification et synchronisation.
- `supabase/` — schéma SQL, politiques d’accès et tests.
- `build.mjs`, `sw.js` et `manifest.webmanifest` — compilation, retrait des anciens caches et installation.

Le fonctionnement mobile et la synchronisation par e-mail s’inspirent de [Kanji Sprint](https://github.com/dorianPhilippart/japanese-review-app).
