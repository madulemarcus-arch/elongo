# Elongo

Application de suivi de tontine, **installable comme une vraie application (PWA)**. Les membres du groupe voient les mêmes données **en direct**, partagées par un serveur Supabase.

## Fonctionnalités

- **Mot de passe** de 4 caractères minimum (Supabase en demande 6 : l'appli complète automatiquement les mots de passe plus courts, sans rien changer pour l'utilisateur).
- **Comptes** (numéro de téléphone + mot de passe, sans adresse e-mail ; les comptes créés avec un e-mail avant restent utilisables en tapant cet e-mail). Celui qui crée la tontine en est l'organisateur.
- **Réglages du groupe** : nom, cotisation, monnaie, **durée d'un tour en jours** et début du premier tour (la date de fin de chaque tour est calculée et affichée tout de suite : « Tour 1 : du 2 oct. au 8 oct. »), pénalité de retard, rappel (jours avant la fin du tour), indicatif pays pour WhatsApp, ouverture des inscriptions.
- **Membres et ordre de passage** : ajout à la main, montée/descente, retrait ; les membres déjà servis sont verrouillés.
- **Inscription avec validation** : lien ou code d'invitation (onglet Organisateur) ; la personne crée son compte, demande à rejoindre, l'organisateur accepte (le membre est ajouté en fin d'ordre) ou refuse. Le téléphone n'est lisible que par l'organisateur.
- **Cotisations par versements partiels**, annulation du dernier versement, **pénalités de retard** (à marquer réglées).
- **Supprimer la tontine** : dans l'onglet Organisateur (tout en bas), pour tout organisateur. Il faut écrire le nom exact de la tontine ; membres, versements, calendrier, discussion et journal sont effacés pour tout le monde, sans retour possible. Pensez à exporter le PDF ou l'Excel avant.
- **Moyen de paiement** obligatoire à chaque versement (M-Pesa, Orange Money, Airtel Money, Illico Cash, cash à l'organisateur ou au caissier).
- **Calendrier visuel** : cartes « Prochains tours » (3 prochains bénéficiaires avec leurs dates), grille mensuelle (jours de chaque tour colorés, badge « T2 » le jour de la remise, aujourd'hui entouré, navigation de mois en mois) et liste de tous les tours.
- **Versement rapide et suppression** : le bouton « ➕ Enregistrer un versement » (haut de l'écran Tour) ouvre une fenêtre unique : choix du membre (avec ce qui lui reste à payer), montant reçu (pré-rempli), moyen de paiement. Un versement saisi par erreur se **supprime** (avec confirmation) depuis la fiche de versement du membre ou sa fiche détaillée, quel que soit le tour et même s'il n'est pas le dernier ; les totaux sont recalculés et la suppression est inscrite au journal (« saisi par erreur »).
- **Changer de bénéficiaire** : bouton « 🔀 Changer de bénéficiaire » sur l'écran Tour (et « 🔀 Changer » sur chaque tour à venir du calendrier). Deux possibilités : **échanger** deux tours entre membres pas encore servis, ou faire **passer son tour** à un membre (il passe en dernier, les autres avancent d'une place). Raison facultative, inscription au journal, et un message WhatsApp prêt pour prévenir le groupe. Les membres déjà servis ne peuvent pas être déplacés.
- **Mode hors connexion** : sans réseau, l'appli s'ouvre avec les dernières données reçues (bandeau « Hors connexion ») et l'organisateur peut enregistrer des versements. Ils sont gardés sur le téléphone (marqués « ⏳ en attente d'envoi », annulables), puis envoyés automatiquement au retour du réseau (ou avec « Envoyer maintenant »), sans écraser ce qu'un autre organisateur a saisi entre-temps ; le journal indique « saisi hors connexion ». Seuls les versements se font hors connexion : les autres actions demandent le réseau.
- **Rappel des retardataires** : un bouton « 🔔 Rappeler (N) » sur l'écran Tour (organisateurs, avec confirmation) envoie une notification à chaque membre qui n'a pas tout versé, avec le montant qui lui reste. Aucun nom n'est montré au groupe ; l'organisateur voit qui a été prévenu et qui doit être relancé par WhatsApp (sans compte ou sans notification). Un rappel toutes les 3 heures au plus ; l'envoi est inscrit au journal. **La fonction `push` doit être redéployée** (nouveau `kind: 'remind'`). Ne dépend plus de pg_cron.
- **Reçus et journal** : chaque versement garde qui l'a enregistré et quand ; un bouton « Reçu » (fiche de versement, fiche du membre) prépare un reçu à envoyer par WhatsApp. Le **journal des opérations** (onglet Direct) liste ce que font les organisateurs (versements, annulations, remises, pénalités, nominations) ; tous les membres le lisent, personne ne peut le modifier. **À faire une fois : relancer `supabase/schema.sql`** (nouvelle table `journal`).
- **Quatre apparences** (automatique, clair, sombre, noir) : bouton ☀️/🌙/⚫ dans la barre du haut (automatique → clair → sombre → noir) et choix « Apparence » dans « Mon compte ». « Automatique » suit le réglage du téléphone ; « Noir » est un sombre à fond noir pur, plus économe sur les écrans OLED ; le choix est gardé sur l'appareil.
- **Récompenses (positives seulement)** : un tour est « à temps » quand le membre l'a payé en entier avant sa date de fin. Badge ⭐ Ponctuel, 🔥 série de tours d'affilée, 🏆 Sans faute (au moins 3 tours, tous à temps). Visibles dans la fiche du membre, par une petite étoile dans la liste du tour et dans un mot d'encouragement sur l'écran Tour. Pas de classement ni de liste de retardataires ; un membre sans badge voit seulement comment en gagner un.
- **Habillage** : icônes de la barre du bas dessinées en traits (même épaisseur, couleur du thème), tableau en direct coloré (vert payé, orange partiel, rouge non payé, colonne du tour en cours cerclée d'or), nouvelles du groupe avec icône et date relative, écran de connexion avec le logo et un œil pour afficher le mot de passe.
- **Discussion façon messagerie** : bulles avec avatar coloré, messages groupés par auteur, séparateurs de jours (« Aujourd'hui », « Hier »), heure dans chaque bulle, zone d'écriture arrondie toujours visible en bas avec 📎 (photo, PDF), 🎤 (vocal) et ➤ (envoyer), et création d'un sujet derrière le bouton « + Sujet ».
- **Écran Tour allégé** : bandeau de notifications sur une ligne, une ligne compacte par membre (avatar, état, barre, pastille) et, pour l'organisateur, un bouton « Verser » qui ouvre la fiche du membre (versement avec moyen de paiement, historique du tour, pénalité, annulation du dernier versement, relance WhatsApp).
- **Une appli vivante** : les écrans glissent à l'ouverture, les boutons répondent au doigt, l'onglet actif rebondit, la barre de la cagnotte se remplit en douceur, vibration à chaque versement, pluie de confettis quand la cagnotte d'un tour est remise ou complète, et message de bienvenue « Bonjour … 👋 ». Tout est coupé si le téléphone demande de réduire les animations.
- **Rapport d'un jour** : un clic sur un jour du calendrier ouvre son rapport (versements du jour avec leur moyen, puis pour chaque tour concerné : qui a tout versé, qui a versé en partie, qui n'a rien versé, et si la remise a eu lieu). Un tour payé en entier par tous avant sa date de fin est coché sur tous ses jours restants, jusqu'à la date prévue.
- **Annuler une remise de cagnotte** (avec confirmation) : bouton « Annuler la remise de … » sur l'écran Tour pour la dernière remise, et « Annuler la remise » sur n'importe quelle ligne servie du calendrier ou de la liste des membres. Les versements sont conservés, le membre redevient « pas encore servi ».
- **Rapport de fin de tour (PDF)** : onglet Organisateur → Export → choisir un tour → « Rapport du tour (PDF) ». Une page : bénéficiaire, période, cagnotte et montant encaissé, cotisation de chaque membre (versé, reste, statut, date, moyen, pénalité), moyens de paiement du tour, ce qui reste à payer et espaces de signature de l'organisateur et du bénéficiaire.
- **Exports** : PDF (cagnotte, calendrier, cotisations du tour, récapitulatif par membre, historique des versements, tableau des paiements) et fichier Excel (CSV) de tous les versements avec date, tour et moyen de paiement.
- **Relier un compte à un membre ajouté à la main** : à l'acceptation d'une demande, l'organisateur choisit « C'est : <nom> » pour donner le compte à la ligne existante (ordre de passage et versements conservés, pas de doublon).
- **Organisateurs** : tout organisateur peut en nommer un autre parmi les membres qui ont un compte (bouton dans l'espace organisateur). **Tous les organisateurs ont les mêmes droits**, y compris retirer des organisateurs, supprimer la tontine et même **retirer l'organisateur principal** (celui qui a créé la tontine) : il prend alors sa place et l'ancien principal perd tout accès. Attention, c'est sans retour : ne nommez organisateur que des personnes de confiance. **À faire une fois : relancer `supabase/schema.sql`** (nouvelles règles).
- **Code de déverrouillage** facultatif, défini par chaque membre dans « Mon compte » (4 à 6 chiffres, sur son appareil) : demandé à l'ouverture et après une minute d'absence.
- **Fiche d'un membre** : un clic sur son nom affiche le nombre de versements, le total versé, le total par moyen de paiement et le détail.
- **Rappels** : bandeau pour le membre, texte de rappel au groupe et relance individuelle par **lien WhatsApp**.
- **Calendrier des tours**, **tableau d'évolution en direct** (✓, pourcentages, ✗) et fil des dernières nouvelles.
- **Remise de la cagnotte** calculée automatiquement (somme encaissée), annulable.
- **Export PDF** (cagnotte, calendrier, cotisations du tour, paiements par tour).
- **Réactions emoji** (👍 ❤️ 😂 😮 😢 🙏) : bouton « ☺ Réagir » sous chaque message ; une réaction par personne et par message, visible en direct par tout le groupe (toucher une pastille la rejoint ou la retire, un autre emoji remplace le précédent). **À faire une fois : relancer `supabase/schema.sql`** (nouvelle table `reactions`).
- **Appels vocaux** entre deux membres (WebRTC) : icône 📞 verte sur chaque ligne de la liste des cotisations, ou fiche d'un membre (touchez son nom) → « 📞 Appeler en vocal ». Celui qui appelle entend une tonalité « ça sonne » dès que le téléphone de l'autre sonne vraiment (sinon l'écran dit « en attente »). L'autre voit un écran d'appel avec « Répondre » / « Refuser » (sonnerie et vibration) ; micro à couper, bouton « Haut-parleur » (amplifie la voix de l'autre ; le navigateur ne peut pas choisir la sortie du téléphone), bouton raccrocher, durée. S'il n'a pas l'appli ouverte, il reçoit une notification « 📞 Appel vocal » et l'appel continue de sonner une quarantaine de secondes. Le son passe directement d'un téléphone à l'autre (consomme quelques Mo par minute). **À faire une fois :** lancer `supabase/calls.sql` (règles du canal privé) et redéployer la fonction `push` (nouveau `kind: 'call'`). Sans serveur TURN, l'appel peut échouer sur certains réseaux mobiles très restrictifs : ajoutez alors dans `config.js` un `iceServers` (service TURN de votre choix, par exemple l'offre gratuite d'un fournisseur de TURN) ; l'appli indique « Connexion impossible » si l'appel ne passe pas.
- **Répondre à un message** (comme sur WhatsApp) : bouton ↩ sous un message, ou glisser le message vers la droite sur téléphone ; l'extrait cité s'affiche au-dessus de la réponse et un clic dessus ramène au message d'origine. **À faire une fois : relancer `supabase/schema.sql`** (nouvelle colonne `reply`).
- **Discussion par sujets** avec photos, vocaux (enregistrés dans l'appli) et PDF. **Photos** : bouton 📷 (appareil photo ou galerie), réduites avant l'envoi ; elles s'affichent d'elles-mêmes dans la discussion et un appui les agrandit, avec « Enregistrer la photo ». **Vidéos** : même bouton 📷, jusqu'à 20 Mo (clips courts de préférence, pas de compression) ; elles ne se téléchargent qu'au moment où on appuie sur « ▶ Voir la vidéo », pour ménager les données mobiles. **À faire une fois : relancer `supabase/schema.sql`** (limite du stockage portée à 20 Mo) et redéployer la fonction `push` (texte « 🎬 Vidéo » de la notification).

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
3. **Authentication → Providers → Email** : laissez l'e-mail activé. Les comptes par numéro de téléphone n'ont pas de boîte e-mail : lancez une fois `supabase/phone-accounts.sql` (éditeur SQL) pour qu'ils soient confirmés d'office, quel que soit le réglage « Confirm email ».
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

## Mot de passe oublié

Les comptes se créent avec un numéro de téléphone : personne n'a de boîte e-mail, donc aucun lien de réinitialisation ne peut être envoyé. Un **organisateur** réinitialise le mot de passe d'un membre :

1. Organisateur → Membres et ordre de passage → **🔑 Mot de passe** en face du nom (deux clics pour confirmer).
2. L'appli affiche un **mot de passe provisoire** (8 caractères), à donner au membre par WhatsApp (bouton prévu) ou de vive voix. Il ne sera plus affiché ; l'action est inscrite au journal.
3. Le membre se connecte avec son numéro et ce mot de passe : l'appli lui demande **aussitôt d'en choisir un nouveau**. L'ancien mot de passe ne marche plus.

Sur l'écran de connexion, « Mot de passe oublié ? » explique ces étapes. Chacun peut aussi changer son mot de passe dans **Mon compte → Changer mon mot de passe**.

Mise en place (une fois) : Supabase → **Edge Functions → Deploy a new function → Via Editor**, nom **`account`**, collez `supabase/functions/account/index.ts`, laissez « Verify JWT » activé, puis Deploy. Aucun secret à ajouter (`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase). `npm run test:account` teste les droits de la fonction.

Un organisateur qui oublie son mot de passe se fait réinitialiser par un **autre organisateur**, de la même façon. S'il est le seul organisateur, l'administrateur de l'application le change dans Supabase → Authentication → Users.

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
