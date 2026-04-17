import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, getDocs, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { StockItem, StockMovement, Vehicle } from '../types';
import { Package, Plus, Minus, History, Car, Clock, Search, Filter, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownLeft, Edit2, Trash2, X, Info, FileText, Upload, Download, User } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { useNotifications } from './NotificationContext';
import { DeleteModal } from './DeleteModal';
import { GuideModal } from './GuideModal';
import { useOffice } from '../contexts/OfficeContext';
import { compressImage } from '../utils/imageCompression';

export function StockPanel() {
  const { currentOffice } = useOffice();
  const { addNotification } = useNotifications();
  const [categoryFilter, setCategoryFilter] = useState('');
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [historyDateRange, setHistoryDateRange] = useState({ start: '', end: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [movementType, setMovementType] = useState<'in' | 'out'>('out');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    category: '',
    quantity: 0,
    unit: 'psc' as 'L' | 'psc',
    priceTTC: 0,
    minQuantity: 5,
    supplierName: ''
  });

  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  const [newMovement, setNewMovement] = useState({
    quantity: 1,
    reason: '',
    vehicleId: '',
    supplierName: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    documents: [] as { name: string; url: string }[]
  });
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newDocs = [...newMovement.documents];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file);
        newDocs.push({
          name: file.name,
          url: compressed // In a real app, this would be a Firebase Storage URL
        });
      }
      setNewMovement({ ...newMovement, documents: newDocs });
      addNotification('success', 'Téléchargé', `${files.length} document(s) ajouté(s).`);
    } catch (error) {
      console.error('Error uploading files:', error);
      addNotification('error', 'Erreur', 'Échec du téléchargement des documents.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!currentOffice) return;

    const qItems = query(collection(db, 'stock'), where('officeId', '==', currentOffice.id), orderBy('name'));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockItem[]);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stock'));

    const qMovements = query(collection(db, 'stockMovements'), where('officeId', '==', currentOffice.id), orderBy('createdAt', 'desc'));
    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockMovement[]);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'stockMovements'));

    const fetchVehicles = async () => {
      const snapshot = await getDocs(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)));
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    };

    fetchVehicles();
    setLoading(false);

    return () => {
      unsubItems();
      unsubMovements();
    };
  }, [currentOffice]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'stock'), {
        ...newItem,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        officeId: currentOffice?.id
      });

      if (newItem.quantity > 0) {
        await addDoc(collection(db, 'stockMovements'), {
          itemId: docRef.id,
          itemName: newItem.name,
          type: 'in',
          quantity: newItem.quantity,
          priceTTC: newItem.priceTTC,
          supplierName: newItem.supplierName,
          date: new Date().toISOString(),
          reason: 'Stock initial',
          userId: auth.currentUser?.uid || '',
          userName: auth.currentUser?.displayName || 'Admin',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
      }

      setIsAddModalOpen(false);
      setNewItem({ name: '', description: '', category: '', quantity: 0, unit: 'psc', priceTTC: 0, minQuantity: 5, supplierName: '' });
      addNotification('success', 'Article ajouté', 'L\'article a été ajouté au stock.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stock');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await updateDoc(doc(db, 'stock', editingItem.id), {
        ...editingItem,
        updatedAt: new Date().toISOString()
      });
      setIsEditModalOpen(false);
      setEditingItem(null);
      addNotification('success', 'Article modifié', 'L\'article a été mis à jour.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stock/${editingItem.id}`);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'stock', id));
      addNotification('success', 'Article supprimé', 'L\'article a été supprimé du stock.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `stock/${id}`);
    }
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    if (movementType === 'out' && selectedItem.quantity < newMovement.quantity) {
      addNotification('error', 'Stock insuffisant', 'La quantité en stock est insuffisante.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const confirmMovement = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === newMovement.vehicleId);
      const movementData: Omit<StockMovement, 'id'> = {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        type: movementType,
        quantity: newMovement.quantity,
        priceTTC: selectedItem.priceTTC,
        supplierName: newMovement.supplierName || undefined,
        date: newMovement.date,
        reason: newMovement.reason,
        vehicleId: newMovement.vehicleId || undefined,
        vehiclePlate: vehicle?.plate,
        userId: auth.currentUser?.uid || '',
        userName: auth.currentUser?.displayName || 'Admin',
        createdAt: new Date().toISOString(),
        officeId: currentOffice?.id,
        documents: newMovement.documents
      };

      await addDoc(collection(db, 'stockMovements'), movementData);

      const newQuantity = movementType === 'in' 
        ? selectedItem.quantity + newMovement.quantity 
        : selectedItem.quantity - newMovement.quantity;

      await updateDoc(doc(db, 'stock', selectedItem.id), {
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      });

      setIsMovementModalOpen(false);
      setIsConfirmModalOpen(false);
      setNewMovement({ quantity: 1, reason: '', vehicleId: '', supplierName: '', date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), documents: [] });
      addNotification('success', 'Mouvement enregistré', 'Le mouvement de stock a été enregistré avec succès.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'stockMovements');
    } finally {
      setIsSaving(false);
    }
  };

  const exportInventory = () => {
    const data = items.map(item => ({
      'Nom': item.name,
      'Catégorie': item.category,
      'Quantité': item.quantity,
      'Unité': item.unit,
      'Prix TTC (TND)': item.priceTTC,
      'Stock Min': item.minQuantity || 0,
      'Dernière Mise à jour': format(new Date(item.updatedAt), 'dd/MM/yyyy HH:mm')
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventaire");
    XLSX.writeFile(workbook, `Inventaire_Stock_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    addNotification('success', 'Export réussi', 'L\'inventaire a été exporté en Excel.');
  };

  const exportHistory = () => {
    const data = movements.map(mov => ({
      'Date': format(new Date(mov.date), 'dd/MM/yyyy HH:mm'),
      'Article': mov.itemName,
      'Type': mov.type === 'in' ? 'Entrée' : 'Sortie',
      'Quantité': mov.quantity,
      'Prix TTC': mov.priceTTC || 0,
      'Motif': mov.reason,
      'Véhicule': mov.vehiclePlate || '-',
      'Utilisateur': mov.userName
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Historique");
    XLSX.writeFile(workbook, `Historique_Mouvements_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    addNotification('success', 'Export réussi', 'L\'historique a été exporté en Excel.');
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion du Stock</h2>
            <p className="text-stone-500 italic serif">Suivez vos pièces, consommables et mouvements de stock.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
          <button
            onClick={() => setActiveTab('inventory')}
            className={clsx(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'inventory' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Inventaire
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={clsx(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === 'history' ? "bg-white text-emerald-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Historique
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
            <button 
              onClick={exportInventory}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <FileText className="w-4 h-4" />
              Inventaire
            </button>
            <button 
              onClick={exportHistory}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-white hover:text-emerald-600 rounded-xl transition-all"
            >
              <History className="w-4 h-4" />
              Historique
            </button>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            Nouvel Article
          </button>
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inventory List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Rechercher un article..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-stone-400" />
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 px-4 py-3"
                >
                  <option value="">Toutes catégories</option>
                  <option value="pieces">Pièces</option>
                  <option value="consommables">Consommables</option>
                  <option value="huiles">Huiles</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Article</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Prix (TTC)</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Quantité</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-400">
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-stone-900">{item.name}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{item.category}</p>
                              {item.description && (
                                <>
                                  <span className="text-stone-300">•</span>
                                  <p className="text-[10px] text-stone-500 italic truncate max-w-[150px]">{item.description}</p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-bold text-stone-900">{item.priceTTC.toFixed(3)} DT <span className="text-[10px] text-stone-400">TTC</span></p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-xs font-bold border",
                            item.quantity <= (item.minQuantity || 0) 
                              ? "bg-red-50 text-red-700 border-red-100" 
                              : "bg-emerald-50 text-emerald-700 border-emerald-100"
                          )}>
                            {item.quantity} {item.unit}
                          </span>
                          {item.quantity <= (item.minQuantity || 0) && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => { setSelectedItem(item); setMovementType('in'); setIsMovementModalOpen(true); }}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                            title="Entrée de stock"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { setSelectedItem(item); setMovementType('out'); setIsMovementModalOpen(true); }}
                            className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"
                            title="Sortie de stock"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { setEditingItem(item); setIsEditModalOpen(true); }}
                            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setDeleteModal({ isOpen: true, id: item.id })}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Movements */}
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-stone-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-stone-400" />
                  Mouvements Récents
                </h3>
              </div>
              <div className="space-y-4">
                {movements.slice(0, 10).map((mov) => (
                  <div key={mov.id} className="flex gap-3 p-3 bg-stone-50 rounded-2xl border border-stone-100">
                    <div className={clsx(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      mov.type === 'in' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                    )}>
                      {mov.type === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-stone-900 truncate">{mov.itemName}</p>
                        <span className="text-[10px] font-bold text-stone-400 tabular-nums">
                          {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-500 mt-0.5 truncate">{mov.reason}</p>
                      {mov.vehiclePlate && (
                        <div className="flex items-center gap-1 mt-1">
                          <Car className="w-3 h-3 text-stone-400" />
                          <span className="text-[10px] font-bold text-emerald-600">{mov.vehiclePlate}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[9px] text-stone-400 font-medium">{format(new Date(mov.date), 'dd/MM HH:mm')}</span>
                        <div className="flex items-center gap-2">
                          {mov.documents && mov.documents.length > 0 && (
                            <div className="flex gap-1">
                              {mov.documents.map((doc, idx) => (
                                <a 
                                  key={idx}
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                  title={doc.name}
                                >
                                  <FileText className="w-3 h-3" />
                                </a>
                              ))}
                            </div>
                          )}
                          <span className="text-[9px] text-stone-400 font-medium">{mov.userName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Rechercher article ou véhicule..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <select
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2"
              >
                <option value="all">Tous les types</option>
                <option value="in">Entrées</option>
                <option value="out">Sorties</option>
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={historyDateRange.start}
                  onChange={(e) => setHistoryDateRange({...historyDateRange, start: e.target.value})}
                  className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2"
                />
                <span className="text-stone-400 text-xs">à</span>
                <input
                  type="date"
                  value={historyDateRange.end}
                  onChange={(e) => setHistoryDateRange({...historyDateRange, end: e.target.value})}
                  className="bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 px-4 py-2"
                />
              </div>
            </div>
            <button
              onClick={exportHistory}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              Exporter l'historique
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Date</th>
                  <th className="px-8 py-4">Article</th>
                  <th className="px-8 py-4">Type</th>
                  <th className="px-8 py-4">Quantité</th>
                  <th className="px-8 py-4">Prix</th>
                  <th className="px-8 py-4">Motif / Véhicule</th>
                  <th className="px-8 py-4">Utilisateur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements
                  .filter(m => {
                    const item = items.find(i => i.id === m.itemId);
                    const vehicle = vehicles.find(v => v.id === m.vehicleId);
                    const matchesSearch = 
                      item?.name.toLowerCase().includes(historySearch.toLowerCase()) ||
                      vehicle?.brand.toLowerCase().includes(historySearch.toLowerCase()) ||
                      vehicle?.model.toLowerCase().includes(historySearch.toLowerCase()) ||
                      m.reason.toLowerCase().includes(historySearch.toLowerCase());
                    
                    const matchesType = historyTypeFilter === 'all' || m.type === historyTypeFilter;
                    
                    const matchesDate = (!historyDateRange.start || m.date >= historyDateRange.start) &&
                                       (!historyDateRange.end || m.date <= historyDateRange.end);
                    
                    return matchesSearch && matchesType && matchesDate;
                  })
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((m) => {
                    const item = items.find(i => i.id === m.itemId);
                    const vehicle = vehicles.find(v => v.id === m.vehicleId);
                    return (
                      <tr key={m.id} className="hover:bg-stone-50/50 transition-all">
                        <td className="px-8 py-5 text-xs text-stone-600">
                          {format(new Date(m.date), 'dd MMM yyyy HH:mm', { locale: fr })}
                        </td>
                        <td className="px-8 py-5">
                          <p className="font-bold text-stone-900">{item?.name || 'Article inconnu'}</p>
                        </td>
                        <td className="px-8 py-5">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                            m.type === 'in' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                          )}>
                            {m.type === 'in' ? 'Entrée' : 'Sortie'}
                          </span>
                        </td>
                        <td className="px-8 py-5 font-bold text-stone-900">
                          {m.type === 'in' ? '+' : '-'}{m.quantity} {item?.unit}
                        </td>
                        <td className="px-8 py-5 text-sm text-stone-600">
                          {m.priceTTC?.toLocaleString()} TND
                        </td>
                        <td className="px-8 py-5">
                          <p className="text-sm text-stone-900">{m.reason}</p>
                          {vehicle && (
                            <p className="text-xs text-stone-400">{vehicle.brand} {vehicle.model} ({vehicle.plate})</p>
                          )}
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-stone-100 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-stone-400" />
                            </div>
                            <span className="text-xs text-stone-600">{m.userName || 'Système'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Nouvel Article</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom de l'article</label>
                  <input
                    type="text"
                    required
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="ex: Huile Moteur 5W40"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                    placeholder="Description de l'article..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Catégorie</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choisir...</option>
                    <option value="pieces">Pièces</option>
                    <option value="consommables">Consommables</option>
                    <option value="huiles">Huiles</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Unité</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({...newItem, unit: e.target.value as 'L' | 'psc'})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="psc">Pièce (psc)</option>
                    <option value="L">Litre (L)</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newItem.priceTTC}
                    onChange={(e) => {
                      const ttc = parseFloat(e.target.value);
                      setNewItem({...newItem, priceTTC: ttc});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur (Optionnel)</label>
                  <input
                    type="text"
                    value={newItem.supplierName}
                    onChange={(e) => setNewItem({...newItem, supplierName: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nom du fournisseur..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Stock Initial</label>
                  <input
                    type="number"
                    required
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Alerte Stock Min.</label>
                  <input
                    type="number"
                    required
                    value={newItem.minQuantity}
                    onChange={(e) => setNewItem({...newItem, minQuantity: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Enregistrement...' : 'Ajouter au Stock'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">Modifier l'Article</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleEditItem} className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nom de l'article</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
                  <textarea
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Catégorie</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choisir...</option>
                    <option value="pieces">Pièces</option>
                    <option value="consommables">Consommables</option>
                    <option value="huiles">Huiles</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Unité</label>
                  <select
                    value={editingItem.unit}
                    onChange={(e) => setEditingItem({...editingItem, unit: e.target.value as 'L' | 'psc'})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="psc">Pièce (psc)</option>
                    <option value="L">Litre (L)</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix TTC (TND)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editingItem.priceTTC}
                    onChange={(e) => {
                      const ttc = parseFloat(e.target.value);
                      setEditingItem({...editingItem, priceTTC: ttc});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Stock Actuel</label>
                  <input
                    type="number"
                    required
                    value={editingItem.quantity}
                    onChange={(e) => setEditingItem({...editingItem, quantity: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Alerte Stock Min.</label>
                  <input
                    type="number"
                    required
                    value={editingItem.minQuantity}
                    onChange={(e) => setEditingItem({...editingItem, minQuantity: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg mt-4"
              >
                Enregistrer les modifications
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {isMovementModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-stone-900">
                {movementType === 'in' ? 'Entrée de Stock' : 'Sortie pour Maintenance'}
              </h3>
              <button onClick={() => setIsMovementModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleMovement} className="p-8 space-y-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 mb-4">
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Article sélectionné</p>
                <p className="font-bold text-stone-900">{selectedItem.name}</p>
                <p className="text-xs text-stone-500">Stock actuel: {selectedItem.quantity} {selectedItem.unit}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Quantité ({selectedItem.unit})</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newMovement.quantity}
                  onChange={(e) => setNewMovement({...newMovement, quantity: parseInt(e.target.value)})}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {movementType === 'in' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fournisseur</label>
                  <input
                    type="text"
                    value={newMovement.supplierName}
                    onChange={(e) => setNewMovement({...newMovement, supplierName: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Nom du fournisseur..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date et Heure</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="datetime-local"
                    required
                    value={newMovement.date}
                    onChange={(e) => setNewMovement({...newMovement, date: e.target.value})}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {movementType === 'out' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule concerné</label>
                  <div className="relative">
                    <Car className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <select
                      required
                      value={newMovement.vehicleId}
                      onChange={(e) => setNewMovement({...newMovement, vehicleId: e.target.value})}
                      className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Sélectionner un véhicule</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.brand} {v.model} - {v.plate}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Motif / Notes</label>
                <textarea
                  required
                  value={newMovement.reason}
                  onChange={(e) => setNewMovement({...newMovement, reason: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                  placeholder={movementType === 'in' ? "ex: Réapprovisionnement fournisseur" : "ex: Vidange moteur"}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Documents (Facture / BL)</label>
                <div className="flex flex-wrap gap-2">
                  {newMovement.documents.map((doc, index) => (
                    <div key={index} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      <span className="truncate max-w-[100px]">{doc.name}</span>
                      <button 
                        type="button"
                        onClick={() => setNewMovement({
                          ...newMovement,
                          documents: newMovement.documents.filter((_, i) => i !== index)
                        })}
                        className="hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex items-center justify-center w-10 h-10 bg-stone-100 rounded-xl cursor-pointer hover:bg-stone-200 transition-colors">
                    <Upload className="w-5 h-5 text-stone-500" />
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>
                {uploading && <p className="text-[10px] text-emerald-600 animate-pulse">Téléchargement en cours...</p>}
              </div>

              <button
                type="submit"
                className={clsx(
                  "w-full py-4 text-white rounded-2xl font-bold transition-all shadow-lg mt-4",
                  movementType === 'in' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                Continuer
              </button>
            </form>
          </div>
        </div>
      )}

      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center animate-in fade-in zoom-in duration-200">
            <div className={clsx(
              "w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6",
              movementType === 'in' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            )}>
              {movementType === 'in' ? <ArrowDownLeft className="w-10 h-10" /> : <ArrowUpRight className="w-10 h-10" />}
            </div>
            <h3 className="text-2xl font-bold text-stone-900 mb-2">Confirmer le mouvement</h3>
            <p className="text-stone-500 italic serif mb-8">
              Êtes-vous sûr de vouloir enregistrer cette {movementType === 'in' ? 'entrée' : 'sortie'} de <span className="font-bold text-stone-900">{newMovement.quantity} {selectedItem?.unit}</span> pour <span className="font-bold text-stone-900">{selectedItem?.name}</span> ?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={confirmMovement}
                disabled={isSaving}
                className="py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg disabled:opacity-50"
              >
                {isSaving ? 'Traitement...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDeleteItem(deleteModal.id)}
        title="Supprimer l'article"
        message="Êtes-vous sûr de vouloir supprimer cet article ? Cette action est irréversible."
      />

      <GuideModal 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        activeTab="stock"
      />
    </div>
  );
}
