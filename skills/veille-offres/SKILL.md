---
name: veille-offres
description: Veille quotidienne des offres d'emploi. Lit mes alertes e-mail (LinkedIn, Welcome to the Jungle, cabinets de recrutement) dans Gmail, extrait chaque offre, la note par rapport à mon profil et l'enregistre dans mon appli de recherche d'emploi en statut « à valider ». Conçu pour une tâche planifiée de Claude Desktop (abonnement Pro, aucune clé API). À utiliser quand je dis « fais la veille », « nouvelles offres », « /veille-offres ».
---

# Veille des offres (tâche planifiée Claude Desktop)

Tu tournes dans Claude Desktop sur mon abonnement : **aucune API payante n'est appelée**. Tu lis Gmail via le connecteur Gmail, tu fais toi-même l'extraction et la notation, puis tu envoies le résultat à mon appli.

## Prérequis

- Connecteur **Gmail** activé dans Claude Desktop.
- Le dossier de travail de la tâche est mon clone local de `jobhunt-knowledge` (celui ouvert dans Obsidian). Il contient un fichier `.jobhunt.env`, ignoré par git :

```
APP_URL=https://<mon-appli>.azurestaticapps.net
INGEST_KEY=<clé d'ingestion affichée par infra/deploy.sh>
```

Si un prérequis manque, arrête-toi et dis lequel.

## Expéditeurs à surveiller

| Recherche Gmail | source | source_detail |
|---|---|---|
| `from:jobalerts-noreply@linkedin.com` | linkedin | Alerte LinkedIn |
| `from:jobs-noreply@linkedin.com` | linkedin | Suggestions LinkedIn |
| `from:welcometothejungle.com` | wttj | Alerte WTTJ |
| `from:michaelpage.fr` | cabinet | Michael Page |
| `from:hays.fr` | cabinet | Hays |
| `from:robertwalters.fr` | cabinet | Robert Walters |
| `from:apec.fr` | other | Apec |

Ajoute ici les cabinets dont je reçois les alertes.

## Étapes

1. **Lis mon profil** dans le dossier de travail : `profil/preferences.md`, `profil/skills.md`, `profil/cv.md`. C'est la seule référence pour noter. S'il est encore rempli de `TODO:`, note quand même mais signale-le dans le résumé.

2. **Depuis quand ?** Récupère la date du dernier passage :
   ```bash
   source .jobhunt.env
   curl -sS "$APP_URL/api/ingest/last" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"last_run_at": "...", ...}`. S'il est `null`, prends les 3 derniers jours.
   C'est souvent le premier appel du passage : la base gratuite, en pause, met environ une minute à redémarrer et la réponse peut être une erreur (500, 502, 504 ou délai dépassé). Attends 60 secondes et réessaie, jusqu'à 2 fois. Si ça échoue encore, prends les 7 derniers jours : l'étape suivante écarte de toute façon les e-mails déjà traités.

3. **Cherche les e-mails** pour chaque expéditeur du tableau, depuis cette date (`after:AAAA/MM/JJ`). Maximum 40 e-mails par passage. Note pour chacun son identifiant de message.

4. **Écarte ceux déjà traités** :
   ```bash
   curl -sS -X POST "$APP_URL/api/ingest/unseen" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"ids": ["<id1>", "<id2>"]}'
   ```
   → ne garde que les `ids` renvoyés.

5. **Pour chaque e-mail restant**, lis le contenu et extrais **chaque offre distincte** :
   - `title`, `company`, `location`, `contract`, `salary` (null si absent) ;
   - `url` : lien direct vers l'offre (tu peux retirer les paramètres de suivi) ;
   - `description` : 2 ou 3 phrases factuelles, d'après l'e-mail uniquement ;
   - `score` de 0 à 100 d'adéquation avec mon profil ; pénalise fortement ce qui est dans « Je ne recherche pas » ou « Je n'aime pas ». Une offre qui viole un « Point non négociable » (ex. ESN, salaire publié sous le minimum, hors de la zone géographique) ne dépasse pas 20 ;
   - `score_reason` : une ligne qui justifie le score.
   N'invente aucune offre ni aucune information. Ignore publicités, articles et liens de navigation.

