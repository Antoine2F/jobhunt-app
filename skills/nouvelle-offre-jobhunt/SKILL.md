---
name: nouvelle-offre-jobhunt
description: Enregistre dans mon appli de recherche d'emploi UNE offre déjà analysée, en processus « À postuler » (stage to_apply), sans doublon (déduplication par URL). Prend le payload de l'offre tel qu'il a été extrait dans la conversation ; ne scanne ni Gmail ni Notion et ne demande pas de validation de tableau. À utiliser en dernière étape du process « nouvelle offre », ou quand je dis « ajoute cette offre à l'appli », « /nouvelle-offre-jobhunt ».
---

# Nouvelle offre → appli (une ligne, à la demande)

Tu tournes dans Claude Desktop sur mon abonnement : **aucune API payante n'est appelée**. L'offre est déjà extraite et analysée dans la conversation : ton seul travail est de l'envoyer à mon appli comme un processus unique au stage `to_apply` (« À postuler »).

Ce skill ne cherche rien : pas de Gmail, pas de Notion, pas d'agenda, pas de tableau de synthèse à valider.

## Prérequis : adresse de l'appli et clé d'ingestion

Il te faut `APP_URL` et `INGEST_KEY`. Cherche-les dans cet ordre et prends la première source qui les donne toutes les deux :

1. variables d'environnement `APP_URL` et `INGEST_KEY` ;
2. fichier `.jobhunt.env` du dossier de travail (clone de `jobhunt-knowledge` dans Claude Desktop) ;
3. fichier `config.env` à côté de ce `SKILL.md` (dossier du skill) ;
4. fichiers du projet Claude (connaissances du projet) : un fichier `jobhunt.env` ou `.jobhunt.env`, ou un texte contenant `APP_URL=` et `INGEST_KEY=` ;
5. sinon, demande-les-moi en une seule question, puis continue.

Une valeur restée à `<…>` (modèle non rempli) compte comme absente. Ne recopie jamais `INGEST_KEY` dans ta réponse ni dans un fichier.

Dans les commandes ci-dessous, exporte d'abord les deux valeurs :
```bash
export APP_URL="https://…" INGEST_KEY="…"
```

Si tu n'as ni terminal ni accès réseau vers l'appli (domaine `*.azurestaticapps.net` bloqué), ne t'arrête pas en silence : affiche le JSON du lot (étape 1) et la commande `curl` à lancer, et dis-moi d'autoriser le domaine dans les paramètres réseau de Claude.

## Entrée

Le payload de l'offre déjà extrait (dans la conversation ou fourni en argument). Champs repris :

| Champ | Obligatoire | Remarque |
|---|---|---|
| `company` | oui | nom de l'entreprise |
| `title` | oui | intitulé tel qu'il apparaît dans l'annonce |
| `url` | oui | lien de l'annonce, sans paramètres de suivi (`utm_*`, `trk`, `refId`…) : sert à dédupliquer |
| `location`, `contract`, `salary`, `description` | non | |
| `source` | non | `linkedin`, `wttj`, `cabinet`, `manual`, `network`, `other` (défaut : `manual`) |
| `source_detail` | non | ex. « Annonce LinkedIn », « Envoyée par X » |
| `company_info` | non | voir le skill `fiche-entreprise` : `description`, `sector`, `size`, `headquarters`, `dev_offices`, `founders_nationality`, `capital_origin`, `funding`, `website` |
| `notes` | non | synthèse de l'analyse : score, points forts, points de vigilance |

Si `company`, `title` ou `url` manque, demande-le-moi en une question et attends. N'invente rien : un champ inconnu est omis, jamais envoyé à `null`.

## Étapes

0. **Fiche entreprise** : si le payload n'a pas de `company_info` (ou seulement quelques champs), complète-le avec le skill **`fiche-entreprise`** avant d'envoyer, en ne cherchant que ce qui manque. Si elle tombe en `ESN / Conseil IT`, signale-le-moi (point non négociable) mais envoie quand même : c'est moi qui ai retenu l'offre.

1. **Prépare le lot** dans `veille/nouvelle-offre.json` s'il existe un dossier de travail `jobhunt-knowledge` (dossier `veille/` ignoré par git), sinon dans un fichier temporaire `nouvelle-offre.json` : un seul processus, `stage` fixé à `to_apply`.
   ```json
   {
     "processes": [
       {
         "company": "Alma",
         "title": "Lead Product Manager Paiements",
         "url": "https://jobs.lever.co/alma/abc123",
         "location": "Paris",
         "contract": "CDI",
         "source": "linkedin",
         "source_detail": "Annonce LinkedIn",
         "company_info": { "description": "Paiement fractionné pour les commerçants", "sector": "Fintech / Banque / Assurance",
                          "size": "400 salariés", "headquarters": "Paris, France", "founders_nationality": "Française" },
         "stage": "to_apply",
         "notes": "Score 78/100. Points forts : … Vigilance : …"
       }
     ]
   }
   ```

2. **Simule** pour dédupliquer (rien n'est écrit) :
   ```bash
   curl -sS -X POST "$APP_URL/api/ingest/import?dry_run=1" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d @<chemin du lot>
   ```
   Si l'appli renvoie 500, 502 ou 504 au premier appel, la base gratuite redémarre : attends 60 secondes et réessaie, jusqu'à 2 fois.
   Lis `counts` dans la réponse :
   - `offer.created = 1` → offre nouvelle : passe à l'étape 3 ;
   - `offer.created = 0` et `process.created = 1` → l'offre existe déjà (remontée par la veille, pas encore traitée) : passe à l'étape 3, elle sera reprise et passée « À postuler » sans doublon ;
   - `process.created = 0` → **doublon** : l'offre est déjà suivie dans l'appli. N'importe rien (cela pourrait faire reculer un processus déjà engagé) et dis-le en une ligne.
   - erreur 400 : le message indique le champ fautif ; corrige et recommence.

3. **Importe** avec la même commande, sans `?dry_run=1`.

4. **Confirme en une ligne** : « Offre ajoutée à l'appli : <entreprise> — <intitulé> (À postuler) » ou « Déjà dans l'appli : … », avec le lien `$APP_URL/`.

## Règles

- Une offre par appel, toujours au stage `to_apply`. Pour faire avancer un processus existant, c'est l'appli (« J'ai candidaté ») ou le skill `reprise-historique`.
- Pas de confirmation supplémentaire : l'offre a déjà été validée dans les étapes précédentes du process « nouvelle offre ».
- N'écris rien dans le dépôt de connaissance en dehors de `veille/`.
- `INGEST_KEY` est un secret : jamais dans une réponse, un résumé ou un fichier du dépôt.
