---
name: reprise-historique
description: Reprend dans mon appli de recherche d'emploi l'historique déjà vécu — candidatures et processus en cours ou terminés, entretiens passés et à venir, personnes de mon réseau et rencontres — à partir de Gmail, Google Agenda, de mes pages Notion « Recherche Boulot », de mon classeur de suivi réseau et de mes notes. Me montre tout avant d'écrire. À utiliser quand je dis « reprends mon historique », « initialise mes processus », « mets à jour mes processus », « /reprise-historique ».
---

# Reprise de l'historique (Claude Desktop, à la demande)

Tu tournes dans Claude Desktop sur mon abonnement : **aucune API payante n'est appelée**. Tu reconstitues mes processus de recrutement, mes entretiens et mon réseau, tu me les fais valider, puis tu les envoies à mon appli en un seul lot.

Ce skill sert à l'initialisation, puis à chaque fois que je veux rattraper un retard de saisie : l'import est **idempotent**, relancer le même lot ne crée pas de doublons, et ce que tu renvoies met à jour ce qui existe.

## Prérequis

- Dossier de travail : mon clone local de `jobhunt-knowledge`, avec `.jobhunt.env` (`APP_URL`, `INGEST_KEY`), comme pour `veille-offres`.
- Connecteurs **Gmail** et **Notion** ; connecteur **Google Agenda** s'il est activé (sinon, travaille sans et dis-le).
- **Classeur de suivi réseau** (Excel sur mon OneDrive, onglet `reseau`) : lis la copie locale `veille/suivi-reseau.xlsx` (dossier ignoré par git). Si elle est absente ou date de plus d'une semaine, demande-moi de la télécharger depuis le lien `RESEAU_CLASSEUR_URL` de `.jobhunt.env` (OneDrive > *Télécharger*) et de la déposer à cet endroit. Si j'ai un connecteur Microsoft 365 / OneDrive actif, tu peux lire le classeur directement à la place. Ne recopie jamais ce lien ailleurs.
- Si un prérequis manque, arrête-toi et dis lequel.

## Étapes

1. **Période.** Demande-moi depuis quand reprendre (par défaut : les 6 derniers mois) et s'il y a des processus que je veux ajouter de mémoire.

