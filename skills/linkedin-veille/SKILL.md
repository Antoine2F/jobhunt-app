---
name: linkedin-veille
description: Parcourt les offres LinkedIn de mes recherches sauvegardées dans mon navigateur (computer use, à la demande, sous ma supervision), les note par rapport à mon profil et les enregistre dans mon appli de recherche d'emploi comme offres « à valider ». À utiliser quand je dis « fais la veille LinkedIn », « regarde les nouvelles offres LinkedIn » ou « /linkedin-veille ».
---

# Veille LinkedIn (computer use)

Tu travailles dans **mon** navigateur, avec **ma** session LinkedIn déjà ouverte, pendant que je regarde. Ce n'est pas un robot : LinkedIn interdit l'extraction automatisée, donc on reste sur un usage humain.

## Règles

- **Lecture seule sur LinkedIn.** Ne clique jamais sur « Postuler », « Candidature simplifiée », « Suivre », « Se connecter avec », n'envoie aucun message, ne modifie aucun paramètre ni alerte.
- **Volume raisonnable** : au maximum 30 offres par session, en faisant défiler normalement. Pas d'ouverture d'onglets en rafale.
- Si LinkedIn affiche un captcha, une vérification de sécurité ou une demande de connexion : **arrête-toi** et préviens-moi.
- N'entre jamais de mot de passe.

## Configuration

Lis `~/.jobhunt.env` (ou demande-moi les valeurs si le fichier n'existe pas) :

```
APP_URL=https://<mon-appli>.azurestaticapps.net
INGEST_KEY=<clé d'ingestion>
KNOWLEDGE_DIR=~/jobhunt-knowledge   # clone local de la base de connaissance
```

## Étapes

1. **Lis mon profil** : `$KNOWLEDGE_DIR/profil/preferences.md`, `skills.md` et `cv.md`. C'est la référence pour noter les offres.
2. **Ouvre LinkedIn** > Emplois > « Mes alertes emploi » (ou les recherches sauvegardées), une alerte à la fois, triées par « Plus récentes ».
3. Pour chaque offre de la liste (panneau de droite) relève : intitulé, entreprise, lieu, type de contrat et salaire s'ils sont affichés, URL (`https://www.linkedin.com/jobs/view/<id>/`), et 2 ou 3 phrases de description.
4. **Note** chaque offre de 0 à 100 par rapport au profil, avec une ligne de justification (`score_reason`). Pénalise fortement ce qui figure dans « ce que je ne cherche pas ».
5. **Envoie** le lot à l'appli (doublons ignorés automatiquement) :

```bash
curl -sS -X POST "$APP_URL/api/ingest" \
  -H "content-type: application/json" -H "x-ingest-key: $INGEST_KEY" \
  -d @/tmp/linkedin-offres.json
```

Format de `/tmp/linkedin-offres.json` :

```json
{
  "source": "linkedin",
  "source_detail": "Veille LinkedIn (computer use)",
  "offers": [
    {
      "title": "Head of Data",
      "company": "Entreprise",
      "location": "Paris",
      "contract": "CDI",
      "salary": null,
      "url": "https://www.linkedin.com/jobs/view/1234567890/",
      "description": "…",
      "score": 82,
      "score_reason": "…"
    }
  ]
}
```

Si aucun terminal n'est disponible, ouvre l'appli (`$APP_URL/offres`) et utilise « + Ajouter une offre » en collant le texte de chaque offre retenue (score ≥ 60).

6. **Résume** : nombre d'offres vues, envoyées, doublons (réponse `{"created": n, "duplicates": m}`), et les 3 meilleures avec leur score.
