---
name: dossier-candidature
description: Prépare le dossier de candidature d'une offre de mon appli de recherche d'emploi, dans Google Drive — lettre de motivation et/ou CV dont seul le titre est adapté au poste — puis relie les documents à l'offre dans l'appli. Lancé par les boutons « Générer la lettre » et « Préparer le CV » de l'appli (message commençant par /dossier-candidature lettre, cv ou tout, suivi de l'identifiant de l'offre), ou quand je dis « prépare ma candidature pour… ».
---

# Dossier de candidature (lettre de motivation, CV)

Tu tournes dans Claude sur mon abonnement : **aucune API payante n'est appelée**. Je lance souvent ce skill depuis mon téléphone, à partir de l'appli : le message ressemble à

```
/dossier-candidature lettre 3f1c…-uuid
Head of Product — Pigment
https://…
```

Premier mot après la commande : `lettre`, `cv` ou `tout` (les deux). Ensuite l'identifiant de l'offre dans l'appli. Le reste n'est qu'un rappel pour moi.

## Prérequis

- **Appli** : `APP_URL` et `INGEST_KEY`, cherchés comme dans `nouvelle-offre-jobhunt` (variables d'environnement, `.jobhunt.env` du dossier de travail, `config.env` à côté de ce skill, fichiers du projet Claude, sinon demande-les-moi). Ne recopie jamais la clé.
- **Google Drive** : connecteur Google Drive actif. Pour modifier un document Google Docs, suis le skill `google-workspace`.
- **CV de référence** : un Google Doc nommé `CV référence` (ou l'identifiant donné par `CV_REFERENCE_ID` dans la configuration) dans le dossier `Recherche d'emploi` de mon Drive. S'il est introuvable, arrête-toi et demande-moi de l'y déposer (un .docx converti en Google Docs convient). Ne fabrique jamais de CV à partir de rien.

Si l'appli renvoie 500, 502 ou 504 au premier appel, la base gratuite redémarre : attends 60 secondes et réessaie.

## Étapes

1. **Lis l'offre** :
   ```bash
   curl -sS "$APP_URL/api/ingest/offers/<id>" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"offer": {title, company, location, url, description, score_reason, cover_letter_url, cv_url, …}, "company": {description, sector, size, …}}`.
   Si la description est courte et que l'annonce s'ouvre sans connexion, lis l'annonce (`url`). Si `cover_letter_url` (ou `cv_url`) existe déjà, demande-moi si je veux une nouvelle version avant d'en créer une.

2. **Lis mon profil** dans la base de connaissance, par l'appli :
   ```bash
   curl -sS "$APP_URL/api/ingest/knowledge?path=profil/cv.md" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"path", "markdown"}`. Lis aussi `profil/preferences.md`, `profil/skills.md`, la liste `stories/` (`?path=stories`, puis les 2 ou 3 stories utiles) et, s'il existe, `entreprises/<entreprise>.md`. Si le dossier de travail est un clone de `jobhunt-knowledge`, lis les fichiers directement.

3. **Dossier Drive** : `Recherche d'emploi/Candidatures/<Entreprise> - <Intitulé>` (crée ce qui manque ; réutilise le dossier s'il existe).

4. **Lettre de motivation** (si `lettre` ou `tout`) : un Google Doc `Lettre - <Entreprise> - <Intitulé>` dans ce dossier.
   - Langue de l'annonce (français ou anglais). 250 à 350 mots, quatre paragraphes : pourquoi cette entreprise (d'après sa fiche et l'annonce, de façon précise), ce que j'apporte sur 2 ou 3 exigences clés de l'annonce avec une réalisation chiffrée tirée de mes stories, ma façon de travailler, conclusion et disponibilité.
   - Faits uniquement : aucun chiffre, employeur, diplôme ou réalisation qui ne soit pas dans la base de connaissance. S'il manque une information, écris `[À COMPLÉTER : …]` dans le texte.
   - Pas de formules creuses (« passionné », « dynamique », « je me permets »), pas de répétition du CV ligne à ligne.

5. **CV** (si `cv` ou `tout`) : copie le `CV référence` dans le dossier sous le nom `CV - <Prénom Nom> - <Entreprise>`, puis **remplace uniquement le titre** (la ligne d'accroche sous le nom) par l'intitulé du poste, adapté si besoin (ex. « Head of Product — Data & IA »). Ne touche à rien d'autre : ni expériences, ni compétences, ni mise en page.

6. **Relie les documents à l'offre** :
   ```bash
   curl -sS -X PATCH "$APP_URL/api/ingest/offers/<id>" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"cover_letter_url": "https://docs.google.com/document/d/…", "cv_url": "https://docs.google.com/document/d/…"}'
   ```
   N'envoie que les liens des documents créés.

7. **Réponds court** : les liens des documents, les `[À COMPLÉTER]` éventuels, et « Recharge l'offre dans l'appli ». Si l'appli était injoignable, donne les liens pour que je les colle dans « Liens des documents » de l'offre.

## Règles

- N'envoie rien à l'entreprise : pas d'e-mail, pas de formulaire, pas de candidature. Je relis et j'envoie moi-même.
- Ne modifie pas le `CV référence` ni la base de connaissance.
- `INGEST_KEY` n'apparaît jamais dans une réponse ni dans un document.
