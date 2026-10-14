---
name: fiche-entreprise
description: Complète la fiche d'une entreprise dans mon appli de recherche d'emploi — ce qu'elle fait, secteur, effectif, siège (pays), bureaux des équipes produit/tech, nationalité des fondateurs, origine des capitaux, financement, site — à partir de sources publiques, sans rien inventer. Seul endroit où sont décrites ces règles : les skills veille-offres, linkedin-veille et nouvelle-offre-jobhunt s'en servent. À utiliser quand je dis « fais la fiche de <entreprise> », « complète les fiches entreprises », « /fiche-entreprise ».
---

# Fiche entreprise

Tu tournes dans Claude sur mon abonnement : **aucune API payante n'est appelée**. Tu cherches des informations publiques sur une entreprise et tu les ranges dans les champs de l'appli. Le but : que je puisse décider d'une offre sans refaire la recherche.

## Deux façons d'être utilisé

- **Appelé par un autre skill** (`veille-offres`, `linkedin-veille`, `nouvelle-offre-jobhunt`) : tu produis seulement l'objet `company_info` décrit plus bas, pour l'entreprise demandée. C'est le skill appelant qui l'envoie avec l'offre ; tu n'écris rien toi-même.
- **Seul**, quand je te le demande : pour une entreprise nommée, ou pour toutes les entreprises qui ont des offres et des champs vides. Tu cherches, tu me montres le tableau, puis tu écris dans l'appli (étapes plus bas).

## Les champs

| Champ | Contenu | Exemple |
|---|---|---|
| `description` | Ce que fait l'entreprise, pour qui, 1 ou 2 phrases factuelles | « Logiciel de planification financière pour les directions financières des ETI et grands groupes. » |
| `sector` | **Une** valeur de la liste ci-dessous, écrite à l'identique | `Software / SaaS` |
| `size` | Effectif, avec l'année si la source est datée | « 450 salariés (2026) » |
| `headquarters` | Siège : ville, pays | « Paris, France » |
| `dev_offices` | Où travaillent les équipes produit et tech (villes, pays) | « Paris, Lisbonne, Bangalore » |
| `founders_nationality` | Nationalité des fondateurs | « Française » ; « Franco-américaine (2 Français, 1 Américain) » |
| `capital_origin` | Qui détient ou contrôle le capital, et d'où viennent les investisseurs | « VC US majoritaires (Sequoia, Index) ; fondateurs ~30 % » ; « Filiale du groupe allemand SAP » ; « Cotée (Euronext Paris) » |
| `funding` | Stade et dernière levée | « Série C, 100 M$, 2025 » ; « Rentable, non levée » |
| `website` | Site officiel | `https://…` |

### Secteurs (liste fermée)

`Software / SaaS` · `Data / IA` · `Cybersécurité` · `ESN / Conseil IT` · `Conseil` · `Fintech / Banque / Assurance` · `Santé` · `RH` · `E-commerce / Retail` · `Industrie` · `Énergie / Climat` · `Mobilité / Transport` · `Médias / Divertissement` · `Marketing / Publicité` · `Éducation` · `Immobilier` · `Secteur public` · `Autre`

Prends le secteur de ce que l'entreprise **vend**, pas de ses clients : un éditeur de logiciel RH, c'est `RH` s'il ne vend qu'aux RH, `Software / SaaS` s'il est généraliste ; un éditeur pour l'hôpital, c'est `Santé`. Une société qui vend surtout des jours-homme ou de la régie (ESN, SSII, cabinet d'ingénierie, portage), c'est **toujours** `ESN / Conseil IT`, même si elle se présente comme « tech » ou « conseil ». C'est un point non négociable de mon profil : signale-le clairement.

## Sources

Dans cet ordre, et une seule recherche par entreprise :
1. site de l'entreprise : « À propos », page carrière (les lieux des offres tech donnent `dev_offices`), blog d'ingénierie ;
2. page entreprise LinkedIn (effectif, siège, lieux), en lecture seule ;
3. registres français pour une société française : Pappers ou Societe.com (siège, effectif, actionnaires, groupe) ;
4. presse : annonces de levée (Maddyness, Les Echos, BFM, TechCrunch), communiqués ; Crunchbase ou Dealroom pour les pages publiques.

Pour `founders_nationality` : biographies des fondateurs (page « Équipe », LinkedIn, articles). Pour `capital_origin` : liste des investisseurs des dernières levées, actionnaire majoritaire, groupe de rattachement, cotation ; donne le pays des principaux investisseurs.

**N'invente rien.** Une information introuvable, contradictoire ou trop ancienne (plus de 3 ans pour l'effectif et le capital) : omets le champ. N'envoie jamais `null` ni « inconnu ». Si tu déduis quelque chose plutôt que de le lire (ex. nationalité d'après le parcours scolaire), dis-le dans ta réponse et n'envoie pas le champ.

## Utilisé seul : étapes

1. **Adresse de l'appli et clé** : récupère `APP_URL` et `INGEST_KEY` comme dans `nouvelle-offre-jobhunt` (variables d'environnement, `.jobhunt.env` du dossier de travail, `config.env` à côté de ce skill, fichiers du projet, sinon demande-les-moi). Ne recopie jamais la clé.
2. **Liste des entreprises** :
   ```bash
   curl -sS "$APP_URL/api/ingest/companies" -H "x-ingest-key: $INGEST_KEY"
   ```
   → `{"companies": [{"id", "name", "description", "sector", "size", "headquarters", "dev_offices", "founders_nationality", "capital_origin", "funding", "website", "offers"}]}`
   Garde l'entreprise que j'ai nommée, ou sinon celles qui ont au moins une offre (`offers > 0`) et au moins un champ vide. Au-delà de 10, traite les 10 premières et propose de continuer.
   Si l'appli renvoie 500, 502 ou 504 au premier appel, la base gratuite redémarre : attends 60 secondes et réessaie.
3. **Cherche** les champs vides de chaque entreprise (pas ceux déjà remplis).
4. **Montre-moi un tableau**, une entreprise par ligne, avec les champs trouvés et la source de chacun, et signale les ESN. Attends mon accord.
5. **Écris** chaque fiche :
   ```bash
   curl -sS -X PATCH "$APP_URL/api/ingest/companies/<id>" -H "content-type: application/json" \
     -H "x-ingest-key: $INGEST_KEY" -d '{"sector": "Software / SaaS", "dev_offices": "Paris, Lisbonne"}'
   ```
   Seuls les champs vides sont remplis : ce que j'ai saisi n'est jamais écrasé. Pour corriger une valeur existante, ajoute `"overwrite": true`, **uniquement** si je te l'ai demandé pour ce champ.
6. **Résume** : fiches complétées, champs restés vides et pourquoi.

## Règles

- Lecture seule sur tous les sites consultés : aucune inscription, aucun formulaire, aucun message.
- Pas de données personnelles au-delà du nom et du rôle des fondateurs, et elles ne vont pas dans l'appli.
