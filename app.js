import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser le JSON
app.use(express.json());

// Servir les fichiers statiques du dossier 'dist'
const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    
    // Gérer toutes les routes pour le SPA (Single Page Application)
    app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Dossier dist trouvé mais index.html manquant. Veuillez lancer "npm run build".');
        }
    });
} else {
    app.get('*', (req, res) => {
        res.status(404).send('Dossier "dist" non trouvé. Veuillez lancer "npm run build" avant de démarrer le serveur.');
    });
}

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`Chemin des fichiers statiques : ${distPath}`);
});
