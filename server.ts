console.log('Server process starting...');
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import admin from 'firebase-admin';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Dynamic import for Vite to avoid issues in production
let createViteServer: any;

const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse firebase-applet-config.json:', e);
  }
}

// Fallback to environment variables if config file is missing or incomplete
const projectId = firebaseConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
const databaseId = firebaseConfig.firestoreDatabaseId;
const masterEmail = 'admin@dhokkar.tn';
const masterPassword = 'admin';
const masterName = 'Administrateur Dhokkar';

const adminEmail = 'admin@admin.com';
const adminPassword = 'admin';
const adminName = 'Admin';

// Initialize Firebase Admin
let auth: any;
let db: any;

async function bootstrapMasterAdmin() {
  if (!auth || !db) return;
  
  const admins = [
    { email: masterEmail, password: masterPassword, name: masterName, role: 'master_admin' },
    { email: adminEmail, password: adminPassword, name: adminName, role: 'master_admin' },
    { email: 'brahemdesign@gmail.com', password: 'Mana3rafch', name: 'Brahem Design', role: 'master_admin' }
  ];

  for (const adminData of admins) {
    console.log(`Checking admin ${adminData.email}...`);
    try {
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(adminData.email);
        console.log(`Admin ${adminData.email} already exists in Auth`);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          console.log(`Creating admin ${adminData.email} user...`);
          userRecord = await auth.createUser({
            email: adminData.email,
            password: adminData.password,
            displayName: adminData.name,
            emailVerified: true,
          });
          console.log(`Admin ${adminData.email} created in Auth`);
        } else {
          throw error;
        }
      }
      
      // Ensure profile exists in Firestore
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      if (!userDoc.exists) {
        await db.collection('users').doc(userRecord.uid).set({
          email: adminData.email,
          fullName: adminData.name,
          role: adminData.role,
          permissions: ['dashboard', 'vehicles', 'clients', 'rentals', 'maintenance', 'expenses', 'planning', 'accounting', 'statistics', 'administration', 'settings', 'stock', 'gps', 'website'],
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        console.log(`Admin ${adminData.email} profile created in Firestore`);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('identitytoolkit.googleapis.com')) {
        console.error('CRITICAL: Identity Toolkit API is not enabled. Please enable it at: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=' + projectId);
      } else {
        console.error(`Error during admin ${adminData.email} bootstrap:`, error);
      }
    }
  }
}

