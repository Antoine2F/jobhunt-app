# jobhunt-app

Mon outil de pilotage de recherche d'emploi : offres et processus, entretiens, démarches réseau, veille automatique des offres.

- **Site web installable sur Android** (PWA : menu Chrome > « Ajouter à l'écran d'accueil », sans Play Store).
- **Accueil** : ce qui est en cours à date, échéances des 14 prochains jours, offres à valider.
- **Offres** : boîte de validation (offres remontées par la veille, notées par Claude), ajout manuel par lien ou texte, processus, entretiens.
- **Réseau** : personnes, rencontres à faire / faites et ce qui en est sorti, « qui présente qui ».
- **Suggestions de contacts** pour chaque offre : personnes de l'entreprise, anciens, chemins d'introduction, recherche LinkedIn préremplie.
- **Profil** : lecture de la base de connaissance (dépôt `jobhunt-knowledge`, format OKF).

La base de connaissance (CV, stories, compétences, préférences, préparations d'entretien) vit dans un dépôt séparé : [`jobhunt-knowledge`](https://github.com/Antoine2F/jobhunt-knowledge).

## Architecture

```
core/     logique métier partagée (schéma, déduplication, accueil, suggestions, Claude, base de connaissance)
api/      API HTTP : Azure Functions (fonctions gérées par Static Web Apps) + serveur de dev
web/      interface React (Vite), PWA
db/       schéma SQL généré (npx tsx scripts/gen-schema.ts)
infra/    Bicep + script de déploiement Azure
skills/   skills Claude Desktop : veille des alertes e-mail (tâche planifiée), veille LinkedIn (computer use), reprise de l'historique, ajout d'une offre analysée
```

| Brique | Service | Coût attendu |
|---|---|---|
| Site + API | Azure Static Web Apps, offre Free | 0 € |
| Base de données | Azure SQL Database serverless, offre gratuite (100 000 vCore-s et 32 Go / mois, pause auto) | 0 € |
| Veille, extraction et notation des offres | Tâche planifiée Claude Desktop (abonnement Pro) | 0 € de plus |

Une alerte budget Azure à 5 €/mois est créée par le script de déploiement.

## Développement local

```bash
npm install
cp .env.example .env     # facultatif
npm run dev              # API sur :7071 (mémoire + données de démo) et site sur :5173
npm test                 # tests unitaires
npm run typecheck
```

Sans `SQL_CONNECTION_STRING`, l'API tourne en mémoire avec des données fictives. L'appli n'appelle jamais l'API Claude : l'extraction, la notation et la préparation d'entretien passent par Claude Desktop, sur ton abonnement.

## Mise en production

### 1. Préparer les accès

1. **Jeton GitHub (base de connaissance)** : https://github.com/settings/personal-access-tokens > *Fine-grained token*, accès au seul dépôt `jobhunt-knowledge`, permission *Contents : Read-only*. Sert à la page Profil de l'appli.
2. **Alertes** : dans LinkedIn, WTTJ et chez les cabinets, crée des alertes e-mail vers ton adresse Gmail. Les expéditeurs surveillés sont listés dans `skills/veille-offres/SKILL.md` : ajoute-y tes cabinets.

### 2. Créer l'infrastructure Azure

Vérifie d'abord ton crédit : portail Azure > *Cost Management + Billing* > *Crédits Azure* (et le type d'abonnement dans *Abonnements*).

```bash
az login                         # compte Azure
npm ci
ALLOWED_USERS=Antoine2F \
KNOWLEDGE_REPO=Antoine2F/jobhunt-knowledge \
ALERT_EMAIL=antoinedefontenay@yahoo.fr \
./infra/deploy.sh                # demande les secrets manquants
```

Le script crée la Static Web App, la base SQL (offre gratuite), applique le schéma, configure l'appli et affiche les secrets à copier dans GitHub.

### 3. Secret GitHub

Dans le dépôt jobhunt-app > *Settings > Secrets and variables > Actions*, crée `AZURE_STATIC_WEB_APPS_API_TOKEN` (valeur affichée par `deploy.sh`). Chaque push sur `main` déploie ensuite l'appli (`deploy.yml`) ; tant que ce secret est absent, le déploiement est simplement ignoré.

### 4. Connexion

L'appli est protégée par la connexion GitHub de Static Web Apps, et l'API n'accepte que les comptes listés dans `ALLOWED_USERS`. Sur Android : ouvre l'URL dans Chrome, connecte-toi, puis menu > *Ajouter à l'écran d'accueil*.

