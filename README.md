# Lisanga

Application de suivi de tontine, **installable comme une vraie application (PWA)**. Les membres du groupe voient les mêmes données **en direct**, partagées par un serveur Supabase.

## Fonctionnalités

- **Comptes** (e-mail + mot de passe). Celui qui crée la tontine en est l'organisateur.
- **Réglages du groupe** : nom, cotisation, monnaie, **un tour tous les N jours**, date du premier tour, pénalité de retard, rappel (jours avant la date), indicatif pays pour WhatsApp, ouverture des inscriptions.
- **Membres et ordre de passage** : ajout à la main, montée/descente, retrait ; les membres déjà servis sont verrouillés.
- **Inscription avec validation** : lien ou code d'invitation (onglet Organisateur) ; la personne crée son compte, demande à rejoindre, l'organisateur accepte (le membre est ajouté en fin d'ordre) ou refuse. Le téléphone n'est lisible que par l'organisateur.
- **Cotisations par versements partiels**, annulation du dernier versement, **pénalités de retard** (à marquer réglées).
- **Rappels** : bandeau pour le membre, texte de rappel au groupe et relance individuelle par **lien WhatsApp**.
- **Calendrier des tours**, **tableau d'évolution en direct** (✓, pourcentages, ✗) et fil des dernières nouvelles.
- **Remise de la cagnotte** calculée automatiquement (somme encaissée), annulable.
- **Export PDF** (cagnotte, calendrier, cotisations du tour, paiements par tour).
- **Discussion par sujets** avec photos (réduites avant envoi), vocaux (enregistrés dans l'appli) et PDF.

## Lancer

```
npm start        # http://localhost:8080 (le service worker exige http(s), pas file://)
npm test         # test de bout en bout Playwright/Chromium, en mode démo
npm run test:sql # règles d'accès (RLS) sur un PostgreSQL local
```

Sans configuration, l'appli tourne en **mode démo** : les données restent dans le navigateur (partagées entre onglets). Pratique pour essayer, mais ce n'est pas un vrai partage entre téléphones.

## Mettre en place le serveur (Supabase)

1. Créez un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** : collez `supabase/schema.sql` en entier et lancez-le (tables, règles RLS, temps réel, stockage des fichiers). Il peut être relancé sans danger.
3. **Authentication → Providers → Email** : laissez l'e-mail activé. Pour que les membres entrent sans attendre un message, désactivez « Confirm email » (sinon ils devront d'abord cliquer le lien reçu).
4. Copiez l'URL du projet et la clé **anon public** (Settings → API) dans `config.js`. Ces deux valeurs sont publiques par conception ; la sécurité vient des règles RLS.
5. Publiez le dossier sur un hébergement statique en https (GitHub Pages, Netlify, Cloudflare Pages…). Sur téléphone : menu du navigateur → « Ajouter à l'écran d'accueil ».

Après toute modification d'un fichier de l'appli, incrémentez `VERSION` dans `sw.js` pour que les téléphones prennent la nouvelle version.

## Droits

| | Organisateur | Membre actif | Demandeur |
|---|---|---|---|
| Voir cotisations, calendrier, direct | oui | oui | non |
| Réglages, membres, versements, remises | oui | non | non |
| Voir les téléphones | oui | non | non |
| Écrire dans la discussion | oui | oui | non |
| Supprimer un message / clore un sujet | tous | les siens | non |

## Ce qui est vérifié, et ce qui ne l'est pas

Le test e2e passe sur le mode démo (même code d'écran que la production). `tests/rls.sh` vérifie `schema.sql` sur PostgreSQL 16 avec des stubs de Supabase. **L'adaptateur Supabase de `backend.js` (connexion, Realtime, Storage) n'a pas pu être testé contre un vrai projet** depuis ce dépôt : faites un premier essai à deux téléphones après la mise en place.
