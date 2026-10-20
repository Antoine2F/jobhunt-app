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

Même configuration que le skill `veille-offres` : le dossier de travail est mon clone local de `jobhunt-knowledge`, qui contient `.jobhunt.env` (`APP_URL`, `INGEST_KEY`). Le profil se lit dans `profil/` de ce même dossier.

## Étapes

1. **Lis mon profil** : `profil/preferences.md`, `skills.md` et `cv.md`. C'est la référence pour noter les offres.
2. **Ouvre LinkedIn** > Emplois > « Mes alertes emploi » (ou les recherches sauvegardées), une alerte à la fois, triées par « Plus récentes ».
3. Pour chaque offre de la liste (panneau de droite) relève : intitulé, entreprise, lieu, type de contrat et salaire s'ils sont affichés, URL (`https://www.linkedin.com/jobs/view/<id>/`), et 2 ou 3 phrases de description.
4. **Note** chaque offre (`score` de 0 à 100, `score_reason` et `score_details`) selon la **grille de notation du skill `veille-offres`** : le résumé commence toujours par le salaire (ou `no €`), la nationalité de l'entreprise et B2B/B2C ; un point par ligne préfixé `+`, `~`, `-` ou `•`.
4 bis. **Pour les offres d'au moins 50**, complète l'entreprise dans `company_info` en suivant le skill **`fiche-entreprise`** (une seule recherche par entreprise ; demande d'abord `GET $APP_URL/api/ingest/companies` et ne cherche que les champs encore vides). Une entreprise classée `ESN / Conseil IT` fait retomber l'offre à 20 au plus.
5. **Envoie** le lot à l'appli (doublons ignorés automatiquement) :

```bash
source .jobhunt.env
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
      "score_reason": "…",
      "score_details": "…",
      "company_info": { "description": "…", "sector": "Software / SaaS", "size": "450 salariés",
                        "headquarters": "Paris, France", "dev_offices": "Paris", "founders_nationality": "Française",
                        "capital_origin": "VC français (Eurazeo)", "funding": "Série B, 2025" }
    }
  ]
}
```

Si aucun terminal n'est disponible, ouvre l'appli (`$APP_URL/offres`) et utilise « + Ajouter une offre » en collant le texte de chaque offre retenue (score ≥ 60).

6. **Résume** : nombre d'offres vues, envoyées, doublons (réponse `{"created": n, "duplicates": m}`), et les 3 meilleures avec leur score.