## Parcours d'une offre

1. **À valider** : remontée par la veille, notée sur 100, avec ce que fait l'entreprise, son effectif, son financement, le lieu et le télétravail. Tu la **rejettes**, ou tu la valides en choisissant comment y aller.
2. **Réseau d'abord** : tu cherches quelqu'un qui peut te recommander. La page de l'offre met en avant les contacts de ton réseau liés à l'entreprise (y travaillent, y ont travaillé, peuvent te présenter) et des recherches LinkedIn préremplies. Un contact retenu devient une rencontre « à voir » liée à l'offre.
   **À postuler** : candidature directe, le lien de l'annonce est en premier.
3. **Candidature** : « J'ai candidaté » crée le processus (étapes, entretiens, prochaine action), ou fait passer à « Candidature envoyée » un processus « À postuler ».

Une offre analysée dans une conversation Claude (process « nouvelle offre ») arrive directement en processus **À postuler** (`to_apply`) par le skill `nouvelle-offre-jobhunt` : une seule offre, dédupliquée par URL, sans passer par la boîte de validation.

Recherches LinkedIn par affinité : renseigne `NETWORK_AFFINITIES` dans les paramètres de la Static Web App (écoles et anciens employeurs séparés par des virgules, ex. `Polytechnique,Télécom Paris,Microsoft`) ; chaque offre propose alors « Polytechnique chez <entreprise> », etc.

## Veille des offres avec Claude Desktop (abonnement Pro)

Aucune clé API : la veille tourne comme **tâche planifiée de Claude Desktop**. Elle lit Gmail par le connecteur Gmail, extrait et note les offres, puis les envoie à l'appli.

1. Clone `jobhunt-knowledge` sur ton ordinateur (c'est aussi ton coffre Obsidian) et crée à sa racine `.jobhunt.env` avec `APP_URL` et `INGEST_KEY` (affichés par `deploy.sh`).
2. Dans Claude Desktop : active le connecteur **Gmail** et ajoute les skills du dossier `skills/`.
3. Crée une **tâche planifiée** :
   - dossier de travail : ton clone `jobhunt-knowledge` ;
   - instruction : « Fais la veille des offres avec le skill veille-offres » ;
   - fréquence : par exemple chaque jour ouvré à 8 h.
4. Si le bac à sable de Claude Desktop bloque le réseau, autorise le domaine de l'appli (`*.azurestaticapps.net`) dans ses paramètres. Sinon les lots sont mis de côté dans `veille/` et renvoyés au passage suivant.

Les tâches planifiées ne tournent que lorsque Claude Desktop est ouvert et l'ordinateur allumé. Un passage manqué est rattrapé au suivant : la veille reprend depuis la date du dernier passage.

**LinkedIn en direct** : le skill `linkedin-veille` parcourt tes alertes LinkedIn dans ton navigateur (computer use, à la demande, sous ta supervision). LinkedIn interdit l'extraction automatisée : ne le planifie pas, lance-le toi-même de temps en temps.

**Re-noter les offres** : après une mise à jour du profil, dis « renote les offres » au skill `veille-offres`. Il relit les offres encore à valider dans l'appli (`GET /api/ingest/offers`), les renote (`PATCH /api/ingest/offers/<id>`) et te propose d'écarter celles qui violent un point non négociable. Il ne change jamais le statut d'une offre que tu as déjà traitée.

**Reprendre l'historique** : le skill `reprise-historique` reconstitue tes processus en cours ou terminés, tes entretiens et ton réseau à partir de Gmail, Google Agenda, de ta page Notion « Recherche Boulot », de ton classeur de suivi réseau (copie locale `veille/suivi-reseau.xlsx`, lien OneDrive dans `RESEAU_CLASSEUR_URL` de `.jobhunt.env`) et de tes notes, te les montre, simule l'import puis l'envoie (`POST /api/ingest/import`, `?dry_run=1` pour simuler). L'import est idempotent : relance-le pour rattraper une saisie en retard.

## Évolution du schéma

Le schéma est défini dans `core/src/schema.ts`. L'API applique elle-même le script idempotent à sa première connexion à la base : une colonne ajoutée dans le code existe en production dès le déploiement suivant. Pour garder `db/schema.sql` à jour (ou l'appliquer à la main) :

```bash
npx tsx scripts/gen-schema.ts                         # régénère db/schema.sql (idempotent)
SQL_CONNECTION_STRING=... npm run migrate              # applique (ajoute tables/colonnes manquantes)
```
