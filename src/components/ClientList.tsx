import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Client, Rental } from '../types';
import { Plus, Search, Trash2, Edit2, X, User, Phone, Mail, CreditCard, Image as ImageIcon, Printer, ShieldAlert, ShieldCheck, Ban, AlertTriangle, Clock, Award, Star, Download, FileSpreadsheet, Globe, Info } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useLanguage } from '../contexts/LanguageContext';
import { clsx } from 'clsx';
import { ImageUpload } from './ImageUpload';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { DeleteModal } from './DeleteModal';
import { BlockClientModal } from './BlockClientModal';
import { useNotifications } from './NotificationContext';
import { GuideModal } from './GuideModal';
import { useOffice } from '../contexts/OfficeContext';
import { query, where } from 'firebase/firestore';

export function ClientList() {
  const { currentOffice } = useOffice();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [selectedClientForDocs, setSelectedClientForDocs] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [blockModal, setBlockModal] = useState<{ isOpen: boolean, client: Client | null }>({ isOpen: false, client: null });
  const [rentals, setRentals] = useState<Rental[]>([]);
  const { addNotification } = useNotifications();
  const { t } = useLanguage();

  const [filterSource, setFilterSource] = useState<'all' | 'website' | 'admin'>('all');

  useEffect(() => {
    if (!currentOffice) return;

    const unsubscribe = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      const clientData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Client[];
      setClients(clientData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });
    return () => unsubscribe();
  }, [currentOffice]);

  useEffect(() => {
    if (!currentOffice) return;

    const unsubscribe = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rentals');
    });
    return () => unsubscribe();
  }, [currentOffice]);

  const getClientPendingReservations = (clientId: string) => {
    return rentals.filter(r => r.clientId === clientId && r.status === 'pending_confirmation');
  };

  const handleConfirmReservation = async (rental: Rental) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'rentals', rental.id), {
        status: 'reserved'
      });
      
      // Notify client
      await addDoc(collection(db, 'notifications'), {
        title: 'Réservation Confirmée',
        message: `Votre réservation pour le véhicule ${rentals.find(r => r.id === rental.id)?.vehicleId} a été confirmée.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        userId: rental.clientId
      });

      addNotification('success', 'Réservation confirmée', 'Le client a été notifié.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.cin && client.cin.toLowerCase().includes(searchTerm.toLowerCase())) ||
      client.phone.includes(searchTerm) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSource = filterSource === 'all' || client.source === filterSource;
    
    return matchesSearch && matchesSource;
  });

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Authentification requise');

      const idToken = await currentUser.getIdToken(true);
      const response = await fetch('/api/admin/delete-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ clientId: id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la suppression');
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_client', `Client supprimé: ${id}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Client supprimé', 'Le client et son compte associé ont été supprimés.');
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error: any) {
      addNotification('error', 'Erreur', error.message || 'Une erreur est survenue lors de la suppression.');
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBlock = async (client: Client, reason?: string) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        isBlocked: !client.isBlocked,
        blockReason: reason || ''
      });
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'block_client', `Client ${client.name} ${client.isBlocked ? 'débloqué' : 'bloqué'}`, auth.currentUser.displayName || undefined);
      }
      addNotification('info', client.isBlocked ? 'Client débloqué' : 'Client bloqué', `Le client ${client.name} a été ${client.isBlocked ? 'débloqué' : 'bloqué'}.`);
      setBlockModal({ isOpen: false, client: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${client.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'platinum': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
      case 'gold': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'silver': return 'text-stone-600 bg-stone-50 border-stone-100';
      default: return 'text-orange-600 bg-orange-50 border-orange-100';
    }
  };

  const handleExport = () => {
    const headers = ['Nom', 'CIN', 'Téléphone', 'Email', 'Catégorie', 'Points', 'Statut'];
    const data = filteredClients.map(c => [
      c.name,
      c.cin || '',
      c.phone,
      c.email || '',
      c.category,
      c.loyaltyPoints,
      c.isBlocked ? 'Bloqué' : 'Actif'
    ]);

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `liste_clients_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addNotification('success', 'Export réussi', 'La liste des clients a été exportée en CSV.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">{t('clients')}</h2>
            <p className="text-stone-500 italic serif">{t('manage_clients_desc')}</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 text-stone-700 py-3 px-6 rounded-2xl font-semibold hover:bg-stone-50 transition-all shadow-sm"
          >
            <Download className="w-5 h-5" />
            Exporter
          </button>
          <button
            onClick={() => { setEditingClient(null); setIsModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            {t('new_client')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder={t('search_clients_placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mr-2">Source:</span>
            <button 
              onClick={() => setFilterSource('all')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                filterSource === 'all' ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              )}
            >
              Tous
            </button>
            <button 
              onClick={() => setFilterSource('website')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5",
                filterSource === 'website' ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
              )}
            >
              <Globe className="w-3 h-3" /> Site Web
            </button>
            <button 
              onClick={() => setFilterSource('admin')}
              className={clsx(
                "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                filterSource === 'admin' ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              )}
            >
              Admin
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/50 border-b border-stone-100">
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Client</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Contact</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Identité</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Réservations</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredClients.map((client) => (
                <tr key={client.id} className={clsx(
                  "hover:bg-stone-50/50 transition-colors group",
                  client.isBlocked && "bg-red-50/30"
                )}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        client.isBlocked ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-600"
                      )}>
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{client.name}</p>
                          {client.source === 'website' && (
                            <div className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center" title="Inscrit via Site Web">
                              <Globe className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={clsx(
                            "text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded-full border",
                            getStatusColor(client.loyaltyStatus)
                          )}>
                            {client.loyaltyStatus}
                          </span>
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{client.category}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <Phone className="w-3 h-3 text-stone-400" />
                        {client.phone}
                      </div>
                      {client.email && (
                        <div className="flex items-center gap-2 text-xs text-stone-600">
                          <Mail className="w-3 h-3 text-stone-400" />
                          {client.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{client.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs text-stone-600">
                        <CreditCard className="w-3 h-3 text-stone-400" />
                        CIN: {client.cin}
                      </div>
                      {(client.cinRecto || client.licenseRecto) && (
                        <button 
                          onClick={() => setSelectedClientForDocs(client)}
                          className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                        >
                          <ImageIcon className="w-3 h-3" /> Voir documents
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      {getClientPendingReservations(client.id).length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-blue-600">
                            <Clock className="w-4 h-4" />
                            <span className="text-xs font-bold">{getClientPendingReservations(client.id).length} en attente</span>
                          </div>
                          {getClientPendingReservations(client.id).map(rental => (
                            <button
                              key={rental.id}
                              onClick={() => handleConfirmReservation(rental)}
                              className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded-lg font-bold hover:bg-blue-500 transition-all w-fit"
                            >
                              Confirmer
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400 italic">Aucune</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {client.isBlocked ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                        <ShieldAlert className="w-3 h-3" /> Bloqué
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                        <ShieldCheck className="w-3 h-3" /> Actif
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => setBlockModal({ isOpen: true, client })}
                        className={clsx(
                          "p-2 rounded-lg transition-all",
                          client.isBlocked ? "hover:bg-emerald-50 text-emerald-600" : "hover:bg-red-50 text-red-600"
                        )}
                        title={client.isBlocked ? t('unblock') : t('block')}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { setEditingClient(client); setIsModalOpen(true); }}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setHistoryClient(client)}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                        title="Historique des locations"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: client.id })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ClientModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          client={editingClient}
          clients={clients}
        />
      )}

      {historyClient && (
        <ClientHistoryModal 
          client={historyClient}
          onClose={() => setHistoryClient(null)}
        />
      )}

      {selectedClientForDocs && (
        <DocumentViewer 
          client={selectedClientForDocs} 
          onClose={() => setSelectedClientForDocs(null)} 
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer le client"
        message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action supprimera définitivement toutes ses données."
      />

      {blockModal.client && (
        <BlockClientModal
          isOpen={blockModal.isOpen}
          onClose={() => setBlockModal({ isOpen: false, client: null })}
          onConfirm={(reason) => blockModal.client && handleToggleBlock(blockModal.client, reason)}
          client={blockModal.client}
        />
      )}

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="clients"
      />

    </div>
  );
}

function DocumentViewer({ client, onClose }: { client: Client, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8 print-content resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Documents de {client.name}</h3>
            <p className="text-stone-500 text-sm italic serif">CIN et Permis de conduire</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-12">
          <div className="space-y-6">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-2">Carte d'Identité Nationale (CIN)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Recto</p>
                {client.cinRecto ? (
                  <img src={client.cinRecto} alt="CIN Recto" className="w-full rounded-2xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="aspect-video bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-xs">Non disponible</div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Verso</p>
                {client.cinVerso ? (
                  <img src={client.cinVerso} alt="CIN Verso" className="w-full rounded-2xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="aspect-video bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-xs">Non disponible</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-2">Permis de Conduire</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Recto</p>
                {client.licenseRecto ? (
                  <img src={client.licenseRecto} alt="Permis Recto" className="w-full rounded-2xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="aspect-video bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-xs">Non disponible</div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Verso</p>
                {client.licenseVerso ? (
                  <img src={client.licenseVerso} alt="Permis Verso" className="w-full rounded-2xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="aspect-video bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 text-xs">Non disponible</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="p-8 bg-stone-50 border-t border-stone-100 flex justify-end">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-stone-800 transition-all print:hidden"
          >
            <Printer className="w-5 h-5" />
            Imprimer les documents
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientHistoryModal({ client, onClose }: { client: Client, onClose: () => void }) {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'rentals'),
      where('clientId', '==', client.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rentalsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rental));
      setRentals(rentalsData.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [client.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">Historique de {client.name}</h3>
            <p className="text-stone-500 text-sm italic serif">Liste de toutes les locations et réservations.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          ) : rentals.length > 0 ? (
            <div className="space-y-4">
              {rentals.map((rental) => (
                <div key={rental.id} className="p-6 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between group hover:border-emerald-200 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-stone-100">
                      <Clock className={clsx(
                        "w-6 h-6",
                        rental.status === 'completed' ? "text-emerald-500" : "text-amber-500"
                      )} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-stone-900">{rental.contractNumber}</p>
                        <span className={clsx(
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                          rental.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {rental.status}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-1">
                        Du {format(new Date(rental.startDate), 'dd MMM yyyy', { locale: fr })} au {format(new Date(rental.endDate), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600">{rental.totalAmount.toLocaleString()} TND</p>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      {rental.paymentStatus === 'paid' ? 'Payé' : 'En attente'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-stone-400 italic serif">Aucune location enregistrée pour ce client.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientModal({ isOpen, onClose, client, clients }: { isOpen: boolean, onClose: () => void, client: Client | null, clients: Client[] }) {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: client?.name || '',
    cin: client?.cin || '',
    licenseNumber: client?.licenseNumber || '',
    phone: client?.phone || '',
    email: client?.email || '',
    category: client?.category || 'regular' as 'regular' | 'vip',
    cinRecto: client?.cinRecto || '',
    cinVerso: client?.cinVerso || '',
    licenseRecto: client?.licenseRecto || '',
    licenseVerso: client?.licenseVerso || '',
    isBlocked: client?.isBlocked || false,
    blockReason: client?.blockReason || '',
    loyaltyPoints: client?.loyaltyPoints || 0,
    loyaltyStatus: client?.loyaltyStatus || 'bronze' as 'bronze' | 'silver' | 'gold' | 'platinum'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Duplicate check
    if (!client) {
      const duplicateByName = clients.find(c => c.name.toLowerCase() === formData.name.toLowerCase());
      const duplicateByCin = formData.cin ? clients.find(c => c.cin === formData.cin) : null;
      const duplicateByLicense = clients.find(c => c.licenseNumber === formData.licenseNumber);
      const duplicateByPhone = clients.find(c => c.phone === formData.phone);

      if (duplicateByName) {
        addNotification('error', 'Doublage détecté', `Un client avec le nom "${formData.name}" existe déjà.`);
        return;
      }
      if (duplicateByCin) {
        addNotification('error', 'Doublage détecté', `Un client avec le CIN "${formData.cin}" existe déjà.`);
        return;
      }
      if (duplicateByLicense) {
        addNotification('error', 'Doublage détecté', `Un client avec le numéro de permis "${formData.licenseNumber}" existe déjà.`);
        return;
      }
      if (duplicateByPhone) {
        addNotification('error', 'Doublage détecté', `Un client avec le numéro de téléphone "${formData.phone}" existe déjà.`);
        return;
      }
    }

    try {
      setIsSaving(true);
      if (client) {
        await updateDoc(doc(db, 'clients', client.id), {
          ...formData,
          agentName: auth.currentUser?.displayName || 'Agent'
        });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'update_client', `Client modifié: ${formData.name}`, auth.currentUser.displayName || undefined);
        }
      } else {
        await addDoc(collection(db, 'clients'), {
          ...formData,
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_client', `Nouveau client ajouté: ${formData.name}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, client ? OperationType.UPDATE : OperationType.CREATE, client ? `clients/${client.id}` : 'clients');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">
            {client ? t('edit_client') : t('new_client')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">{t('general_info')}</label>
                <div className="space-y-4">
                  <input
                    required
                    placeholder={t('full_name')}
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      required
                      placeholder="CIN"
                      value={formData.cin}
                      onChange={(e) => setFormData({...formData, cin: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      required
                      placeholder={t('license_number')}
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({...formData, licenseNumber: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <input
                    required
                    placeholder={t('phone')}
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value as 'regular' | 'vip'})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="regular">{t('regular')}</option>
                      <option value="vip">VIP</option>
                    </select>
                    <select
                      value={formData.loyaltyStatus}
                      onChange={(e) => setFormData({...formData, loyaltyStatus: e.target.value as any})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                      <option value="platinum">Platinum</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest shrink-0">{t('loyalty_points')}</label>
                    <input
                      type="number"
                      value={formData.loyaltyPoints}
                      onChange={(e) => setFormData({...formData, loyaltyPoints: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents (CIN)</label>
                <div className="grid grid-cols-2 gap-4">
                  <ImageUpload 
                    label="CIN Recto" 
                    value={formData.cinRecto} 
                    onChange={(val) => setFormData({...formData, cinRecto: val})} 
                  />
                  <ImageUpload 
                    label="CIN Verso" 
                    value={formData.cinVerso} 
                    onChange={(val) => setFormData({...formData, cinVerso: val})} 
                  />
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents (Permis)</label>
                <div className="grid grid-cols-2 gap-4">
                  <ImageUpload 
                    label="Permis Recto" 
                    value={formData.licenseRecto} 
                    onChange={(val) => setFormData({...formData, licenseRecto: val})} 
                  />
                  <ImageUpload 
                    label="Permis Verso" 
                    value={formData.licenseVerso} 
                    onChange={(val) => setFormData({...formData, licenseVerso: val})} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : (client ? 'Mettre à jour' : 'Enregistrer le client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
