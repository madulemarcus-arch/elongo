# Elongo

Application de suivi de tontine, **installable comme une vraie application (PWA)**. Les membres du groupe voient les mêmes données **en direct**, partagées par un serveur Supabase.

## Fonctionnalités

- **Comptes** (e-mail + mot de passe). Celui qui crée la tontine en est l'organisateur.
- **Réglages du groupe** : nom, cotisation, monnaie, **durée d'un tour en jours** et début du premier tour (la date de fin de chaque tour est calculée et affichée tout de suite : « Tour 1 : du 2 oct. au 8 oct. »), pénalité de retard, rappel (jours avant la fin du tour), indicatif pays pour WhatsApp, ouverture des inscriptions.
- **Membres et ordre de passage** : ajout à la main, montée/descente, retrait ; les membres déjà servis sont verrouillés.
- **Inscription avec validation** : lien ou code d'invitation (onglet Organisateur) ; la personne crée son compte, demande à rejoindre, l'organisateur accepte (le membre est ajouté en fin d'ordre) ou refuse. Le téléphone n'est lisible que par l'organisateur.
- **Cotisations par versements partiels**, annulation du dernier versement, **pénalités de retard** (à marquer réglées).
- **Moyen de paiement** obligatoire à chaque versement (M-Pesa, Orange Money, Airtel Money, Illico Cash, cash à l'organisateur ou au caissier).
- **Exports** : PDF (cagnotte, calendrier, cotisations du tour, récapitulatif par membre, historique des versements, tableau des paiements) et fichier Excel (CSV) de tous les versements avec date, tour et moyen de paiement.
- **Co-organisateurs** : le créateur de la tontine peut nommer organisateur un membre qui a un compte (bouton dans l'espace organisateur). Il peut alors tout faire sauf nommer ou retirer des organisateurs et supprimer la tontine.
- **Code de déverrouillage** facultatif, défini par chaque membre dans « Mon compte » (4 à 6 chiffres, sur son appareil) : demandé à l'ouverture et après une minute d'absence.
- **Fiche d'un membre** : un clic sur son nom affiche le nombre de versements, le total versé, le total par moyen de paiement et le détail.
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

## Notifications push (versements, messages, rappels)

Les membres reçoivent une alerte sur leur téléphone, appli fermée, comme avec WhatsApp :
- **versement** enregistré par l'organisateur (« Alice a versé 4 000 FC sur 10 000 FC »), et **cagnotte remise** ;
- **nouveau message** dans la discussion ;
- **rappel de cotisation** chaque matin (à 08:00) pour ceux qui n'ont pas fini de payer, à partir du nombre de jours réglé dans « Rappel » (et tant que c'est en retard).

Les relances individuelles des retardataires restent des liens WhatsApp (bouton « Relancer sur WhatsApp »).

**Côté membre :** un bandeau « Activer les notifications » apparaît dans l'onglet Tour (et dans le menu du compte). Sur Android, Chrome suffit ; sur iPhone, l'appli doit d'abord être ajoutée à l'écran d'accueil (iOS 16.4 ou plus). Se déconnecter retire l'appareil des alertes de ce compte.

**Mise en place sur Supabase (une seule fois) :**
1. **SQL Editor** : relancez `supabase/schema.sql` en entier (il crée la table `push_subscriptions`).
2. **Clés VAPID** : `npx web-push generate-vapid-keys`. Mettez la clé *publique* dans `vapidPublicKey` de `config.js`.
3. **Edge Functions → Deploy a new function → Via Editor** : nom **`push`** (si l'éditeur vous impose un autre nom, notez-le : il se met dans `pushFunction` de `config.js` et dans l'adresse de `push-cron.sql`), collez tout `supabase/functions/push/index.ts`, laissez « Verify JWT » activé, puis Deploy.
4. **Edge Functions → Secrets** : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (la clé privée n'est jamais mise dans le dépôt), `VAPID_SUBJECT` (`mailto:votre@adresse`) et `CRON_SECRET` (un long texte au hasard).
5. **Database → Extensions** : activez `pg_cron` et `pg_net`, puis exécutez `supabase/push-cron.sql` après avoir remplacé les trois valeurs entre `< >`.
6. Republiez le site (incrémenter `VERSION` dans `sw.js` si un fichier de l'appli a changé).

`npm run test:push` teste la logique de la fonction (droits, textes, rappels, nettoyage des appareils périmés) et un vrai envoi chiffré avec la bibliothèque web-push. Ce test n'exécute pas la fonction sur Supabase : l'envoi réel se vérifie avec deux téléphones.

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
