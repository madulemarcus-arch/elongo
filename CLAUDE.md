# CLAUDE.md

Guide pour Claude Code dans ce dépôt.

## Projet

Elongo : PWA de suivi de tontine, données partagées en direct via Supabase. JavaScript vanilla, sans build : `index.html`, `styles.css`, `config.js`, `backend.js`, `app.js`, `sw.js`, `manifest.webmanifest`, `vendor/` (supabase-js, jsPDF, autotable copiés localement pour fonctionner hors ligne), `supabase/schema.sql`.

## Commandes

- `npm start` : sert le dossier sur http://localhost:8080.
- `npm test` : `tests/e2e.mjs`, scénario séquentiel à deux onglets (organisateur + membre) en mode démo (le serveur de test renvoie une `config.js` vide, quel que soit son contenu). En cas d'échec il affiche l'état de chaque onglet. Playwright doit être résolvable (`npm i`).
- `npm run test:sql` : applique `schema.sql` deux fois sur un PostgreSQL local jetable et exécute `tests/rls-check.sql` (droits de chaque rôle).
- `npm run test:push` : `tests/push.mjs`, teste la logique de la fonction push (`supabase/functions/push/index.ts`) avec une base factice, et un vrai envoi web-push déchiffré comme le ferait un navigateur. Nécessite Node 22.18 ou plus (lecture du TypeScript).
- `npm run icons` : régénère `icons/*.png` depuis le SVG de `tests/icons.mjs`.

## Architecture

- `backend.js` expose `window.Backend` avec la même API pour deux implémentations : **Supabase** (si `config.js` est rempli) et **démo** (localStorage + BroadcastChannel, session par onglet dans sessionStorage). Les lignes gardent les noms de colonnes snake_case de `schema.sql`. La démo recopie les règles de lecture et d'écriture de `schema.sql` : toute règle modifiée dans le SQL doit l'être aussi dans `demoBackend`.
- `app.js` (IIFE, sections `// ---------- X ----------`) : état `S` (données) et `ui` (interface). `loadTable(nom)` recharge une table ; `subscribe` du backend appelle `queue(table)` qui recharge puis `route(true)`. Écrire = appel backend, puis `loadTable` de la table touchée. Les vues sont des fonctions `viewX()` qui renvoient du HTML ; la discussion garde son squelette et ne met à jour que ses parties (`renderChatParts`). Les champs `data-d="clé"` conservent leur brouillon dans `ui.draft` et le champ actif garde texte et curseur lors d'un rendu.
- Modèle : `payments` = un cumul par (tour, membre) avec `log` des versements ; `payouts` = remise d'un tour ; le tour courant est le premier sans remise. Un tour dure `interval_days` jours : il va de `start_date + tour × interval_days` à cette date + `interval_days` (5 jours à partir du 10 : du 10 au 15), le tour suivant commençant le jour où celui-ci finit (`roundStart`/`roundEnd` dans `app.js`). La **fin du tour est l'échéance** : cotisations dues, pénalités de retard et rappels (appli et fonction push) se calculent à partir d'elle. Chaque entrée de `log` est `{a, at, m}` où `m` est le moyen de paiement (clés de `METHODS` dans `app.js` ; absent sur les anciens versements). Un clic sur un nom de membre (`data-act="member"`) ouvre `memberDialog` (nombre et total des versements, par moyen). Sujet « Général » = `topic_id` nul.
- Pièces jointes : bucket privé `lisanga` (nom technique gardé de l'ancien nom du projet : ne pas le renommer sans migrer le stockage), chemin `<tontine>/<user>/<fichier>`, message → `att {path,name,type,size,kind}`.

- **Notifications push** : l'appli (`enablePush`/`disablePush`) enregistre l'appareil dans `push_subscriptions` ; après un versement, une remise ou un message, `notify()` appelle la Edge Function `push` (`B.invoke`), qui recompose le texte depuis la base (le client n'envoie jamais de texte libre), vérifie les droits (organisateur pour versements et remises, auteur pour un message) et envoie avec web-push. Les rappels quotidiens viennent de pg_cron (`supabase/push-cron.sql`). `sw.js` affiche la notification (rien si l'appli est au premier plan) et ouvre le bon onglet au clic. Le texte des notifications est dans `index.ts` ; les clés VAPID privées ne vont jamais dans le dépôt.

## Points d'attention

- Toute donnée saisie injectée dans le HTML passe par `esc()`.
- Après modification d'un fichier listé dans `ASSETS` de `sw.js`, incrémenter `VERSION`.
- Changer le schéma : modifier `schema.sql` (rejouable), `demoBackend`, et ajouter un cas dans `tests/rls-check.sql`.
- L'adaptateur Supabase est vérifié en réel pour la connexion, l'inscription et la création de tontine ; le partage en direct, les fichiers et l'envoi des notifications push se vérifient avec deux téléphones (rien de tout cela ne peut tourner dans l'environnement de développement, sans accès réseau à Supabase).

## Conventions

Interface, README et messages de commit en français ; commentaires du code en anglais.
