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
ingest/   veille : lit les alertes Gmail (IMAP), extrait et note les offres avec Claude, les envoie à l'API
db/       schéma SQL généré (npx tsx scripts/gen-schema.ts)
infra/    Bicep + script de déploiement Azure
skills/   skill Claude « veille LinkedIn » (computer use, à la demande)
```

| Brique | Service | Coût attendu |
|---|---|---|
| Site + API | Azure Static Web Apps, offre Free | 0 € |
| Base de données | Azure SQL Database serverless, offre gratuite (100 000 vCore-s et 32 Go / mois, pause auto) | 0 € |
| Veille planifiée | GitHub Actions (≈ 3 × 1 min / jour) | 0 € (quota gratuit) |
| Extraction et notation | API Claude, modèle Haiku | quelques centimes à 1-2 € / mois |

Une alerte budget Azure à 5 €/mois est créée par le script de déploiement.

## Développement local

```bash
npm install
cp .env.example .env     # facultatif
npm run dev              # API sur :7071 (mémoire + données de démo) et site sur :5173
npm test                 # tests unitaires
npm run typecheck
```

Sans `SQL_CONNECTION_STRING`, l'API tourne en mémoire avec des données fictives. L'ajout d'offre par lien/texte demande `ANTHROPIC_API_KEY`.

## Mise en production

### 1. Préparer les accès

1. **Clé Claude** : https://console.anthropic.com > API Keys.
2. **Gmail** : active la validation en deux étapes, puis crée un *mot de passe d'application* (https://myaccount.google.com/apppasswords). La veille lit Gmail en lecture seule.
3. **Jeton GitHub (base de connaissance)** : https://github.com/settings/personal-access-tokens > *Fine-grained token*, accès au seul dépôt `jobhunt-knowledge`, permission *Contents : Read-only*.
4. **Alertes** : dans LinkedIn, WTTJ et chez les cabinets, crée des alertes e-mail vers ton adresse Gmail. Les expéditeurs reconnus sont listés dans `ingest/sources.json` : ajoute-y tes cabinets.

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

### 3. Secrets GitHub (dépôt jobhunt-app > Settings > Secrets and variables > Actions)

| Secret | Valeur |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | affiché par `deploy.sh` |
| `APP_URL` | `https://<nom>.azurestaticapps.net` |
| `INGEST_KEY` | affiché par `deploy.sh` |
| `ANTHROPIC_API_KEY` | clé Claude |
| `GMAIL_USER` | ton adresse Gmail |
| `GMAIL_APP_PASSWORD` | mot de passe d'application |
| `KNOWLEDGE_TOKEN` | jeton GitHub lecture seule |

Chaque push sur `main` déploie (`deploy.yml`). La veille tourne à 7 h, 12 h et 18 h du lundi au samedi (`ingest.yml`), et peut être lancée à la main (onglet Actions, option « dry run » pour tester sans enregistrer).

### 4. Connexion

L'appli est protégée par la connexion GitHub de Static Web Apps, et l'API n'accepte que les comptes listés dans `ALLOWED_USERS`. Sur Android : ouvre l'URL dans Chrome, connecte-toi, puis menu > *Ajouter à l'écran d'accueil*.

## Veille LinkedIn par computer use

LinkedIn interdit l'extraction automatisée : la source principale reste les alertes e-mail. Pour une passe complémentaire, sous ta supervision, depuis Claude Desktop : copie `skills/linkedin-veille` dans tes skills Claude, crée `~/.jobhunt.env` (voir le skill), puis demande « fais la veille LinkedIn ».

## Évolution du schéma

Le schéma est défini dans `core/src/schema.ts`. Après une modification :

```bash
npx tsx scripts/gen-schema.ts                         # régénère db/schema.sql (idempotent)
SQL_CONNECTION_STRING=... npm run migrate              # applique (ajoute tables/colonnes manquantes)
```