2. **Rassemble les faits**, en lecture seule :
   - **Gmail, messages envoyés** : candidatures, envois de CV, remerciements après entretien (`in:sent` avec `CV`, `candidature`, `entretien`, `merci pour notre échange`, pièces jointes PDF).
   - **Gmail, messages reçus** : accusés de réception de candidature, invitations et confirmations d'entretien, refus, propositions (`candidature`, `entretien`, `interview`, `application`, `votre profil`, `malheureusement`, `proposition`).
   - **Google Agenda** : événements avec une entreprise, un recruteur ou les mots entretien / interview / call / visio.
   - **Notion, page « Recherche Boulot »** (cherche-la par son titre, puis parcours ses sous-pages) :
     - une sous-page **par entreprise** (Datadog, Pigment, Alma, Mistral…) : section « Statut » (poste visé, canal d'entrée, prochaine étape), lien de l'offre, pages de préparation. Chaque page donne un processus en cours ;
     - **Candidatures fermées** : ses sous-pages sont des processus terminés (`lost` ou `withdrawn` selon ce qui est écrit ; si rien ne le dit, `lost` et précise-le dans `notes`) ;
     - **Préparation entretiens** : dates, types d'entretien et interlocuteurs ;
     - **Réseau** : le tableau (nom, date vue…) et les sous-pages de rencontres (« Déj Alexandre Bilger (ChapsVision) — 2026-07-01 », « Samuel Savin - Datadog »…) donnent des personnes et des rencontres `seen` datées ;
     - ignore les pages qui ne parlent ni de candidature ni de réseau (PSE Microsoft, LHH, Accompagnement…) : elles sont personnelles.
   - **Classeur de suivi réseau, onglet `reseau`** : une personne par ligne, avec les contacts pris. Lis-le avec Python (`openpyxl` ou `pandas`). Les colonnes ne sont pas imposées : commence par me montrer l'en-tête et la correspondance que tu proposes vers les champs `people` et `meetings` (nom, entreprise, rôle, e-mail, LinkedIn, date et objet du contact, suite donnée), et attends mon accord.
   - **Mes notes** dans le dossier de travail : `entretiens/` (préparations et comptes rendus), `reseau/` (notes d'échange), `entreprises/`.
   Regroupe par entreprise et par poste, et fusionne les personnes vues dans plusieurs sources (Notion, classeur, e-mails). En cas de désaccord entre sources, garde la plus récente et signale-le. N'invente rien : une information absente reste absente (champ omis), et si tu déduis quelque chose (par ex. une étape), dis-le dans `notes`.

3. **Montre-moi un tableau de synthèse avant toute écriture**, un processus par ligne : entreprise, poste, étape (`stage`), entretiens (date, type, statut), prochaine étape et date, sources (e-mail, agenda, Notion, classeur, note). Puis la liste des personnes et rencontres. Demande-moi de corriger, compléter ou retirer des lignes, et attends ma validation.

4. **Prépare le lot** dans `veille/reprise-<AAAA-MM-JJ>.json` (dossier ignoré par git), au format ci-dessous, puis **simule** :
   ```bash
   source .jobhunt.env
   curl -sS -X POST "$APP_URL/api/ingest/import?dry_run=1" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d @veille/reprise-<date>.json
   ```
   La réponse donne, sans rien écrire, ce qui serait créé, mis à jour ou inchangé (`counts` et `items`). En cas d'erreur 400, le message indique l'élément fautif (ex. `processes[3] (Datadog — Senior PM) : …`) : corrige et recommence.
   Si l'appli renvoie une erreur 500, 502 ou 504 au premier appel, la base gratuite redémarre : attends 60 secondes et réessaie.

5. **Montre-moi le résultat de la simulation** (nombre de créations et de mises à jour par type) et attends mon accord explicite.

6. **Importe** avec la même commande, sans `?dry_run=1`. Un lot invalide est refusé en entier : rien n'est écrit à moitié.

7. **Résume** : processus créés et mis à jour, entretiens, personnes, rencontres, et le lien `$APP_URL/` pour vérifier. Garde le fichier du lot : il servira de base à la prochaine mise à jour.

## Format du lot

```json
{
  "processes": [
    {
      "company": "Datadog",
      "title": "Senior Product Manager APM",
      "url": "https://… (lien de l'offre, si connu)",
      "location": "Paris",
      "contract": "CDI",
      "source": "network",
      "source_detail": "Cooptation Samuel Savin",
      "applied_at": "2026-10-07T09:00:00Z",
      "company_info": { "description": "Plateforme d'observabilité cloud", "size": "6 500 salariés", "sector": "logiciel" },
      "stage": "interviews",
      "next_step": "Entretien hiring manager",
      "next_step_date": "2026-10-20",
      "contact_name": "Prénom Nom (recruteur)",
      "notes": "Faits utiles, et ce qui est déduit plutôt que lu.",
      "interviews": [
        { "scheduled_at": "2026-10-10T14:00:00Z", "kind": "Recruteur", "interviewers": "Prénom Nom",
          "status": "done", "outcome": "Positif, passe au HM",
          "prep_path": "entretiens/datadog-recruteur-2026-10-10.md" }
      ]
    }
  ],
  "people": [
    {
      "name": "Samuel Savin",
      "company": "Datadog",
      "email": "…",
      "strength": 2,
      "tags": "datadog, cooptation",
      "meetings": [
        { "status": "seen", "planned_at": "2026-10-07T08:00:00Z", "topic": "Opportunités chez Datadog",
          "outcome": "Pousse mon CV pour Senior PM APM", "next_actions": "Le tenir au courant",
          "offer": { "company": "Datadog", "title": "Senior Product Manager APM" } }
      ]
    }
  ]
}
```

Valeurs autorisées :
- `stage` : `applied` (candidature envoyée), `screening` (premier échange recruteur), `interviews`, `case_study`, `final`, `offer` (proposition reçue), `won`, `lost` (refus), `withdrawn` (je me suis retiré). `won`, `lost` et `withdrawn` clôturent l'offre.
- `interviews[].status` : `to_prepare` (à venir), `done`, `cancelled`.
- `meetings[].status` : `to_see`, `planned`, `seen`, `cancelled`.
- `source` : `linkedin`, `wttj`, `cabinet`, `manual`, `network`, `other`.
- `strength` : 1 = faible, 2 = moyen, 3 = proche.
- Dates : ISO 8601 (`2026-10-10T14:00:00Z`), et `AAAA-MM-JJ` pour `next_step_date`.

Comment l'appli retrouve ce qui existe déjà :
- **offre** : par son URL, sinon par entreprise + intitulé (une offre remontée par la veille est donc reprise, pas dupliquée — garde l'intitulé tel qu'il apparaît dans l'appli) ;
- **processus** : un par offre ;
- **entretien** : même processus et même date à la minute (sans date : même `kind`) ;
- **personne** : même e-mail, même profil LinkedIn, sinon même nom dans la même entreprise ;
- **rencontre** : même personne et même date (sans date : même `topic`).
Un champ envoyé remplace la valeur en base ; un champ absent n'y touche pas. N'envoie donc pas `null` pour une information que tu ne connais pas : omets le champ.

## Règles

- Lecture seule sur Gmail, l'agenda, Notion et le classeur : ne marque rien, ne déplace rien, ne réponds à rien, ne crée aucun événement, ne modifie aucune page ni cellule.
- Rien n'est importé sans ma validation du tableau (étape 3) **et** de la simulation (étape 5).
- Données personnelles : pour les personnes, ne reprends que ce qui sert au suivi (nom, entreprise, rôle, e-mail ou LinkedIn). Pas de téléphone sauf si je le demande.
- N'écris rien dans le dépôt de connaissance en dehors du dossier `veille/`. Si un compte rendu d'entretien mérite une fiche, propose-la-moi : c'est le rôle des skills de `jobhunt-knowledge`.
