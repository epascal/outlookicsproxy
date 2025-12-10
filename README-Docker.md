# ICS Patch - Docker Swarm Deployment

Serveur proxy Express en TypeScript pour corriger les fuseaux horaires dans les fichiers ICS (calendrier).

## 🚀 Déploiement rapide avec Docker Swarm

### Prérequis

- Docker avec Docker Swarm activé
- Portainer (optionnel, pour l'interface graphique)

### Déploiement automatique

```bash
# Cloner le projet
git clone <votre-repo>
cd icspatch

# Construire l'image
./build.sh

# Déployer automatiquement
./deploy.sh --no-build
```

### Déploiement manuel

```bash
# 1. Construire l'image
./build.sh icspatch:latest

# 2. Déployer le stack
docker stack deploy -c docker-compose.yml icspatch

# 3. Vérifier le déploiement
docker service ls
```

### Développement local

```bash
# Utiliser docker-compose.dev.yml pour le développement
docker-compose -f docker-compose.dev.yml up --build
```

## ⚙️ Configuration

### Variables d'environnement

Copiez `env.example` vers `.env` et ajustez :

```bash
cp env.example .env
```

Variables principales :
- `SOURCE_ICS_URL` : URL du calendrier ICS source (obligatoire)
- `TARGET_TZ` : Fuseau horaire cible (défaut: Europe/Zurich)
- `PORT` : Port du serveur (défaut: 3003)

### Configuration dans Portainer

1. Allez dans **Stacks** > **Add stack**
2. Nom : `icspatch`
3. Copiez le contenu de `docker-compose.yml`
4. Ajustez les variables d'environnement dans l'onglet **Environment**
5. Déployez

## 🔧 Caractéristiques techniques

- **Node.js 22.20.0** avec support natif TypeScript
- **Multi-stage build** pour optimiser la taille de l'image
- **Utilisateur non-root** pour la sécurité
- **Health checks** intégrés
- **Logs structurés** avec rotation
- **Ressources limitées** (CPU: 0.5, RAM: 512M)

## 📊 Monitoring

### Commandes utiles

```bash
# Voir les logs en temps réel
docker service logs -f icspatch_icspatch

# Voir le statut du service
docker service ps icspatch_icspatch

# Voir les métriques
docker stats $(docker ps -q --filter name=icspatch)

# Redémarrer le service
docker service update --force icspatch_icspatch
```

### Health Check

Le service expose un endpoint de santé sur `/calendar.ics` qui vérifie :
- Disponibilité du service
- Connexion à l'URL source
- Transformation des données ICS

## 🌐 Utilisation

Une fois déployé, le service est accessible sur :

```
http://localhost:3003/calendar.ics
```

### Paramètres de requête

- `url` : URL du calendrier ICS (si différent de SOURCE_ICS_URL)
- `tz` : Fuseau horaire cible (si différent de TARGET_TZ)
- `override` : Forcer la conversion des fuseaux existants (1/0)

Exemple :
```
http://localhost:3003/calendar.ics?tz=Europe/Paris&override=1
```

## 🔄 Mise à jour

```bash
# Reconstruire l'image
./build.sh icspatch:latest

# Redéployer sans rebuild
./deploy.sh icspatch --no-build

# Ou manuellement
docker build -t icspatch:latest .
docker service update --image icspatch:latest icspatch_icspatch
```

## 🗑️ Suppression

```bash
# Supprimer le stack complet
docker stack rm icspatch

# Supprimer l'image
docker rmi icspatch:latest
```

## 🐛 Dépannage

### Service ne démarre pas

```bash
# Vérifier les logs
docker service logs icspatch_icspatch

# Vérifier la configuration
docker service inspect icspatch_icspatch
```

### Problèmes de réseau

```bash
# Vérifier le réseau overlay
docker network ls
docker network inspect icspatch_icspatch-network
```

### Problèmes de ressources

```bash
# Vérifier l'utilisation des ressources
docker stats
docker node ls
```

## 📝 Notes importantes

### Docker Swarm vs Docker Compose

- **`docker-compose.yml`** : Pour Docker Swarm (production) - **ne peut pas faire de build**
- **`docker-compose.dev.yml`** : Pour le développement local - **peut faire du build**

### Workflow recommandé

1. **Développement** : Utilisez `docker-compose.dev.yml`
2. **Build** : Utilisez `./build.sh` pour créer l'image
3. **Déploiement** : Utilisez `./deploy.sh --no-build` pour déployer sur Swarm

### Caractéristiques techniques

- Le service utilise Node.js 22.20.0 qui supporte TypeScript nativement
- Les fichiers ICS sont mis en cache pendant 10 minutes
- CORS est activé pour toutes les origines
- Le service ajoute automatiquement des blocs VTIMEZONE compatibles Google Calendar
