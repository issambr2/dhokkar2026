import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy, Timestamp, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Vehicle, VehicleWash, PaymentMethod } from '../types';
import { useOffice } from '../contexts/OfficeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Droplets, Plus, Search, Filter, Calendar, DollarSign, CheckCircle2, XCircle, Trash2, Edit2, Car, Clock, MoreVertical, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr, ar, enUS } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { DeleteModal } from './DeleteModal';
import { logActivity } from '../services/logService';

export function WashPanel() {
  const { currentOffice } = useOffice();
  const { t, language, isRTL } = useLanguage();
  const [washes, setWashes] = useState<VehicleWash[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'pending'>('all');
  
  // Form state
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    // Listen to washes
    const washesQuery = query(
      collection(db, 'washes'),
      where('officeId', '==', currentOffice.id),
      orderBy('date', 'desc')
    );

    const unsubscribeWashes = onSnapshot(washesQuery, (snapshot) => {
      const washesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VehicleWash[];
      setWashes(washesData);
      setLoading(false);
    });

    // Listen to vehicles
    const vehiclesQuery = query(
      collection(db, 'vehicles'),
      where('officeId', '==', currentOffice.id)
    );

    const unsubscribeVehicles = onSnapshot(vehiclesQuery, (snapshot) => {
      const vehiclesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(vehiclesData);
    });

    return () => {
      unsubscribeWashes();
      unsubscribeVehicles();
    };
  }, [currentOffice]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOffice || !auth.currentUser || !selectedVehicleId) return;

    setIsSaving(true);
    try {
      const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (!selectedVehicle) return;

      const washData = {
        officeId: currentOffice.id,
        vehicleId: selectedVehicleId,
        vehiclePlate: selectedVehicle.plate,
        date: new Date().toISOString(),
        price,
        isPaid,
        paymentMethod: isPaid ? paymentMethod : null,
        notes,
        createdBy: auth.currentUser.uid,
        agentName: auth.currentUser.displayName || 'Agent',
        createdAt: new Date().toISOString()
      };

      if (editingId) {
        await updateDoc(doc(db, 'washes', editingId), washData);
        
        // Update linked expense if it exists
        const expenseQuery = query(collection(db, 'expenses'), where('washId', '==', editingId));
        const expenseSnapshot = await getDocs(expenseQuery);
        
        if (!expenseSnapshot.empty) {
          const expenseDoc = expenseSnapshot.docs[0];
          if (isPaid && price > 0) {
            await updateDoc(doc(db, 'expenses', expenseDoc.id), {
              amount: price,
              paymentMethod: paymentMethod,
              description: `Lavage véhicule: ${selectedVehicle.brand} ${selectedVehicle.model} (${selectedVehicle.plate})`,
              date: new Date().toISOString()
            });
          } else {
            // If no longer paid or price is 0, delete the expense
            await deleteDoc(doc(db, 'expenses', expenseDoc.id));
          }
        } else if (isPaid && price > 0) {
          // If it was not paid before but now it is, create a new expense
          await addDoc(collection(db, 'expenses'), {
            officeId: currentOffice.id,
            date: new Date().toISOString(),
            type: 'wash',
            description: `Lavage véhicule: ${selectedVehicle.brand} ${selectedVehicle.model} (${selectedVehicle.plate})`,
            amount: price,
            paymentMethod: paymentMethod,
            vehicleId: selectedVehicleId,
            createdBy: auth.currentUser.uid,
            agentName: auth.currentUser.displayName || 'Agent',
            createdAt: new Date().toISOString(),
            washId: editingId
          });
        }
      } else {
        const washRef = await addDoc(collection(db, 'washes'), washData);
        
        // Also add to expenses if paid
        if (isPaid && price > 0) {
          await addDoc(collection(db, 'expenses'), {
            officeId: currentOffice.id,
            date: new Date().toISOString(),
            type: 'wash',
            description: `Lavage véhicule: ${selectedVehicle.brand} ${selectedVehicle.model} (${selectedVehicle.plate})`,
            amount: price,
            paymentMethod: paymentMethod,
            vehicleId: selectedVehicleId,
            createdBy: auth.currentUser.uid,
            agentName: auth.currentUser.displayName || 'Agent',
            createdAt: new Date().toISOString(),
            washId: washRef.id // Link to the wash record
          });
        }
        
        // Update vehicle wash status
        await updateDoc(doc(db, 'vehicles', selectedVehicleId), {
          washStatus: 'clean',
          lastWashDate: new Date().toISOString()
        });
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving wash:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setSelectedVehicleId('');
    setPrice(0);
    setIsPaid(false);
    setPaymentMethod('cash');
    setNotes('');
    setEditingId(null);
  };

  const handleEdit = (wash: VehicleWash) => {
    setSelectedVehicleId(wash.vehicleId);
    setPrice(wash.price);
    setIsPaid(wash.isPaid);
    if (wash.paymentMethod) setPaymentMethod(wash.paymentMethod);
    setNotes(wash.notes || '');
    setEditingId(wash.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      setIsSaving(true);
      await deleteDoc(doc(db, 'washes', id));
      
      // Also delete linked expense
      const expenseQuery = query(collection(db, 'expenses'), where('washId', '==', id));
      const expenseSnapshot = await getDocs(expenseQuery);
      for (const expenseDoc of expenseSnapshot.docs) {
        await deleteDoc(doc(db, 'expenses', expenseDoc.id));
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_wash', `Lavage supprimé`, auth.currentUser.displayName || undefined);
      }
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      console.error("Error deleting wash:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWashes = washes.filter(wash => {
    const matchesSearch = wash.vehiclePlate.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'paid' ? wash.isPaid : !wash.isPaid);
    return matchesSearch && matchesStatus;
  });

  const getLocale = () => {
    switch (language) {
      case 'fr': return fr;
      case 'ar': return ar;
      case 'en': return enUS;
      default: return fr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Droplets className="w-6 h-6 text-emerald-600" />
            Lavage Véhicule
          </h2>
          <p className="text-stone-500 text-sm mt-1">Gérez le nettoyage et l'entretien esthétique de votre flotte</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouveau Lavage
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <Droplets className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">Total Lavages</p>
              <p className="text-2xl font-bold text-stone-900">{washes.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">Dépenses Totales</p>
              <p className="text-2xl font-bold text-stone-900">
                {washes.reduce((sum, w) => sum + w.price, 0).toLocaleString()} TND
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">En attente de paiement</p>
              <p className="text-2xl font-bold text-stone-900">
                {washes.filter(w => !w.isPaid).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher par plaque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2 bg-stone-50 p-1 rounded-2xl border border-stone-200">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus === 'all' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterStatus('paid')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus === 'paid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Payés
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus === 'pending' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Non Payés
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-stone-50/50">
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Agent</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Prix</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Statut</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-stone-400 uppercase tracking-widest">Notes</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredWashes.map((wash) => (
                <tr key={wash.id} className="hover:bg-stone-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                        <Car className="w-5 h-5 text-stone-600" />
                      </div>
                      <span className="font-bold text-stone-900">{wash.vehiclePlate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{wash.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-stone-900">
                        {format(new Date(wash.date), 'dd MMMM yyyy', { locale: getLocale() })}
                      </span>
                      <span className="text-xs text-stone-400">
                        {format(new Date(wash.date), 'HH:mm')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-stone-900">{wash.price.toLocaleString()} TND</span>
                  </td>
                  <td className="px-6 py-4">
                    {wash.isPaid ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Payé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-stone-500 truncate max-w-[200px]">{wash.notes || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(wash)}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ isOpen: true, id: wash.id })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredWashes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center">
                        <Droplets className="w-8 h-8 text-stone-200" />
                      </div>
                      <p className="text-stone-400 font-medium">Aucun enregistrement trouvé</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-emerald-600" />
                  {editingId ? 'Modifier le lavage' : 'Nouveau lavage'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-stone-200 rounded-xl transition-all text-stone-400 hover:text-stone-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-700 flex items-center gap-2">
                    <Car className="w-4 h-4 text-stone-400" />
                    Sélectionner le véhicule
                  </label>
                  <select
                    required
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="">Choisir une voiture...</option>
                    {vehicles.map(vehicle => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.brand} {vehicle.model} - {vehicle.plate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-700 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-stone-400" />
                      Prix du lavage (TND)
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.001"
                      value={price}
                      onChange={(e) => setPrice(parseFloat(e.target.value))}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-stone-400" />
                      Statut du paiement
                    </label>
                    <div className="flex items-center gap-4 h-[50px]">
                      <button
                        type="button"
                        onClick={() => setIsPaid(true)}
                        className={`flex-1 h-full rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${isPaid ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Payé
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPaid(false)}
                        className={`flex-1 h-full rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${!isPaid ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-stone-50 text-stone-400 border border-stone-200'}`}
                      >
                        <Clock className="w-4 h-4" />
                        En attente
                      </button>
                    </div>
                  </div>
                </div>

                {isPaid && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-stone-700 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-stone-400" />
                      Mode de paiement
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                            paymentMethod === method
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-stone-50 border-stone-100 text-stone-400'
                          }`}
                        >
                          {method === 'cash' ? 'Espèces' : method === 'card' ? 'Carte' : 'Virement'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-700">Notes / Commentaires</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                    placeholder="Détails supplémentaires..."
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    {editingId ? 'Mettre à jour' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer le lavage"
        message="Êtes-vous sûr de vouloir supprimer cet enregistrement de lavage ? Cette action supprimera également la dépense associée."
      />
    </div>
  );
}
