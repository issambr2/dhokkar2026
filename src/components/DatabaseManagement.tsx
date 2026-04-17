import React, { useState } from 'react';
import { Database, Download, Upload, Trash2, AlertTriangle, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logActivity } from '../services/logService';
import { clsx } from 'clsx';
import { UserProfile } from '../types';

const COLLECTIONS_FOR_EXPORT = [
  'vehicles',
  'clients',
  'rentals',
  'maintenances',
  'expenses',
  'activity_logs',
  'notifications',
  'workers',
  'attendance',
  'salaryTransactions',
  'salaryAdvances',
  'salaryPayments',
  'promotions',
  'leasings',
  'stocks',
  'offices',
  'settings'
];

const COLLECTIONS_FOR_RESET = [
  'vehicles',
  'clients',
  'rentals',
  'maintenances',
  'expenses',
  'activity_logs',
  'notifications',
  'workers',
  'attendance',
  'salaryTransactions',
  'salaryAdvances',
  'salaryPayments',
  'promotions',
  'leasings',
  'stocks'
];

interface DatabaseManagementProps {
  profile: UserProfile | null;
}

export function DatabaseManagement({ profile }: DatabaseManagementProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const backupData: Record<string, any[]> = {};
      
      for (const colName of COLLECTIONS_FOR_EXPORT) {
        if (colName === 'settings') {
          try {
            const settingsSnap = await getDoc(doc(db, 'settings', 'system'));
            if (settingsSnap.exists()) {
              backupData[colName] = [{ id: 'system', ...settingsSnap.data() }];
            }
          } catch (e) {
            console.warn('Skipping settings export due to permissions or missing doc');
          }
          continue;
        }

        try {
          const snapshot = await getDocs(collection(db, colName));
          backupData[colName] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        } catch (e) {
          console.warn(`Skipping export for ${colName}:`, e);
        }
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dhokkar_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus({ type: 'success', message: 'Sauvegarde exportée avec succès.' });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_export', 'Exportation complète de la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Export error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de l\'exportation.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStatus(null);
    try {
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const backupData = JSON.parse(content);
      let importedCount = 0;
      
      for (const colName of COLLECTIONS_FOR_EXPORT) {
        if (backupData[colName] && Array.isArray(backupData[colName])) {
          const items = backupData[colName];
          // Process in chunks of 500 for Firebase batch limits
          for (let i = 0; i < items.length; i += 500) {
            const chunk = items.slice(i, i + 500);
            const batch = writeBatch(db);
            
            chunk.forEach((item: any) => {
              const { id, ...data } = item;
              if (id) {
                const docRef = doc(db, colName, id);
                batch.set(docRef, data);
                importedCount++;
              }
            });
            
            await batch.commit();
          }
        }
      }

      setStatus({ type: 'success', message: `${importedCount} enregistrements importés avec succès.` });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_import', 'Importation de données dans la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Import error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de l\'importation. Vérifiez le format du fichier.' });
    } finally {
      setIsImporting(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setStatus(null);
    try {
      let deletedCount = 0;
      for (const colName of COLLECTIONS_FOR_RESET) {
        const snapshot = await getDocs(collection(db, colName));
        const docs = snapshot.docs;
        deletedCount += docs.length;
        
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      }

      setStatus({ type: 'success', message: `Base de données réinitialisée. ${deletedCount} documents supprimés.` });
      setShowConfirmReset(false);
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_reset', 'Réinitialisation complète de la base de données', profile?.fullName);
      }
    } catch (error) {
      console.error('Reset error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de la réinitialisation.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleRepair = async () => {
    setIsRepairing(true);
    setStatus(null);
    try {
      // 1. Ensure default offices exist
      const officeList = [
        { id: 'bureau-chedli', name: 'Bureau Chedli', isActive: true, createdAt: new Date().toISOString() },
        { id: 'bureau-aymen', name: 'Bureau Aymen', isActive: true, createdAt: new Date().toISOString() }
      ];

      for (const office of officeList) {
        const officeRef = doc(db, 'offices', office.id);
        const officeSnap = await getDoc(officeRef);
        if (!officeSnap.exists()) {
          await setDoc(officeRef, office);
        }
      }

      // 2. Ensure system settings exist
      const settingsRef = doc(db, 'settings', 'system');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          agencyName: 'Dhokkar Rent a Car',
          agencyAddress: 'Rue Taieb Hachicha M\'saken A côté café Vegas',
          agencyPhone: '24621605 | 53666895',
          agencyEmail: 'dhokkarlocation2016@gmail.com',
          agencyMF: '114739OR/A/M 000',
          currency: 'TND',
          taxRate: 19,
          warningPeriod: 15,
          chauffeurPrice: 50,
          rentalTerms: 'Conditions par défaut...'
        });
      }

      // 3. Ensure bootstrap admins have correct profiles in Firestore
      const bootstrapAdmins = [
        { email: 'brahemdesign@gmail.com', name: 'Brahem Design', role: 'master_admin' },
        { email: 'admin@dhokkar.tn', name: 'Admin Dhokkar', role: 'admin' }
      ];

      const usersSnap = await getDocs(collection(db, 'users'));
      for (const admin of bootstrapAdmins) {
        const existingUser = usersSnap.docs.find(d => d.data().email?.toLowerCase() === admin.email.toLowerCase());
        if (existingUser) {
          await updateDoc(doc(db, 'users', existingUser.id), { role: admin.role, isActive: true });
        }
      }

      setStatus({ type: 'success', message: 'Système réparé : Paramètres, Bureaux et Permissions Administrateur restaurés.' });
      if (auth.currentUser) {
        await logActivity(auth.currentUser.uid, 'database_repair', 'Réparation du système effectuée', profile?.fullName);
      }
    } catch (error) {
      console.error('Repair error:', error);
      setStatus({ type: 'error', message: 'Erreur lors de la réparation.' });
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-8 border border-stone-200 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-red-50 rounded-2xl">
            <Database className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">Maintenance & Sauvegarde</h3>
            <p className="text-stone-500 text-sm italic">Outils critiques pour la gestion de l'intégrité des données.</p>
          </div>
        </div>

        {status && (
          <div className={clsx(
            "mb-8 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
            status.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
          )}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="text-sm font-medium">{status.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Export Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-emerald-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Download className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Sauvegarde</h4>
            <p className="text-xs text-stone-500 mb-6">Téléchargez une copie complète de toutes vos données au format JSON.</p>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full py-3 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exporter JSON
            </button>
          </div>

          {/* Import Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-blue-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Restauration</h4>
            <p className="text-xs text-stone-500 mb-6">Importez des données à partir d'un fichier de sauvegarde précédemment exporté.</p>
            <label className="w-full py-3 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importer JSON
              <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
            </label>
          </div>

          {/* Repair Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-amber-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Wrench className="w-5 h-5 text-amber-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Réparation</h4>
            <p className="text-xs text-stone-500 mb-6">Restaure les bureaux par défaut et les paramètres système si manquants.</p>
            <button
              onClick={handleRepair}
              disabled={isRepairing}
              className="w-full py-3 bg-white border border-stone-200 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-50 hover:border-amber-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isRepairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
              Réparer Système
            </button>
          </div>

          {/* Reset Card */}
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 hover:border-red-200 transition-all group">
            <div className="p-3 bg-white rounded-xl w-fit mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <h4 className="font-bold text-stone-900 mb-2">Réinitialisation</h4>
            <p className="text-xs text-stone-500 mb-6">Supprimez définitivement toutes les données (véhicules, clients, locations, etc.).</p>
            <button
              onClick={() => setShowConfirmReset(true)}
              className="w-full py-3 bg-white border border-stone-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Tout Supprimer
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 text-red-600">
              <div className="p-3 bg-red-50 rounded-2xl">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Action Critique</h3>
            </div>
            
            <p className="text-stone-600 mb-8 leading-relaxed">
              Êtes-vous absolument sûr de vouloir <span className="font-bold text-red-600 underline">supprimer toutes les données</span> ? 
              Cette action est irréversible et effacera tous les véhicules, clients, locations et historiques.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="flex-1 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
