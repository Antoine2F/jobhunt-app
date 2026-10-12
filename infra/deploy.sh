#!/usr/bin/env bash
# Crée (ou met à jour) l'infrastructure Azure et configure l'appli.
# Prérequis : Azure CLI connecté (`az login`), Node 20+, `npm ci` fait à la racine.
#
# Variables attendues (ou demandées à l'exécution) :
#   SQL_ADMIN_PASSWORD   mot de passe administrateur SQL (12+ caractères, majuscules, chiffres, symboles)
#   ALLOWED_USERS        identifiant(s) GitHub autorisé(s) à se connecter, ex. "Antoine2F"
#   ANTHROPIC_API_KEY    clé API Claude (console.anthropic.com)
#   KNOWLEDGE_REPO       ex. "Antoine2F/jobhunt-knowledge"
#   KNOWLEDGE_TOKEN      jeton GitHub à grain fin, lecture seule sur KNOWLEDGE_REPO
#   BUDGET_EUR           alerte budget mensuelle (5 par défaut)
#   ALERT_EMAIL          adresse qui reçoit l'alerte budget
set -euo pipefail
cd "$(dirname "$0")/.."

RG="${RG:-rg-jobhunt}"
LOCATION="${LOCATION:-westeurope}"

ask() { local v="$1"; if [ -z "${!v:-}" ]; then read -rsp "$v : " "$v"; echo; export "$v"; fi; }
ask SQL_ADMIN_PASSWORD
ask ALLOWED_USERS
ask ANTHROPIC_API_KEY
ask KNOWLEDGE_REPO
ask KNOWLEDGE_TOKEN
ask ALERT_EMAIL

echo "== Abonnement utilisé"
az account show --query "{nom:name, id:id, offre:user.name}" -o table

echo "== Groupe de ressources $RG"
az group create -n "$RG" -l "$LOCATION" -o none

echo "== Déploiement Bicep"
OUT=$(az deployment group create -g "$RG" -f infra/main.bicep \
  -p sqlAdminPassword="$SQL_ADMIN_PASSWORD" --query properties.outputs -o json)
SWA=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).swaName.value')
HOST=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).swaHostname.value')
SQLFQDN=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).sqlServerFqdn.value')
SQLNAME=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).sqlServerName.value')

CS="Server=tcp:${SQLFQDN},1433;Database=jobhunt;User Id=jobhuntadmin;Password=${SQL_ADMIN_PASSWORD};Encrypt=true;Connection Timeout=60"
INGEST_KEY="${INGEST_KEY:-$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')}"

echo "== Schéma SQL (règle de pare-feu temporaire pour ton IP)"
MYIP=$(curl -s https://api.ipify.org)
az sql server firewall-rule create -g "$RG" -s "$SQLNAME" -n deploy-tmp --start-ip-address "$MYIP" --end-ip-address "$MYIP" -o none
SQL_CONNECTION_STRING="$CS" npx tsx scripts/migrate.ts
az sql server firewall-rule delete -g "$RG" -s "$SQLNAME" -n deploy-tmp -o none

echo "== Paramètres de l'appli"
az staticwebapp appsettings set -n "$SWA" -g "$RG" -o none --setting-names \
  "SQL_CONNECTION_STRING=$CS" \
  "ALLOWED_USERS=$ALLOWED_USERS" \
  "INGEST_KEY=$INGEST_KEY" \
  "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
  "KNOWLEDGE_REPO=$KNOWLEDGE_REPO" \
  "KNOWLEDGE_TOKEN=$KNOWLEDGE_TOKEN"

echo "== Alerte budget (${BUDGET_EUR:-5} €/mois)"
SUB=$(az account show --query id -o tsv)
az consumption budget create-with-rg -g "$RG" --budget-name jobhunt-budget \
  --amount "${BUDGET_EUR:-5}" --time-grain Monthly --category Cost \
  --start-date "$(date +%Y-%m-01)" --end-date "$(date -d '+3 years' +%Y-%m-01 2>/dev/null || date -v+3y +%Y-%m-01)" \
  --notifications "{\"actual80\":{\"enabled\":true,\"operator\":\"GreaterThanOrEqualTo\",\"threshold\":80,\"contactEmails\":[\"$ALERT_EMAIL\"]}}" \
  -o none 2>/dev/null || echo "   (budget non créé automatiquement : crée-le dans Cost Management > Budgets, abonnement $SUB)"

TOKEN=$(az staticwebapp secrets list -n "$SWA" -g "$RG" --query properties.apiKey -o tsv)

cat <<EOF

Terminé.

  Appli :                  https://$HOST
  Secrets GitHub à créer dans le dépôt jobhunt-app (Settings > Secrets and variables > Actions) :
    AZURE_STATIC_WEB_APPS_API_TOKEN = $TOKEN
    APP_URL                         = https://$HOST
    INGEST_KEY                      = $INGEST_KEY
    ANTHROPIC_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, KNOWLEDGE_TOKEN (voir README)

Garde INGEST_KEY : le skill Claude « veille LinkedIn » en a besoin aussi.
EOF
