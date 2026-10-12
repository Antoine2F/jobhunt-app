// Infrastructure Azure de l'appli de recherche d'emploi.
//  - Static Web App (offre gratuite) : site web + API (fonctions gérées)
//  - Azure SQL Database serverless avec l'offre gratuite (100 000 vCore-secondes
//    et 32 Go par mois) ; mise en pause automatique quand le quota est atteint,
//    donc jamais facturée.

@description('Région du site (Static Web Apps n\'existe que dans quelques régions).')
param swaLocation string = 'westeurope'

@description('Région de la base SQL.')
param sqlLocation string = 'francecentral'

@description('Préfixe des noms de ressources (minuscules, sans espace).')
param prefix string = 'jobhunt'

@description('Identifiant administrateur SQL.')
param sqlAdminLogin string = 'jobhuntadmin'

@secure()
@description('Mot de passe administrateur SQL.')
param sqlAdminPassword string

var suffix = uniqueString(resourceGroup().id)

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${prefix}-web-${suffix}'
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Déploiement par GitHub Actions avec un jeton, sans lien direct au dépôt.
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Disabled'
  }
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${prefix}-sql-${suffix}'
  location: sqlLocation
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// Autorise les services Azure (dont les fonctions de la Static Web App).
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource db 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: 'jobhunt'
  location: sqlLocation
  sku: {
    name: 'GP_S_Gen5_2'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    autoPauseDelay: 60
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368
    requestedBackupStorageRedundancy: 'Local'
  }
}

output swaName string = swa.name
output swaHostname string = swa.properties.defaultHostname
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlServerName string = sqlServer.name
output databaseName string = db.name