5 bis. **Complète les offres dont le score est d'au moins 50**, pour que je puisse décider sans chercher (les autres, inutile) :
   - **page de l'offre** (si elle s'ouvre sans connexion) : `location` précise (ville, voire adresse du bureau), `remote` (politique de télétravail, ex. « 2 j/sem. »), `salary` s'il est publié ;
   - **entreprise**, dans `company_info` : `description` (ce qu'elle fait, 1 ou 2 phrases), `size` (effectif, ex. « 450 salariés »), `sector`, `funding` (stade ou dernière levée, ex. « Série C, 2025 »), `headquarters`, `website`. Sources : site de l'entreprise, page carrière, presse. Cherche une seule fois par entreprise : demande d'abord la liste de celles déjà décrites (`GET $APP_URL/api/ingest/companies`) et saute celles qui ont déjà une `description`.
   Si une information est introuvable, omets le champ ; n'estime pas.

6. **Envoie un lot par e-mail** (le serveur ignore les doublons et mémorise l'e-mail comme traité) :
   ```bash
   curl -sS -X POST "$APP_URL/api/ingest" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d @/tmp/lot.json
   ```
   ```json
   {
     "source": "linkedin",
     "source_detail": "Alerte LinkedIn",
     "message_id": "<identifiant du message Gmail>",
     "received_at": "<date de l'e-mail, ISO 8601>",
     "offers": [ { "title": "…", "company": "…", "location": "…", "remote": "2 j/sem.", "contract": null, "salary": null,
                   "url": "…", "description": "…", "score": 78, "score_reason": "…",
                   "company_info": { "description": "…", "size": "450 salariés", "sector": "logiciel",
                                     "funding": "Série C, 2025", "headquarters": "Paris 9e", "website": "https://…" } } ]
   }
   ```
   Envoie aussi les e-mails sans offre (`"offers": []`) pour qu'ils ne soient pas relus. Les infos d'entreprise ne remplissent que les champs encore vides : ce que j'ai saisi n'est jamais écrasé.

7. **Résume** en quelques lignes : e-mails lus, offres créées et doublons (réponses `{"created": n, "duplicates": m}`), les 3 meilleures offres avec score et lien `$APP_URL/offres`.

## Re-noter les offres déjà remontées

Quand je dis « renote les offres » (par exemple après une mise à jour de mon profil), ne relis pas Gmail : repars des offres déjà dans l'appli.

1. Relis mon profil (étape 1 ci-dessus).
2. Récupère les offres encore à valider :
   ```bash
   curl -sS "$APP_URL/api/ingest/offers?status=proposed" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"offers": [{"id", "title", "company", "location", "salary", "description", "score", "score_reason", …}]}`
3. Pour chaque offre, recalcule `score` et `score_reason` avec les mêmes règles que l'étape 5, puis envoie-les :
   ```bash
   curl -sS -X PATCH "$APP_URL/api/ingest/offers/<id>" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"score": 15, "score_reason": "ESN : point non négociable"}'
   ```
   Pour une offre d'au moins 50 sans `location` précise ou `remote`, ajoute ces champs au même `PATCH` s'ils sont sur la page de l'offre ; et complète les entreprises sans `description` comme à l'étape 5 bis :
   ```bash
   curl -sS -X PATCH "$APP_URL/api/ingest/companies/<company_id>" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"description": "…", "size": "450 salariés", "funding": "Série C, 2025"}'
   ```
4. **Écarter des offres** : présente-moi d'abord la liste des offres qui violent un point non négociable, groupées par motif. Seulement après mon accord, envoie pour chacune `{"status": "rejected", "decision_note": "<motif>"}` sur la même route. Tu ne peux changer le statut que d'une offre encore « à valider » (sinon réponse 409) : mes décisions ne sont jamais écrasées.
5. Résume : offres renotées, offres écartées, les 5 meilleures avec leur nouveau score.

## Si l'appli est injoignable

Si `curl` échoue (réseau bloqué par le bac à sable de Claude Desktop, ou appli arrêtée), n'envoie rien. Écris les lots dans `veille/a-envoyer-<date>.json` dans le dossier de travail (ce dossier est ignoré par git) et signale-le : ils seront envoyés au prochain passage. Commence donc chaque passage par renvoyer les fichiers de `veille/` puis par les supprimer une fois acceptés.

## Règles

- Lecture seule sur Gmail : ne marque rien comme lu, ne déplace, ne supprime, ne réponds à rien.
- N'écris rien d'autre dans le dépôt de connaissance que le dossier `veille/`.
