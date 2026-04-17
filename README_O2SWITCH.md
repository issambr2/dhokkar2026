# 🚀 Guide de Déploiement Rentx sur o2switch (Débutant)

Ce guide vous explique pas à pas comment mettre votre application en ligne sur votre hébergement o2switch.

## Étape 1 : Préparer les fichiers
Avant d'envoyer les fichiers, vous devez générer la version "Web" de l'interface.
1. Ouvrez votre terminal (dans l'éditeur).
2. Tapez la commande suivante et appuyez sur Entrée :
   ```bash
   npm run build
   ```
3. Un dossier nommé `dist` va apparaître. C'est ce dossier qui contient votre application optimisée.

## Étape 2 : Télécharger les fichiers sur votre ordinateur
Vous devez récupérer les fichiers du projet pour les envoyer sur o2switch. Téléchargez les éléments suivants :
- Le dossier `dist` (complet)
- Le fichier `app.js`
- Le fichier `package.json`
- Le fichier `firebase-applet-config.json`

## Étape 3 : Envoyer les fichiers sur o2switch
1. Connectez-vous à votre **cPanel o2switch**.
2. Allez dans le **Gestionnaire de fichiers**.
3. Créez un nouveau dossier nommé `rentx` à la racine (pas dans public_html, mais à côté).
4. Entrez dans ce dossier et téléchargez-y les fichiers récupérés à l'étape 2.

## Étape 4 : Créer l'application Node.js
1. Dans le cPanel, cherchez l'outil **"Sélectionner une version de Node.js"**.
2. Cliquez sur **"Créer une application"**.
3. Remplissez les champs comme suit :
   - **Version de Node.js** : Choisissez la version `18` ou `20`.
   - **Mode d'application** : `Production`.
   - **Racine de l'application** : Tapez `rentx`.
   - **URL de l'application** : Choisissez votre domaine ou un sous-domaine (ex: `location.votre-site.com`).
   - **Fichier de démarrage de l'application** : Tapez `app.js`.
4. Cliquez sur le bouton **"Créer"** en haut à droite.

## Étape 5 : Installer les dépendances
1. Une fois l'application créée, vous verrez une section "Fichiers de configuration".
2. Cliquez sur le bouton **"Run NPM Install"**. 
   *Attendez quelques minutes, cela va installer tous les outils nécessaires (Express, Firebase, etc.).*

## Étape 6 : Configurer les variables (Important)
Dans la même page sur o2switch, cherchez la section **"Environment variables"** :
1. Cliquez sur **"Add Variable"**.
2. Ajoutez :
   - Nom : `NODE_ENV` / Valeur : `production`
3. Si vous avez d'autres clés (comme une clé API Gemini), ajoutez-les ici également.

## Étape 7 : Lancer l'application
1. Cliquez sur le bouton **"Restart"** en haut de la page.
2. Votre application est maintenant en ligne ! Visitez l'URL que vous avez choisie à l'étape 4.

---

### 💡 Notes importantes pour débutant :
- **Base de données** : Vous n'avez rien à faire pour la base de données sur o2switch, car tout est géré par **Firebase** (Google).
- **Mises à jour** : Si vous modifiez le code, vous devrez refaire le `npm run build` et renvoyer le dossier `dist` sur o2switch, puis cliquer sur "Restart".
- **Support** : Si vous voyez une erreur "503", c'est souvent que l'installation (NPM Install) n'est pas terminée ou que le fichier de démarrage est mal renseigné.

**Félicitations ! Votre agence de location est maintenant accessible partout dans le monde.**
