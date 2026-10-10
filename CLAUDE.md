# CLAUDE.md

Guide pour Claude Code dans ce dépôt.

## Projet

Lisanga : PWA de suivi de tontine, données partagées en direct via Supabase. JavaScript vanilla, sans build : `index.html`, `styles.css`, `config.js`, `backend.js`, `app.js`, `sw.js`, `manifest.webmanifest`, `vendor/` (supabase-js, jsPDF, autotable copiés localement pour fonctionner hors ligne), `supabase/schema.sql`.

## Commandes

- `npm start` : sert le dossier sur http://localhost:8080.
- `npm test` : `tests/e2e.mjs`, scénario séquentiel à deux onglets (organisateur + membre) en mode démo. En cas d'échec il affiche l'état de chaque onglet. Playwright doit être résolvable (`npm i`).
- `npm run test:sql` : applique `schema.sql` deux fois sur un PostgreSQL local jetable et exécute `tests/rls-check.sql` (droits de chaque rôle).
- `npm run icons` : régénère `icons/*.png` depuis le SVG de `tests/icons.mjs`.

## Architecture

- `backend.js` expose `window.Backend` avec la même API pour deux implémentations : **Supabase** (si `config.js` est rempli) et **démo** (localStorage + BroadcastChannel, session par onglet dans sessionStorage). Les lignes gardent les noms de colonnes snake_case de `schema.sql`. La démo recopie les règles de lecture et d'écriture de `schema.sql` : toute règle modifiée dans le SQL doit l'être aussi dans `demoBackend`.
- `app.js` (IIFE, sections `// ---------- X ----------`) : état `S` (données) et `ui` (interface). `loadTable(nom)` recharge une table ; `subscribe` du backend appelle `queue(table)` qui recharge puis `route(true)`. Écrire = appel backend, puis `loadTable` de la table touchée. Les vues sont des fonctions `viewX()` qui renvoient du HTML ; la discussion garde son squelette et ne met à jour que ses parties (`renderChatParts`). Les champs `data-d="clé"` conservent leur brouillon dans `ui.draft` et le champ actif garde texte et curseur lors d'un rendu.
- Modèle : `payments` = un cumul par (tour, membre) avec `log` des versements ; `payouts` = remise d'un tour ; le tour courant est le premier sans remise. Les tours sont datés `start_date + tour × interval_days`. Sujet « Général » = `topic_id` nul.
- Pièces jointes : bucket privé `lisanga`, chemin `<tontine>/<user>/<fichier>`, message → `att {path,name,type,size,kind}`.

## Points d'attention

- Toute donnée saisie injectée dans le HTML passe par `esc()`.
- Après modification d'un fichier listé dans `ASSETS` de `sw.js`, incrémenter `VERSION`.
- Changer le schéma : modifier `schema.sql` (rejouable), `demoBackend`, et ajouter un cas dans `tests/rls-check.sql`.
- L'adaptateur Supabase n'a jamais tourné contre un vrai projet depuis ce dépôt.

## Conventions

Interface, README et messages de commit en français ; commentaires du code en anglais.
