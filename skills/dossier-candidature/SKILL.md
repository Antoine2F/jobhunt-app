---
name: dossier-candidature
description: Prépare le dossier de candidature d'une offre dans mon Google Drive — lettre de motivation et/ou CV dont seul le titre est adapté au poste — et me donne les liens. Lancé par les boutons « Générer la lettre » et « Préparer le CV » de mon appli de recherche d'emploi (message commençant par /dossier-candidature lettre, cv ou tout, suivi de l'offre), ou quand je dis « prépare ma candidature pour… ».
---

# Dossier de candidature (lettre de motivation, CV)

Tu tournes dans Claude sur mon abonnement : **aucune API payante n'est appelée**. Je lance souvent ce skill depuis mon téléphone, à partir de l'appli. Le message contient déjà l'offre :

```
/dossier-candidature lettre
Poste : Head of Product
Entreprise : Pigment
Lieu : Paris
Annonce : https://…
L'entreprise : …
Description : …
Fit :
+ …
Offre dans l'appli : 3f1c…-uuid
```

Premier mot après la commande : `lettre`, `cv` ou `tout` (les deux).

**Ce skill n'a besoin que de Google Drive.** Il ne lit ni n'écrit rien dans l'appli et ne demande ni adresse ni clé : ne me demande jamais de remplir un fichier de configuration.

## Prérequis

- Connecteur **Google Drive** actif (compte antoinedefontenay@gmail.com). Pour modifier un Google Doc, suis le skill `google-workspace`.
- Dossier `job` à la racine de mon Drive.
- **CV de référence** : le fichier le plus récent du dossier `job/cv`. Google Doc ou Word (.docx) : un .docx se copie en Google Doc pour être modifié. Si c'est un PDF ou s'il n'y a rien, arrête-toi et demande-moi d'y déposer une version modifiable. Ne fabrique jamais de CV à partir de rien.

## Étapes

1. **L'offre** : prends ce qui est dans le message. Si la description est tronquée (`…`) ou absente et que l'annonce s'ouvre sans connexion, lis l'annonce. Si le message ne contient qu'un nom d'offre, demande-moi le lien de l'annonce.

2. **Mon profil** : lis le CV de référence (`job/cv`). Si les fichiers du projet Claude contiennent mon profil, mes préférences ou mes stories (`cv.md`, `preferences.md`, `stories/…`), lis-les aussi : ils donnent les réalisations chiffrées pour la lettre.

3. **Dossier Drive** : `job/candidatures/<Entreprise> - <Poste>` (crée ce qui manque ; réutilise le dossier s'il existe). S'il contient déjà une lettre ou un CV, demande-moi si je veux une nouvelle version avant d'en créer une.

4. **Lettre de motivation** (si `lettre` ou `tout`) : un Google Doc `Lettre - <Entreprise> - <Poste>` dans ce dossier.
   - Langue de l'annonce (français ou anglais). 250 à 350 mots, quatre paragraphes : pourquoi cette entreprise (d'après l'annonce et ce qu'elle fait, de façon précise), ce que j'apporte sur 2 ou 3 exigences clés de l'annonce avec une réalisation chiffrée tirée de mon CV ou de mes stories, ma façon de travailler, conclusion et disponibilité.
   - Faits uniquement : aucun chiffre, employeur, diplôme ou réalisation qui ne soit pas dans mon CV ou mes stories. S'il manque une information, écris `[À COMPLÉTER : …]` dans le texte.
   - Pas de formules creuses (« passionné », « dynamique », « je me permets »), pas de répétition du CV ligne à ligne.

5. **CV** (si `cv` ou `tout`) : copie le CV de référence (en Google Doc) dans le dossier sous le nom `CV - <Prénom Nom> - <Entreprise>`, puis **remplace uniquement le titre** (la ligne d'accroche sous le nom) par l'intitulé du poste, adapté si besoin (ex. « Head of Product — Data & IA »). Ne touche à rien d'autre : ni expériences, ni compétences, ni mise en page.

6. **Réponds court** : les liens des documents, les `[À COMPLÉTER]` éventuels, et « Colle ces liens dans l'offre (Candidater › Liens des documents) ».

## Facultatif : enregistrer les liens dans l'appli

Seulement si `APP_URL` et `INGEST_KEY` sont **déjà** disponibles (variables d'environnement, ou `.jobhunt.env` du dossier de travail dans Claude Desktop), et que le message donne l'identifiant de l'offre :
```bash
curl -sS -X PATCH "$APP_URL/api/ingest/offers/<id>" -H "content-type: application/json" \
  -H "x-ingest-key: $INGEST_KEY" -d '{"cover_letter_url": "https://docs.google.com/document/d/…", "cv_url": "https://docs.google.com/document/d/…"}'
```
Sinon, ne cherche pas plus loin et ne demande rien : je colle les liens moi-même.

## Règles

- N'envoie rien à l'entreprise : pas d'e-mail, pas de formulaire, pas de candidature. Je relis et j'envoie moi-même.
- Ne modifie pas le CV de `job/cv`.
- Si une clé d'ingestion est disponible, elle n'apparaît jamais dans une réponse ni dans un document.
