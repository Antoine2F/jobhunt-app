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
   - `score` de 0 à 100 d'adéquation avec mon profil ; pénalise fortement ce qui est dans « Je ne recherche pas » ou « Je n'aime pas » ;
   - `score_reason` : une ligne qui justifie le score.
   N'invente aucune offre ni aucune information. Ignore publicités, articles et liens de navigation.

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
     "offers": [ { "title": "…", "company": "…", "location": "…", "contract": null, "salary": null,
                   "url": "…", "description": "…", "score": 78, "score_reason": "…" } ]
   }
   ```
   Envoie aussi les e-mails sans offre (`"offers": []`) pour qu'ils ne soient pas relus.

7. **Résume** en quelques lignes : e-mails lus, offres créées et doublons (réponses `{"created": n, "duplicates": m}`), les 3 meilleures offres avec score et lien `$APP_URL/offres`.

## Si l'appli est injoignable

Si `curl` échoue (réseau bloqué par le bac à sable de Claude Desktop, ou appli arrêtée), n'envoie rien. Écris les lots dans `veille/a-envoyer-<date>.json` dans le dossier de travail (ce dossier est ignoré par git) et signale-le : ils seront envoyés au prochain passage. Commence donc chaque passage par renvoyer les fichiers de `veille/` puis par les supprimer une fois acceptés.

## Règles

- Lecture seule sur Gmail : ne marque rien comme lu, ne déplace, ne supprime, ne réponds à rien.
- N'écris rien d'autre dans le dépôt de connaissance que le dossier `veille/`.
