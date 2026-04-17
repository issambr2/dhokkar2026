import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Maintenance, Vehicle } from '../types';
import { Plus, Search, Wrench, CheckCircle, Clock, AlertCircle, Calendar, Car as CarIcon, Edit2, Trash2, X, DollarSign, MapPin, AlertTriangle, Package, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { logActivity } from '../services/logService';
import { DeleteModal } from './DeleteModal';
import { useOffice } from '../contexts/OfficeContext';
import { where } from 'firebase/firestore';

export function MaintenanceList() {
  const { currentOffice } = useOffice();
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<Maintenance | null>(null);
  const [completingMaintenance, setCompletingMaintenance] = useState<Maintenance | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });

  useEffect(() => {
    if (!currentOffice) return;

    const unsubMaintenances = onSnapshot(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id), orderBy('date', 'desc')), (snapshot) => {
      setMaintenances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Maintenance[]);
      setLoading(false);
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    });

    return () => {
      unsubMaintenances();
      unsubVehicles();
    };
  }, [currentOffice]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);

  const handleComplete = async (maintenance: Maintenance, paymentStatus: 'pending' | 'paid', paidAmount: number, parkingLocation: string) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'maintenances', maintenance.id), { 
        status: 'completed',
        paymentStatus,
        paidAmount
      });
      await updateDoc(doc(db, 'vehicles', maintenance.vehicleId), { 
        status: 'available',
        parkingLocation
      });

      // Automatic Stock Deduction for Oil Change
      if (maintenance.type === 'oil_change' && (maintenance.oilLiters || maintenance.hasFilter)) {
        const stockRef = collection(db, 'stock');
        const stockSnapshot = await getDocs(query(stockRef, where('officeId', '==', currentOffice?.id)));
        const stockItems = stockSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        const vehicle = getVehicle(maintenance.vehicleId);

        // 1. Deduct Oil
        if (maintenance.oilLiters && maintenance.oilLiters > 0) {
          const oilItem = stockItems.find(item => 
            item.category === 'huiles' || 
            item.name.toLowerCase().includes('huile')
          );

          if (oilItem && oilItem.quantity >= maintenance.oilLiters) {
            await updateDoc(doc(db, 'stock', oilItem.id), {
              quantity: oilItem.quantity - maintenance.oilLiters,
              updatedAt: new Date().toISOString()
            });

            await addDoc(collection(db, 'stockMovements'), {
              itemId: oilItem.id,
              itemName: oilItem.name,
              type: 'out',
              quantity: maintenance.oilLiters,
              priceTTC: oilItem.priceTTC,
              date: new Date().toISOString(),
              reason: `Vidange automatique - ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})`,
              vehicleId: maintenance.vehicleId,
              vehiclePlate: vehicle?.plate,
              userId: auth.currentUser?.uid || '',
              userName: auth.currentUser?.displayName || 'Système',
              createdAt: new Date().toISOString(),
              officeId: currentOffice?.id
            });
          }
        }

        // 2. Deduct Filter
        if (maintenance.hasFilter) {
          const filterItem = stockItems.find(item => 
            item.name.toLowerCase().includes('filtre')
          );

          if (filterItem && filterItem.quantity >= 1) {
            await updateDoc(doc(db, 'stock', filterItem.id), {
              quantity: filterItem.quantity - 1,
              updatedAt: new Date().toISOString()
            });

            await addDoc(collection(db, 'stockMovements'), {
              itemId: filterItem.id,
              itemName: filterItem.name,
              type: 'out',
              quantity: 1,
              priceTTC: filterItem.priceTTC,
              date: new Date().toISOString(),
              reason: `Filtre vidange automatique - ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})`,
              vehicleId: maintenance.vehicleId,
              vehiclePlate: vehicle?.plate,
              userId: auth.currentUser?.uid || '',
              userName: auth.currentUser?.displayName || 'Système',
              createdAt: new Date().toISOString(),
              officeId: currentOffice?.id
            });
          }
        }

        // 3. Deduct Selected Stock Item
        if (maintenance.stockItemId && maintenance.stockItemQuantity && maintenance.stockItemQuantity > 0) {
          const selectedItem = stockItems.find(item => item.id === maintenance.stockItemId);

          if (selectedItem && selectedItem.quantity >= maintenance.stockItemQuantity) {
            await updateDoc(doc(db, 'stock', selectedItem.id), {
              quantity: selectedItem.quantity - maintenance.stockItemQuantity,
              updatedAt: new Date().toISOString()
            });

            await addDoc(collection(db, 'stockMovements'), {
              itemId: selectedItem.id,
              itemName: selectedItem.name,
              type: 'out',
              quantity: maintenance.stockItemQuantity,
              priceTTC: maintenance.stockItemPrice || selectedItem.priceTTC,
              date: new Date().toISOString(),
              reason: `Maintenance stock - ${vehicle?.brand} ${vehicle?.model} (${vehicle?.plate})`,
              vehicleId: maintenance.vehicleId,
              vehiclePlate: vehicle?.plate,
              userId: auth.currentUser?.uid || '',
              userName: auth.currentUser?.displayName || 'Système',
              createdAt: new Date().toISOString(),
              officeId: currentOffice?.id
            });
          }
        }
      }

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'complete_maintenance', `Maintenance terminée pour ${getVehicle(maintenance.vehicleId)?.brand} ${getVehicle(maintenance.vehicleId)?.model}. Emplacement: ${parkingLocation}`, auth.currentUser.displayName || undefined);
      }
      setCompletingMaintenance(null);
    } catch (error) {
      console.error("Error completing maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'maintenances', id));
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_maintenance', `Maintenance supprimée: ${id}`);
      }
      setDeleteModal({ isOpen: false, id: '' });
    } catch (error) {
      console.error("Error deleting maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Maintenance</h2>
          <p className="text-stone-500 italic serif">Suivi des entretiens et réparations de la flotte.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouvel entretien
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Véhicule</th>
                <th className="px-8 py-4">Agent</th>
                <th className="px-8 py-4">Créé le</th>
                <th className="px-8 py-4">Type & Description</th>
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4">Coût</th>
                <th className="px-8 py-4">Paiement</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {maintenances.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400">
                        <CarIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-900">{getVehicle(m.vehicleId)?.brand} {getVehicle(m.vehicleId)?.model}</p>
                        <p className="text-xs text-stone-400 font-mono">{getVehicle(m.vehicleId)?.plate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{m.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {m.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(m.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <p className="text-sm font-bold text-stone-900 capitalize">{m.type}</p>
                    <p className="text-xs text-stone-500 truncate max-w-xs">{m.description}</p>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-sm text-stone-600">
                      <Calendar className="w-4 h-4 text-stone-400" />
                      <span>{format(new Date(m.date), 'dd MMM yyyy', { locale: fr })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <p className="font-bold text-stone-900">{(m.cost || 0).toLocaleString()} TND</p>
                  </td>
                  <td className="px-8 py-5">
                    <span className={clsx(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      m.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {m.paymentStatus === 'paid' ? 'Payé' : 'En attente'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <MaintenanceStatusBadge status={m.status} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      {m.status === 'scheduled' && (
                        <button 
                          onClick={() => setCompletingMaintenance(m)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Marquer comme terminé"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => { setEditingMaintenance(m); setIsModalOpen(true); }}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, id: m.id })}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                        title="Supprimer"
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
        <MaintenanceModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setEditingMaintenance(null); }} 
          vehicles={vehicles}
          maintenance={editingMaintenance}
        />
      )}

      {completingMaintenance && (
        <MaintenanceCompletionModal
          maintenance={completingMaintenance}
          onClose={() => setCompletingMaintenance(null)}
          onConfirm={(paymentStatus, paidAmount, parkingLocation) => 
            handleComplete(completingMaintenance, paymentStatus, paidAmount, parkingLocation)
          }
          vehicle={getVehicle(completingMaintenance.vehicleId)}
          isSaving={isSaving}
        />
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDelete(deleteModal.id)}
        title="Supprimer la maintenance"
        message="Êtes-vous sûr de vouloir supprimer cet enregistrement de maintenance ? Cette action est irréversible."
      />
    </div>
  );
}

function MaintenanceStatusBadge({ status }: { status: Maintenance['status'] }) {
  const styles = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cancelled: "bg-red-50 text-red-700 border-red-100"
  };
  const labels = {
    scheduled: "Planifié",
    completed: "Terminé",
    cancelled: "Annulé"
  };
  const icons = {
    scheduled: Clock,
    completed: CheckCircle,
    cancelled: AlertCircle
  };
  const Icon = icons[status];

  return (
    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 w-fit", styles[status])}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </span>
  );
}

function MaintenanceModal({ isOpen, onClose, vehicles, maintenance }: { isOpen: boolean, onClose: () => void, vehicles: Vehicle[], maintenance: Maintenance | null }) {
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    vehicleId: maintenance?.vehicleId || '',
    type: maintenance?.type || 'oil_change' as Maintenance['type'],
    description: maintenance?.description || '',
    date: maintenance?.date || format(new Date(), 'yyyy-MM-dd'),
    cost: maintenance?.cost || 0,
    mileageAtService: maintenance?.mileageAtService || 0,
    oilLiters: maintenance?.oilLiters || 0,
    hasFilter: maintenance?.hasFilter || false,
    stockItemId: maintenance?.stockItemId || '',
    stockItemQuantity: maintenance?.stockItemQuantity || 0,
    stockItemPrice: maintenance?.stockItemPrice || 0,
    paymentStatus: maintenance?.paymentStatus || 'pending' as 'pending' | 'paid',
    paidAmount: maintenance?.paidAmount || 0
  });

  useEffect(() => {
    if (!currentOffice) return;
    const fetchStock = async () => {
      const q = query(collection(db, 'stock'), where('officeId', '==', currentOffice.id));
      const snapshot = await getDocs(q);
      setStockItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchStock();
  }, [currentOffice]);

  const selectedStockItem = stockItems.find(item => item.id === formData.stockItemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.vehicleId) return;

    try {
      setIsSaving(true);
      if (maintenance) {
        await updateDoc(doc(db, 'maintenances', maintenance.id), formData);
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'update_maintenance', `Maintenance modifiée pour ${vehicles.find(v => v.id === formData.vehicleId)?.brand}`, auth.currentUser.displayName || undefined);
        }
      } else {
        await addDoc(collection(db, 'maintenances'), {
          ...formData,
          status: 'scheduled',
          agentName: auth.currentUser?.displayName || 'Agent',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        // Update vehicle status to maintenance
        await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'maintenance' });
        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_maintenance', `Nouvelle maintenance planifiée pour ${vehicles.find(v => v.id === formData.vehicleId)?.brand}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      console.error("Error saving maintenance:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">{maintenance ? 'Modifier l\'entretien' : 'Nouvel Entretien'}</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule</label>
            <select
              required
              disabled={!!maintenance}
              value={formData.vehicleId}
              onChange={(e) => setFormData({...formData, vehicleId: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="">Sélectionner un véhicule</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as Maintenance['type']})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="oil_change">Vidange</option>
                <option value="tire_change">Pneus</option>
                <option value="brake_service">Freins</option>
                <option value="inspection">Contrôle Technique</option>
                <option value="repair">Réparation</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
            <textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
              placeholder="Détails de l'intervention..."
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Coût (TND)</label>
              <input
                type="number"
                required
                value={formData.cost}
                onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage</label>
              <input
                type="number"
                required
                value={formData.mileageAtService}
                onChange={(e) => setFormData({...formData, mileageAtService: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {formData.type === 'oil_change' && (
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
              <h4 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Détails de la Vidange</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Litres d'huile</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.oilLiters}
                    onChange={(e) => setFormData({...formData, oilLiters: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-white border border-blue-100 rounded-xl text-sm"
                    placeholder="Ex: 4.5"
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Avec Filtre</label>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, hasFilter: !formData.hasFilter})}
                    className={clsx(
                      "w-10 h-5 rounded-full transition-all relative",
                      formData.hasFilter ? "bg-blue-600" : "bg-stone-300"
                    )}
                  >
                    <div className={clsx(
                      "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
                      formData.hasFilter ? "left-5.5" : "left-0.5"
                    )} />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 space-y-4">
            <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-stone-400" />
              Pièces & Consommables du Stock
            </h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Sélectionner un article</label>
                <select
                  value={formData.stockItemId}
                  onChange={(e) => {
                    const item = stockItems.find(i => i.id === e.target.value);
                    setFormData({
                      ...formData, 
                      stockItemId: e.target.value,
                      stockItemPrice: item?.priceTTC || 0
                    });
                  }}
                  className="w-full px-4 py-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Aucun article du stock</option>
                  {stockItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.quantity} {item.unit} dispo) - {item.priceTTC.toFixed(3)} DT
                    </option>
                  ))}
                </select>
              </div>

              {formData.stockItemId && (
                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                      Quantité ({selectedStockItem?.unit})
                    </label>
                    <input
                      type="number"
                      step={selectedStockItem?.unit === 'L' ? "0.1" : "1"}
                      value={formData.stockItemQuantity}
                      onChange={(e) => setFormData({...formData, stockItemQuantity: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                      Prix {selectedStockItem?.unit === 'L' ? 'par L' : 'par pièce'} (TND)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={formData.stockItemPrice}
                      onChange={(e) => setFormData({...formData, stockItemPrice: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-white border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut Paiement</label>
              <select
                value={formData.paymentStatus}
                onChange={(e) => setFormData({...formData, paymentStatus: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="pending">En attente</option>
                <option value="paid">Payé</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Montant Payé</label>
              <input
                type="number"
                value={formData.paidAmount}
                onChange={(e) => setFormData({...formData, paidAmount: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {isSaving ? 'Enregistrement...' : (maintenance ? 'Mettre à jour' : 'Enregistrer l\'entretien')}
          </button>
        </form>
      </div>
    </div>
  );
}

function MaintenanceCompletionModal({ maintenance, onClose, onConfirm, vehicle, isSaving }: { 
  maintenance: Maintenance, 
  onClose: () => void, 
  onConfirm: (paymentStatus: 'pending' | 'paid', paidAmount: number, parkingLocation: string) => void,
  vehicle?: Vehicle,
  isSaving: boolean
}) {
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('paid');
  const [paidAmount, setPaidAmount] = useState(maintenance.cost);
  const [parkingLocation, setParkingLocation] = useState(vehicle?.parkingLocation || '');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-stone-900">Terminer la Maintenance</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Véhicule</p>
            <p className="font-bold text-emerald-900">{vehicle?.brand} {vehicle?.model} ({vehicle?.plate})</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Statut du Paiement</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setPaymentStatus('paid'); setPaidAmount(maintenance.cost); }}
                className={clsx(
                  "py-3 px-4 rounded-xl font-bold text-sm transition-all border-2",
                  paymentStatus === 'paid' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-stone-600 border-stone-100 hover:border-emerald-200"
                )}
              >
                Payé
              </button>
              <button
                onClick={() => setPaymentStatus('pending')}
                className={clsx(
                  "py-3 px-4 rounded-xl font-bold text-sm transition-all border-2",
                  paymentStatus === 'pending' ? "bg-amber-500 text-white border-amber-500" : "bg-white text-stone-600 border-stone-100 hover:border-amber-200"
                )}
              >
                En attente
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-3 h-3" /> Montant Payé (TND)
            </label>
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
              <MapPin className="w-3 h-3" /> Emplacement de Parking
            </label>
            <input
              value={parkingLocation}
              onChange={(e) => setParkingLocation(e.target.value)}
              placeholder="Ex: Parking A, Garage Central..."
              className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={() => onConfirm(paymentStatus, paidAmount, parkingLocation)}
          disabled={isSaving}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
        >
          {isSaving ? 'Traitement...' : 'Confirmer & Rendre Disponible'}
        </button>
      </div>
    </div>
  );
}
