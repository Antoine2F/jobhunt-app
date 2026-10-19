---
name: maj
description: Mise à jour complète de mon appli de recherche d'emploi. Lance la veille des nouvelles offres, puis lit mes e-mails et mon agenda pour repérer les candidatures que j'ai envoyées, les retours positifs ou négatifs (sur la candidature et sur chaque étape des pistes) et mes rencontres réseau, me montre les changements et les enregistre. À utiliser quand je dis « fais la maj », « mets à jour l'appli », « /maj ».
---

# Mise à jour de l'appli (veille + suivi des candidatures + réseau)

Tu tournes dans Claude sur mon abonnement : **aucune API payante n'est appelée**. Ce skill fait en un passage ce que je ferais à la main dans l'appli.

## Rappel : le parcours d'une offre dans l'appli

Nouvelle › Intéressante › À postuler › **Postulé** › **Piste** › Offre acceptée.
- **Postulé** : en attente retour, retour positif (devient une piste), retour négatif (« CV refusé »).
- **Piste** : des étapes nommées `Step 1 (HR)`, `Step 2 (Recr. Mgr)`, `Step 3 (UC)`, `Step 4 (culture)` par défaut (renommables, on peut en ajouter). Chaque étape est **à planifier**, **en attente retour** (l'entretien a eu lieu), **retour positif** ou **retour négatif** (la piste passe « en échec »). L'étape en cours est la première sans retour positif.

## Prérequis

- `APP_URL` et `INGEST_KEY`, cherchés comme dans `nouvelle-offre-jobhunt` (variables d'environnement, `.jobhunt.env` du dossier de travail, `config.env` à côté de ce skill, fichiers du projet Claude, sinon demande-les-moi). Ne recopie jamais la clé.
- Connecteur **Gmail** ; connecteur **Google Agenda** s'il est actif (sinon, travaille sans et dis-le).
- Si l'appli renvoie 500, 502 ou 504 au premier appel, la base gratuite redémarre : attends 60 secondes et réessaie, jusqu'à 2 fois.

## Étapes

1. **Veille des nouvelles offres** : suis le skill `veille-offres` (étapes 1 à 6, sans son résumé final). Garde ses chiffres pour le résumé.

2. **Ce qui est en cours dans l'appli** :
   ```bash
   curl -sS "$APP_URL/api/ingest/pipeline" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"offers": [{"id", "title", "company", "url", "category": "to_apply" | "waiting" | "lead", "state", "steps": [{"id", "name", "result", "scheduled_at"}]}]}`.

3. **Lis les e-mails des 14 derniers jours** (ou depuis la date que je donne), hors alertes d'offres déjà traitées par la veille. Recherches Gmail, à combiner avec `after:AAAA/MM/JJ` :
   - **candidatures envoyées** : `in:sent (candidature OR CV OR application OR "lettre de motivation")`, et les confirmations `("votre candidature" OR "your application" OR "thank you for applying" OR "candidature bien reçue")` ;
   - **retours** : `(entretien OR interview OR "vos disponibilités" OR "your availability" OR "next step" OR "prochaine étape" OR calendly OR "échanger")` et `(malheureusement OR unfortunately OR "pas donner suite" OR "not moving forward" OR "other candidates" OR "autres candidats")` ;
   - **réseau** : échanges avec des personnes (pas des recruteurs) pour un café, un déjeuner, un appel.
   Écarte les e-mails déjà traités par une maj précédente :
   ```bash
   curl -sS -X POST "$APP_URL/api/ingest/unseen" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"ids": ["<id1>", "<id2>"]}'
   ```
   **Google Agenda** (14 jours passés et 14 à venir) : événements avec une entreprise suivie (entretiens), ou avec une personne (rencontres réseau).

4. **Rattache chaque fait à une offre** de l'étape 2 (entreprise, intitulé, recruteur). En cas de doute, ne devine pas : mets-le dans « à vérifier ». Déduis le changement :

   | Fait | Offre | Changement |
   |---|---|---|
   | J'ai envoyé ma candidature (ou accusé de réception) | à postuler | → Postulé (`move` `{"step": "applied"}`) |
   | Idem, offre absente de l'appli | — | nouvelle offre au stage `applied` (import, voir plus bas) |
   | Invitation à un entretien, demande de disponibilités | en attente retour | → Piste (`{"step": "lead"}`) ; l'étape 1 reste à planifier |
   | Refus après candidature | en attente retour | → CV refusé (`{"exit": "lost"}`) |
   | Entretien passé (date passée dans l'agenda ou dans l'e-mail) | piste | étape concernée → `waiting`, avec sa date |
   | Invitation à l'étape suivante | piste | étape précédente → `positive` (l'étape suivante reste à planifier) |
   | Refus après un entretien | piste | étape concernée → `negative` (la piste passe en échec) |
   | Étape non prévue (ex. entretien CEO) | piste | ajoute l'étape, puis renseigne-la |
   | Café, déjeuner, appel avec une personne | — | rencontre réseau `seen` (passée) ou `planned` (à venir) |

   L'étape concernée d'une piste est l'étape en cours, sauf si l'e-mail en nomme clairement une autre (« entretien avec le manager » → `Step 2 (Recr. Mgr)`). Ne recule jamais une offre (une piste ne redevient pas « postulé ») sans me le demander.

5. **Montre-moi le tableau des changements** avant d'écrire : offre, changement, preuve (expéditeur, date, objet de l'e-mail ou titre de l'événement), puis la liste « à vérifier ». Attends mon accord ; j'ai le droit de corriger ou de retirer des lignes.

6. **Enregistre** ce que j'ai validé :
   - avancer ou arrêter une offre :
     ```bash
     curl -sS -X POST "$APP_URL/api/ingest/offers/<id>/move" -H "content-type: application/json" \
       -H "x-ingest-key: $INGEST_KEY" -d '{"step": "lead"}'
     ```
   - retour d'une étape de piste (date et interlocuteurs si connus) :
     ```bash
     curl -sS -X POST "$APP_URL/api/ingest/steps/<step_id>/result" -H "content-type: application/json" \
       -H "x-ingest-key: $INGEST_KEY" -d '{"result": "waiting", "scheduled_at": "2026-10-20T14:00:00Z", "interviewers": "Prénom Nom (HRBP)"}'
     ```
   - ajouter une étape : `POST $APP_URL/api/ingest/offers/<id>/steps` avec `{"name": "Step 5 (CEO)"}` ;
   - offres absentes de l'appli et rencontres réseau : un seul lot `POST $APP_URL/api/ingest/import` au format du skill `reprise-historique` (simule d'abord avec `?dry_run=1`), par exemple :
     ```json
     {
       "processes": [{ "company": "Alma", "title": "Lead PM", "url": "https://…", "applied_at": "2026-10-15T09:00:00Z", "stage": "applied" }],
       "people": [{ "name": "Prénom Nom", "company": "Pigment",
                    "meetings": [{ "status": "seen", "planned_at": "2026-10-16T12:30:00Z", "topic": "Déjeuner : équipe produit Pigment",
                                   "offer": { "company": "Pigment", "title": "Head of Product" } }] }]
     }
     ```
   - enfin, marque comme traités les e-mails lus (même ceux qui n'ont rien donné) :
     ```bash
     curl -sS -X POST "$APP_URL/api/ingest/seen" -H "content-type: application/json" \
       -H "x-ingest-key: $INGEST_KEY" -d '{"ids": ["<id1>", "<id2>"], "source": "maj"}'
     ```

7. **Résume** en quelques lignes : nouvelles offres (veille), candidatures passées en « postulé », nouvelles pistes, retours positifs et négatifs, rencontres réseau ajoutées, points à vérifier, et le lien `$APP_URL/`.

## Règles

- Lecture seule sur Gmail et l'agenda : ne marque rien comme lu, ne réponds à rien, ne crée ni ne modifie aucun événement.
- Rien n'est écrit dans l'appli sans ma validation du tableau (étape 5).
- N'invente ni date ni nom : une information absente reste absente.
- Données personnelles : pour les rencontres, seulement le nom, l'entreprise, le rôle et l'objet.