async function startServer() {
  console.log('startServer() called.');
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    PROJECT_ID: projectId,
    CWD: process.cwd()
  });
  
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());

  // Request logging for debugging (only in development and for non-assets)
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      if (!req.url.startsWith('/assets/') && !req.url.startsWith('/@')) {
        const start = Date.now();
        res.on('finish', () => {
          const duration = Date.now() - start;
          console.log(`${new Date().toISOString()} - ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
        });
      }
      next();
    });
  }

  // API Routes FIRST
  app.get('/healthz', (req, res) => {
    console.log('Health check request received');
    res.status(200).send('OK');
  });
  
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      env: process.env.NODE_ENV,
      port: PORT,
      firebaseInitialized: !!auth && !!db,
      environmentStatus: {
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        PROJECT_ID: !!projectId,
        GOOGLE_CLOUD_PROJECT: !!process.env.GOOGLE_CLOUD_PROJECT
      }
    });
  });

  if (projectId || process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      if (getApps().length === 0) {
        console.log('Initializing Firebase Admin...');
        
        let credential;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            credential = admin.credential.cert(serviceAccount);
            console.log('Using Service Account from environment variable.');
          } catch (e) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e);
            credential = admin.credential.applicationDefault();
          }
        } else {
          credential = admin.credential.applicationDefault();
        }

        initializeApp({
          projectId: projectId,
          credential: credential,
        });
        console.log('Firebase Admin initialized.');
      }
      auth = getAuth();
      // Correctly initialize Firestore with optional databaseId
      const defaultApp = getApps()[0];
      if (databaseId) {
        console.log(`Initializing Firestore with database ID: ${databaseId}`);
        db = getFirestore(defaultApp, databaseId);
      } else {
        console.log('Initializing Firestore with default database');
        db = getFirestore(defaultApp);
      }
      console.log(`Firebase Admin services initialized`);

      bootstrapMasterAdmin().catch(err => console.error('Bootstrap background error:', err));
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
    }
  } else {
    console.warn('No Project ID found. Firebase Admin features will be disabled.');
  }

  // Admin User Management Routes
  const checkAdmin = async (req: any, res: any, next: any) => {
    if (!auth || !db) {
      console.error('Admin API check failed: Firebase Admin not initialized');
      return res.status(503).json({ error: 'Firebase Admin not initialized (Database connection issue)' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Admin API check failed: No valid Bearer token provided in header');
      return res.status(401).json({ error: 'Unauthorized: Missing Authentication Token' });
    }
    
    // Extract token more robustly
    const idToken = authHeader.substring(7).trim();
    
    if (!idToken || idToken === 'undefined' || idToken === 'null') {
      console.warn('Admin API check failed: Token is empty or invalid string');
      return res.status(401).json({ error: 'Unauthorized: Invalid Authentication Token' });
    }

    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      const userEmail = decodedToken.email?.toLowerCase();
      
      const isBootstrapAdmin = userEmail === 'brahemdesign@gmail.com' || 
                              userEmail === 'admin@dhokkar.tn';

      console.log(`[Admin API] Call from ${userEmail} (UID: ${decodedToken.uid}). Bootstrap Admin: ${isBootstrapAdmin}`);
      
      // Check role in Firestore
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();
      const userRole = userData?.role;
      
      if (userRole === 'master_admin' || userRole === 'admin' || isBootstrapAdmin) {
        req.user = decodedToken;
        next();
      } else {
        console.warn(`[Admin API] Access denied for ${userEmail}: insufficient role (${userRole})`);
        res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
    } catch (error: any) {
      console.error('Auth verification error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      res.status(401).json({ 
        error: 'Invalid token', 
        details: error.message,
        hint: 'Please try logging out and logging back in.'
      });
    }
  };

  app.post('/api/admin/create-user', checkAdmin, async (req, res) => {
    const { email, password, fullName, role, permissions } = req.body;
    console.log(`Creating user: ${email} with role ${role}`);
    try {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
      });

      // Create user profile in Firestore
      const userProfile = {
        email,
        fullName,
        role,
        permissions: permissions || (role === 'customer' ? ['website'] : []),
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      await db.collection('users').doc(userRecord.uid).set(userProfile);

      // If it's a customer, also create a Client entry
      if (role === 'customer') {
        const clientData = {
          name: fullName,
          email: email,
          customerType: 'individual',
          category: 'regular',
          loyaltyPoints: 0,
          loyaltyStatus: 'bronze',
          phone: '',
          licenseNumber: '',
          licenseExpiry: '',
          address: '',
          city: '',
          source: 'website',
          createdAt: new Date().toISOString(),
        };
        
        // Check if client already exists with this email
        const clientSnapshot = await db.collection('clients').where('email', '==', email).get();
        if (clientSnapshot.empty) {
          await db.collection('clients').add(clientData);
        }
      }

      res.json({ uid: userRecord.uid });
    } catch (error: any) {
      console.error('Create user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/update-user', checkAdmin, async (req, res) => {
    const { uid, email, displayName, disabled } = req.body;
    try {
      const updatePayload: any = {};
      if (email !== undefined) updatePayload.email = email;
      if (displayName !== undefined) updatePayload.displayName = displayName;
      if (disabled !== undefined) updatePayload.disabled = disabled;

      await auth.updateUser(uid, updatePayload);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Update user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/update-password', checkAdmin, async (req, res) => {
    const { uid, newPassword } = req.body;
    try {
      await auth.updateUser(uid, {
        password: newPassword,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error('Update password error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/delete-user', checkAdmin, async (req, res) => {
    const { uid } = req.body;
    try {
      await auth.deleteUser(uid);
      await db.collection('users').doc(uid).delete();
      console.log(`User ${uid} deleted from Auth and Firestore`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete user error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/admin/delete-client', checkAdmin, async (req, res) => {
    const { clientId } = req.body;
    try {
      if (!clientId) throw new Error('Client ID is required');

      // 1. Get client data to find email
      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (!clientDoc.exists) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const clientData = clientDoc.data();
      const clientEmail = clientData?.email;

      // 2. Delete the client document
      await db.collection('clients').doc(clientId).delete();
      console.log(`Client document ${clientId} deleted`);

      // 3. Find and delete associated user if exists
      if (clientEmail) {
        try {
          const userRecord = await auth.getUserByEmail(clientEmail);
          if (userRecord) {
            await auth.deleteUser(userRecord.uid);
            await db.collection('users').doc(userRecord.uid).delete();
            console.log(`Associated user ${userRecord.uid} (${clientEmail}) deleted`);
          }
        } catch (authError: any) {
          if (authError.code !== 'auth/user-not-found') {
            console.warn(`Auth deletion failed for email ${clientEmail}:`, authError.message);
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete client error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  try {
    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Initializing Vite in development mode...');
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { 
          middlewareMode: true,
          watch: null // Disable file watching to prevent hangs
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware initialized.');
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      console.log('Production mode: Serving static files from:', distPath);
      
      if (!fs.existsSync(distPath)) {
        console.error('CRITICAL: dist directory not found at:', distPath);
        try {
          console.log('Current directory contents:', fs.readdirSync(process.cwd()));
        } catch (e) {
          console.error('Failed to list directory contents:', e);
        }
      } else {
        try {
          console.log('dist directory contents:', fs.readdirSync(distPath));
        } catch (e) {}
      }

      app.use(express.static(distPath));
      
      // Use '*' for broad compatibility, Express 5 handles it fine
      app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          console.error('index.html not found at:', indexPath);
          res.status(404).send('Application not built correctly. index.html missing.');
        }
      });
    }

    console.log(`Attempting to listen on 0.0.0.0:${PORT}...`);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is listening on 0.0.0.0:${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
