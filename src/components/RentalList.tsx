import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Rental, Vehicle, Client, PaymentMethod, VehicleStatus } from '../types';
import { Plus, Search, Calendar, CheckCircle, XCircle, Clock, FileText, User, Car as CarIcon, Printer, Plane, CreditCard, Edit2, Trash2, DollarSign, AlertTriangle, Camera, Upload, Trash, X, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { Receipt } from './Receipt';
import { compressImage } from '../utils/imageCompression';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Download, Filter as FilterIcon, PenTool } from 'lucide-react';
import { DeleteModal } from './DeleteModal';
import { generateContractPDF, generateInvoicePDF } from '../services/pdfService';
import { exportToExcel } from '../services/excelService';
import { useNotifications } from './NotificationContext';
import { useOffice } from '../contexts/OfficeContext';

export function RentalList() {
  const { currentOffice } = useOffice();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [paymentRental, setPaymentRental] = useState<Rental | null>(null);
  const [closureRental, setClosureRental] = useState<Rental | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'reserved' | 'pending_confirmation'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'company' | 'subcontracted'>('all');
  const [selectedRentalForReceipt, setSelectedRentalForReceipt] = useState<{rental: Rental, vehicle?: Vehicle, client: Client, secondDriver?: Client} | null>(null);
  const [swapRental, setSwapRental] = useState<Rental | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, rental: Rental | null }>({ isOpen: false, rental: null });
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!currentOffice) return;

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rentals');
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
    });
    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    return () => {
      unsubRentals();
      unsubVehicles();
      unsubClients();
    };
  }, [currentOffice]);

  useEffect(() => {
    const refreshVehicleStatuses = async () => {
      if (vehicles.length === 0 || rentals.length === 0 || isSaving) return;

      const today = format(new Date(), 'yyyy-MM-dd');
      const vehiclesToUpdate: {id: string, status: VehicleStatus}[] = [];

      for (const vehicle of vehicles) {
        const currentRental = rentals.find(r => 
          r.vehicleId === vehicle.id && 
          r.status !== 'completed' && 
          r.status !== 'cancelled' &&
          today >= r.startDate && today <= r.endDate
        );

        let expectedStatus: VehicleStatus = 'available';
        if (currentRental) {
          expectedStatus = (currentRental.documentType === 'quote' || currentRental.documentType === 'reservation') ? 'reserved' : 'rented';
        }

        // Only update if actually different and not manually set to maintenance
        if (vehicle.status !== expectedStatus && vehicle.status !== 'maintenance') {
          vehiclesToUpdate.push({ id: vehicle.id, status: expectedStatus });
        }
      }

      if (vehiclesToUpdate.length > 0) {
        setIsSaving(true);
        try {
          // Use sequential updates or batch to avoid rate limiting
          for (const item of vehiclesToUpdate) {
            await updateDoc(doc(db, 'vehicles', item.id), { status: item.status });
          }
        } catch (error) {
          console.error("Error auto-updating vehicle statuses:", error);
        } finally {
          setIsSaving(false);
        }
      }
    };

    // Throttle: only run every 5 minutes if something changed, or on initial load
    const lastSync = sessionStorage.getItem('last_status_sync');
    const now = Date.now();
    if (!lastSync || now - parseInt(lastSync) > 5 * 60 * 1000) {
      refreshVehicleStatuses();
      sessionStorage.setItem('last_status_sync', now.toString());
    }
  }, [vehicles.length, rentals.length]);

  const getVehicle = (id: string) => vehicles.find(v => v.id === id);
  const getClient = (id: string) => clients.find(c => c.id === id);

  const handleComplete = (rental: Rental) => {
    setClosureRental(rental);
  };

  const handleConfirmClosure = async (rentalId: string, vehicleId: string, data: any) => {
    setIsSaving(true);
    try {
      const rental = rentals.find(r => r.id === rentalId);
      if (!rental) return;

      const isRefund = data.paidAmount > rental.totalAmount;
      const documentType = isRefund ? 'credit_note' : rental.documentType;

      await updateDoc(doc(db, 'rentals', rentalId), {
        status: 'completed',
        returnDate: data.returnDate,
        returnMileage: data.returnMileage,
        returnFuelLevel: data.returnFuelLevel,
        paymentStatus: data.paymentStatus,
        paidAmount: data.paidAmount,
        documentType,
        washStatus: data.washStatus,
        checkedInBy: data.checkedInBy || auth.currentUser?.displayName || 'Inconnu'
      });
      
      await updateDoc(doc(db, 'vehicles', vehicleId), {
        status: 'available',
        mileage: data.returnMileage,
        washStatus: data.washStatus,
        parkingLocation: data.parkingLocation
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'complete_rental', `Location terminée et véhicule rendu${isRefund ? ' (Avoir généré)' : ''}`, auth.currentUser.displayName || undefined);
      }
      setClosureRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rentalId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmSwap = async (rentalId: string, oldVehicleId: string, data: { newVehicleId: string, reason: string, mileageAtSwap: number }) => {
    setIsSaving(true);
    try {
      const rental = rentals.find(r => r.id === rentalId);
      if (!rental) return;

      const swapEntry = {
        oldVehicleId,
        newVehicleId: data.newVehicleId,
        date: new Date().toISOString(),
        reason: data.reason,
        mileageAtSwap: data.mileageAtSwap
      };

      const updatedSwaps = [...(rental.vehicleSwaps || []), swapEntry];

      // Update Rental
      await updateDoc(doc(db, 'rentals', rentalId), {
        vehicleId: data.newVehicleId,
        vehicleSwaps: updatedSwaps
      });

      // Update Old Vehicle
      await updateDoc(doc(db, 'vehicles', oldVehicleId), {
        status: 'available',
        mileage: data.mileageAtSwap
      });

      // Update New Vehicle
      await updateDoc(doc(db, 'vehicles', data.newVehicleId), {
        status: 'rented'
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'swap_vehicle', `Véhicule échangé pour la location ${rental.contractNumber}`, auth.currentUser.displayName || undefined);
      }
      setSwapRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rentalId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintReceipt = (rental: Rental) => {
    const vehicle = rental.vehicleId ? getVehicle(rental.vehicleId) : undefined;
    let client = getClient(rental.clientId);
    const secondDriver = rental.secondDriverId ? getClient(rental.secondDriverId) : undefined;
    
    // If client document not found, create a virtual client from denormalized data
    if (!client && rental.clientName) {
      client = {
        id: rental.clientId,
        name: rental.clientName,
        phone: rental.clientPhone || '',
        email: rental.clientEmail || '',
        address: '',
        city: '',
        customerType: 'individual',
        licenseNumber: '',
        licenseExpiry: '',
        category: 'regular',
        loyaltyPoints: 0,
        loyaltyStatus: 'bronze',
        officeId: rental.officeId
      } as Client;
    }

    if (client) {
      setSelectedRentalForReceipt({ rental, vehicle, client, secondDriver });
    }
  };

  const handleDelete = async (rental: Rental) => {
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'rentals', rental.id));
      // If it was active or reserved, make vehicle available again
      if ((rental.status === 'active' || rental.status === 'reserved') && rental.vehicleId) {
        await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
      }
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_rental', `Location supprimée pour ${getClient(rental.clientId)?.name}`, auth.currentUser.displayName || undefined);
      }
      setDeleteModal({ isOpen: false, rental: null });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePayment = async (rental: Rental, amount: number) => {
    setIsSaving(true);
    try {
      const newPaidAmount = (rental.paidAmount || 0) + amount;
      const newStatus = newPaidAmount >= rental.totalAmount ? 'paid' : 'partial';
      
      await updateDoc(doc(db, 'rentals', rental.id), {
        paidAmount: newPaidAmount,
        paymentStatus: newStatus
      });
      
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'update_payment', `Paiement de ${amount} TND reçu pour la location ${rental.contractNumber}`, auth.currentUser.displayName || undefined);
      }
      setPaymentRental(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
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
        message: `Votre réservation pour le véhicule ${getVehicle(rental.vehicleId)?.brand} ${getVehicle(rental.vehicleId)?.model} a été confirmée.`,
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        userId: rental.clientId // Assuming clientId is the user's UID for website clients
      });

      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'confirm_reservation', `Réservation confirmée pour ${getClient(rental.clientId)?.name}`, auth.currentUser.displayName || undefined);
      }
      addNotification('success', 'Réservation confirmée', 'Le client a été notifié.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rentals/${rental.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportRentals = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Client,Véhicule,Montant,Statut\n"
      + rentals.map(r => {
        const c = getClient(r.clientId);
        const v = getVehicle(r.vehicleId);
        return `${r.startDate},${c?.name},${v?.brand} ${v?.model},${r.totalAmount},${r.status}`;
      }).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `locations_dhokkar_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const data = rentals.map(r => {
      const c = getClient(r.clientId);
      const v = getVehicle(r.vehicleId);
      return {
        'Date': r.startDate,
        'Client': c?.name || 'Inconnu',
        'Véhicule': `${v?.brand} ${v?.model}`,
        'Montant Total': r.totalAmount,
        'Montant Payé': r.paidAmount,
        'Reste': r.totalAmount - r.paidAmount,
        'Statut': r.status,
        'Paiement': r.paymentStatus
      };
    });
    exportToExcel(data, `rapport_locations_${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const downloadPDF = async (rental: Rental, type: 'contract' | 'invoice') => {
    let client = getClient(rental.clientId);
    const vehicle = rental.vehicleId ? getVehicle(rental.vehicleId) : undefined;
    const secondDriver = rental.secondDriverId ? getClient(rental.secondDriverId) : undefined;
    
    // If client document not found, create a virtual client from denormalized data
    if (!client && rental.clientName) {
      client = {
        id: rental.clientId,
        name: rental.clientName,
        phone: rental.clientPhone || '',
        email: rental.clientEmail || '',
        address: '',
        city: '',
        customerType: 'individual',
        licenseNumber: '',
        licenseExpiry: '',
        category: 'regular',
        loyaltyPoints: 0,
        loyaltyStatus: 'bronze',
        officeId: rental.officeId
      } as Client;
    }
    
    if (client) {
      const settingsDoc = await getDoc(doc(db, 'settings', 'system'));
      const settings = settingsDoc.exists() ? settingsDoc.data() as any : undefined;

      if (type === 'contract') {
        generateContractPDF(rental, vehicle, client, settings, secondDriver);
      } else {
        generateInvoicePDF(rental, vehicle, client, settings);
      }
    }
  };

  const filteredRentals = rentals.filter(rental => {
    if (statusFilter !== 'all' && rental.status !== statusFilter) return false;
    const vehicle = getVehicle(rental.vehicleId || '');
    const client = getClient(rental.clientId);
    
    const matchesSearch = `${vehicle?.brand} ${vehicle?.model} ${client?.name || rental.clientName || ''} ${rental.clientPhone || ''} ${rental.clientEmail || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOwnership = ownershipFilter === 'all' || 
      (ownershipFilter === 'company' && vehicle && !vehicle.isSubcontracted) ||
      (ownershipFilter === 'subcontracted' && vehicle && vehicle.isSubcontracted);
    
    return matchesSearch && matchesOwnership;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Locations</h2>
            <p className="text-stone-500 italic serif">Suivi des contrats et réservations en cours.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Nouvelle location
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher une location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending_confirmation">En attente</option>
              <option value="reserved">Réservées</option>
              <option value="active">Actives</option>
              <option value="completed">Terminées</option>
            </select>
            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as any)}
              className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les véhicules</option>
              <option value="company">Ma Société</option>
              <option value="subcontracted">Sous-traitance</option>
            </select>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={exportRentals}
              className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-stone-800 transition-all"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <th className="px-8 py-4">Client & Véhicule</th>
                <th className="px-8 py-4">Agent (Sortie)</th>
                <th className="px-8 py-4">Agent (Entrée)</th>
                <th className="px-8 py-4">Créé le</th>
                <th className="px-8 py-4">Période</th>
                <th className="px-8 py-4">Document</th>
                <th className="px-8 py-4">Paiement</th>
                <th className="px-8 py-4">Remise</th>
                <th className="px-8 py-4">Total</th>
                <th className="px-8 py-4">Reste</th>
                <th className="px-8 py-4">Statut</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredRentals.map((rental) => (
                <tr key={rental.id} className="hover:bg-stone-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-0.5">
                          <User className="w-3 h-3 text-emerald-600" />
                          <span className="font-bold text-stone-900">{getClient(rental.clientId)?.name || rental.clientName || 'Inconnu'}</span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold uppercase">P1</span>
                          {(rental as any).isTransfer && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1">
                              <Plane className="w-2 h-2" />
                              Transfert
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-stone-400 ml-5">
                          <span>Tél: {getClient(rental.clientId)?.phone || rental.clientPhone || '-'}</span>
                          <span>Permis: {getClient(rental.clientId)?.licenseNumber || '-'}</span>
                        </div>
                      </div>
                      
                      {rental.secondDriverId && (
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-0.5">
                            <User className="w-3 h-3 text-blue-600" />
                            <span className="text-sm font-medium text-stone-700">{getClient(rental.secondDriverId)?.name || 'Inconnu'}</span>
                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase">P2</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-stone-400 ml-5">
                            <span>Tél: {getClient(rental.secondDriverId)?.phone}</span>
                            <span>Permis: {getClient(rental.secondDriverId)?.licenseNumber}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1 border-t border-stone-100 pt-1">
                        <CarIcon className="w-3 h-3 text-stone-400" />
                        <span className="text-sm text-stone-500">{getVehicle(rental.vehicleId)?.brand} {getVehicle(rental.vehicleId)?.model || 'Inconnu'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-emerald-600" />
                      <span className="text-sm font-medium text-stone-900">{rental.checkedOutBy || rental.agentName || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-blue-600" />
                      <span className="text-sm font-medium text-stone-900">{rental.checkedInBy || '-'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {rental.createdAt && (
                      <div className="flex items-center gap-2 text-xs text-stone-400">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(rental.createdAt), 'dd/MM/yy HH:mm', { locale: fr })}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Calendar className="w-4 h-4 text-stone-400" />
                        <span>{format(new Date(rental.startDate), 'dd MMM', { locale: fr })} - {format(new Date(rental.endDate), 'dd MMM yyyy', { locale: fr })}</span>
                      </div>
                      {rental.status === 'active' && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                          <Clock className="w-3 h-3" />
                          Retour prévu: {format(new Date(rental.endDate), 'dd/MM/yyyy')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
                      rental.documentType === 'quote' ? 'bg-stone-100 text-stone-600 border-stone-200' :
                      rental.documentType === 'credit_note' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                      'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {rental.documentType === 'quote' ? 'Devis' : 
                       rental.documentType === 'credit_note' ? 'Avoir' : 'Facture'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 px-2 py-1 rounded-md text-stone-600 w-fit">
                        {rental.paymentMethod}
                      </span>
                      <PaymentStatusBadge status={rental.paymentStatus} />
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {rental.discountAmount ? (
                      <div className="flex flex-col">
                        <span className="font-bold text-emerald-600">
                          -{rental.discountAmount.toLocaleString()} {rental.discountType === 'percentage' ? '%' : 'TND'}
                        </span>
                        {rental.discountType === 'percentage' && (
                          <span className="text-[10px] text-emerald-500 font-medium">
                            ({((rental.dailyRate * rental.totalDays) * (rental.discountAmount / 100)).toLocaleString()} TND)
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 uppercase tracking-tighter">
                          {rental.discountType === 'percentage' ? 'Pourcentage' : 'Fixe'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-stone-300">-</span>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <p className="font-bold text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</p>
                    <p className="text-[10px] text-stone-400 uppercase tracking-tighter">TTC</p>
                  </td>
                  <td className="px-8 py-5">
                    <p className={clsx(
                      "font-bold",
                      ((rental.totalAmount || 0) - (rental.paidAmount || 0)) > 0 ? "text-red-600" : "text-emerald-600"
                    )}>
                      {((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND
                    </p>
                  </td>
                  <td className="px-8 py-5">
                    <RentalStatusBadge status={rental.status} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => downloadPDF(rental, 'contract')}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                        title="Télécharger Contrat"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => downloadPDF(rental, 'invoice')}
                        className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                        title="Télécharger Facture"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      {rental.status === 'pending_confirmation' && (
                        <button 
                          onClick={() => handleConfirmReservation(rental)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Confirmer la réservation"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => handlePrintReceipt(rental)}
                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                        title="Voir le reçu"
                      >
                        <Printer className="w-5 h-5" />
                      </button>
                      {rental.paymentStatus !== 'paid' && (
                        <button 
                          onClick={() => setPaymentRental(rental)}
                          className="p-2 hover:bg-amber-50 text-amber-600 rounded-lg transition-all"
                          title="Enregistrer un paiement"
                        >
                          <CreditCard className="w-5 h-5" />
                        </button>
                      )}
                      {rental.status === 'active' && (
                        <button 
                          onClick={() => setSwapRental(rental)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                          title="Échanger le véhicule"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                      )}
                      {rental.status === 'active' && (
                        <button 
                          onClick={() => handleComplete(rental)}
                          className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                          title="Terminer la location"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => { setEditingRental(rental); setIsModalOpen(true); }}
                        className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteModal({ isOpen: true, rental })}
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
        <RentalModal 
          isOpen={isModalOpen} 
          onClose={() => { setIsModalOpen(false); setEditingRental(null); }} 
          vehicles={vehicles}
          clients={clients}
          rentals={rentals}
          rental={editingRental}
        />
      )}

      {paymentRental && (
        <PaymentModal
          rental={paymentRental}
          isSaving={isSaving}
          onClose={() => setPaymentRental(null)}
          onConfirm={(amount) => handleUpdatePayment(paymentRental, amount)}
        />
      )}

      {closureRental && (
        <RentalClosureModal
          rental={closureRental}
          vehicle={getVehicle(closureRental.vehicleId)!}
          isSaving={isSaving}
          onClose={() => setClosureRental(null)}
          onConfirm={(data) => handleConfirmClosure(closureRental.id, closureRental.vehicleId, data)}
        />
      )}

      {swapRental && (
        <VehicleSwapModal
          rental={swapRental}
          currentVehicle={getVehicle(swapRental.vehicleId)!}
          availableVehicles={vehicles.filter(v => v.status === 'available')}
          isSaving={isSaving}
          onClose={() => setSwapRental(null)}
          onConfirm={(data) => handleConfirmSwap(swapRental.id, swapRental.vehicleId!, data)}
        />
      )}

      {selectedRentalForReceipt && (
        <Receipt 
          rental={selectedRentalForReceipt.rental}
          vehicle={selectedRentalForReceipt.vehicle}
          client={selectedRentalForReceipt.client}
          secondDriver={selectedRentalForReceipt.secondDriver}
          onClose={() => setSelectedRentalForReceipt(null)}
        />
      )}

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Locations & Réservations</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. Création de Contrat</p>
                <p className="text-sm">Cliquez sur "Nouvelle Location" pour créer un contrat. Vous pouvez choisir entre Facture, Devis ou Réservation.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Gestion des Paiements</p>
                <p className="text-sm">Les paiements sont suivis dans l'onglet "Comptabilité". Un contrat peut être payé totalement, partiellement ou rester impayé.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">3. Documents</p>
                <p className="text-sm">Vous pouvez imprimer le contrat ou la facture à tout moment via les boutons d'action.</p>
              </div>
            </div>
            <div className="p-8 bg-stone-50 border-t border-stone-100">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, rental: null })}
        onConfirm={() => deleteModal.rental && handleDelete(deleteModal.rental)}
        title="Supprimer la location"
        message="Êtes-vous sûr de vouloir supprimer cette location ? Cette action est irréversible et supprimera tout l'historique de paiement associé."
      />
    </div>
  );
}

function RentalStatusBadge({ status }: { status: Rental['status'] }) {
  const styles = {
    pending_confirmation: "bg-blue-50 text-blue-700 border-blue-100",
    reserved: "bg-amber-50 text-amber-700 border-amber-100",
    active: "bg-blue-50 text-blue-700 border-blue-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cancelled: "bg-red-50 text-red-700 border-red-100"
  };
  const labels = {
    pending_confirmation: "En attente",
    reserved: "Réservée",
    active: "En cours",
    completed: "Terminée",
    cancelled: "Annulée"
  };
  const icons = {
    pending_confirmation: Clock,
    reserved: Calendar,
    active: Clock,
    completed: CheckCircle,
    cancelled: XCircle
  };
  const Icon = icons[status];

  return (
    <span className={clsx("px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 w-fit", styles[status])}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: Rental['paymentStatus'] }) {
  const styles = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    partial: "bg-amber-50 text-amber-700 border-amber-100",
    pending: "bg-red-50 text-red-700 border-red-100"
  };
  const labels = {
    paid: "Payé",
    partial: "Partiel",
    pending: "Impayé"
  };
  const icons = {
    paid: CheckCircle,
    partial: Clock,
    pending: AlertTriangle
  };
  const Icon = icons[status];
  
  return (
    <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit flex items-center gap-1", styles[status])}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </span>
  );
}

export function RentalModal({ isOpen, onClose, vehicles, clients, rentals, rental }: { isOpen: boolean, onClose: () => void, vehicles: Vehicle[], clients: Client[], rentals: Rental[], rental?: Rental | null }) {
  const { addNotification } = useNotifications();
  const { currentOffice } = useOffice();
  const [isSaving, setIsSaving] = useState(false);
  const initialVehicle = vehicles.find(v => v.id === (rental?.vehicleId || ''));

  const [formData, setFormData] = useState({
    contractNumber: rental?.contractNumber || '',
    vehicleId: rental?.vehicleId || '',
    clientId: rental?.clientId || '',
    clientName: rental?.clientName || '',
    clientPhone: rental?.clientPhone || '',
    clientEmail: rental?.clientEmail || '',
    secondDriverId: rental?.secondDriverId || '',
    startDate: rental?.startDate || format(new Date(), 'yyyy-MM-dd'),
    endDate: rental?.endDate || format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'),
    pickupLocation: rental?.pickupLocation || 'Agence',
    returnLocation: rental?.returnLocation || 'Agence',
    depositAmount: rental?.depositAmount || 500,
    paymentMethod: rental?.paymentMethod || 'cash' as PaymentMethod,
    documentType: rental?.documentType || 'invoice' as Rental['documentType'],
    paymentStatus: rental?.paymentStatus || 'pending' as Rental['paymentStatus'],
    paidAmount: rental?.paidAmount || 0,
    taxRate: rental?.taxRate || 19,
    checkedOutBy: rental?.checkedOutBy || auth.currentUser?.displayName || '',
    manualTotalAmount: rental?.totalAmount || 0,
    dailyRate: rental?.dailyRate || initialVehicle?.pricePerDay || 0,
    withChauffeur: rental?.withChauffeur || false,
    chauffeurPrice: rental?.chauffeurPrice || 0,
    discountAmount: rental?.discountAmount || 0,
    discountType: rental?.discountType || 'fixed' as 'percentage' | 'fixed',
    fuelLevel: rental?.fuelLevel || 100,
    washStatus: rental?.washStatus || 'clean' as 'clean' | 'dirty',
    vehiclePhotos: rental?.vehiclePhotos || {
      front: '',
      back: '',
      left: '',
      right: ''
    }
  });

  const [clientSearch, setClientSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [activeSection, setActiveSection] = useState<'info' | 'period' | 'photos'>('info');

  const filteredClientsForSelect = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const filteredVehiclesForSelect = vehicles.filter(v => 
    `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(vehicleSearch.toLowerCase())
  );
  
  // Update dailyRate if vehicle changes and it's a new rental or dailyRate was 0
  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);

  useEffect(() => {
    if (selectedVehicle && (!rental || formData.dailyRate === 0)) {
      setFormData(prev => ({ ...prev, dailyRate: selectedVehicle.pricePerDay }));
    }
  }, [formData.vehicleId, selectedVehicle]);

  const days = differenceInDays(new Date(formData.endDate), new Date(formData.startDate)) || 1;
  
  // Calculate subtotal based on dailyRate and days
  const subtotal = (formData.dailyRate * days) + (formData.withChauffeur ? (formData.chauffeurPrice * days) : 0);
  
  // Calculate discount
  const discount = formData.discountType === 'percentage' 
    ? (subtotal * (formData.discountAmount / 100)) 
    : formData.discountAmount;
    
  const amountAfterDiscount = subtotal - discount;
  
  // Calculate total (dailyRate is already TTC)
  const calculatedTotalAmount = amountAfterDiscount;

  const isVehicleBusyDuringPeriod = (vId: string, start: string, end: string, excludeId?: string) => {
    return rentals.some(r => 
      r.vehicleId === vId && 
      r.id !== excludeId &&
      r.status !== 'completed' &&
      r.status !== 'cancelled' &&
      ((start >= r.startDate && start <= r.endDate) || 
       (end >= r.startDate && end <= r.endDate) ||
       (start <= r.startDate && end >= r.endDate))
    );
  };

  const isCurrentPeriod = (start: string, end: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return today >= start && today <= end;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId || (formData.documentType !== 'reservation' && !formData.vehicleId)) return;

    // Overlap check
    if (formData.vehicleId) {
      const isBusy = isVehicleBusyDuringPeriod(formData.vehicleId, formData.startDate, formData.endDate, rental?.id);
      if (isBusy) {
        addNotification('error', 'Doublage de réservation', 'Ce véhicule est déjà réservé ou loué pour la période sélectionnée.');
        return;
      }
    }

    // Contract number duplicate check
    if (formData.contractNumber) {
      const duplicateContract = rentals.find(r => r.contractNumber === formData.contractNumber && r.id !== rental?.id);
      if (duplicateContract) {
        addNotification('error', 'Doublage de document', `Le numéro de contrat/devis "${formData.contractNumber}" est déjà utilisé.`);
        return;
      }
    }

    const finalTotalAmount = formData.vehicleId ? calculatedTotalAmount : formData.manualTotalAmount;

    setIsSaving(true);
    try {
      if (rental) {
        // Update existing rental
        await updateDoc(doc(db, 'rentals', rental.id), {
          ...formData,
          subtotal,
          totalDays: days,
          taxAmount: finalTotalAmount - (finalTotalAmount / (1 + (formData.taxRate / 100))),
          totalAmount: finalTotalAmount,
          status: (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'active',
        });
        
        // Handle vehicle status changes
        if (formData.vehicleId && rental.vehicleId !== formData.vehicleId) {
          // Vehicle changed or added
          if (rental.vehicleId) {
            await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
          }
          
          if (isCurrentPeriod(formData.startDate, formData.endDate)) {
            const newStatus = (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'rented';
            await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: newStatus });
          }
        } else if (!formData.vehicleId && rental.vehicleId) {
          // Vehicle removed
          await updateDoc(doc(db, 'vehicles', rental.vehicleId), { status: 'available' });
        } else if (formData.vehicleId) {
          // Same vehicle: check if documentType changed status AND if it's current
          const oldIsReserved = rental.documentType === 'quote' || rental.documentType === 'reservation';
          const newIsReserved = formData.documentType === 'quote' || formData.documentType === 'reservation';
          
          if (isCurrentPeriod(formData.startDate, formData.endDate)) {
            if (oldIsReserved && !newIsReserved) {
              await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'rented' });
            } else if (!oldIsReserved && newIsReserved) {
              await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'reserved' });
            }
          } else {
            // Not current period anymore (maybe dates changed)
            await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: 'available' });
          }
        }
        
        if (auth.currentUser) {
          const clientName = clients.find(c => c.id === formData.clientId)?.name || formData.clientName;
          logActivity(auth.currentUser.uid, 'edit_rental', `Location modifiée pour ${clientName}`, auth.currentUser.displayName || undefined);
        }
      } else {
        // Create new rental
        const docRef = await addDoc(collection(db, 'rentals'), {
          ...formData,
          subtotal,
          totalDays: days,
          taxAmount: finalTotalAmount - (finalTotalAmount / (1 + (formData.taxRate / 100))),
          totalAmount: finalTotalAmount,
          userId: auth.currentUser?.uid || '',
          agentName: auth.currentUser?.displayName || null,
          checkedOutBy: auth.currentUser?.displayName || null,
          status: (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'active',
          createdAt: new Date().toISOString(),
          officeId: currentOffice?.id
        });
        
        // Add automatic notification
        const clientName = clients.find(c => c.id === formData.clientId)?.name || formData.clientName;
        const vehicle = vehicles.find(v => v.id === formData.vehicleId);
        await addDoc(collection(db, 'notifications'), {
          title: formData.documentType === 'quote' ? 'Nouveau Devis' : (formData.documentType === 'reservation' ? 'Nouvelle Réservation' : 'Nouvelle Location'),
          message: `${clientName} a ${formData.documentType === 'quote' ? 'demandé un devis pour' : (formData.documentType === 'reservation' ? 'réservé' : 'loué')} ${vehicle ? `le véhicule ${vehicle.brand} ${vehicle.model}` : 'un service'}`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
          isManual: false,
          officeId: currentOffice?.id
        });

        // Set vehicle status if selected and period includes today
        if (formData.vehicleId && isCurrentPeriod(formData.startDate, formData.endDate)) {
          const vehicleStatus = (formData.documentType === 'quote' || formData.documentType === 'reservation') ? 'reserved' : 'rented';
          await updateDoc(doc(db, 'vehicles', formData.vehicleId), { status: vehicleStatus });
        }

        if (auth.currentUser) {
          logActivity(auth.currentUser.uid, 'add_rental', `Nouvelle location créée pour ${clientName}`, auth.currentUser.displayName || undefined);
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, rental ? OperationType.UPDATE : OperationType.CREATE, 'rentals');
    } finally {
      setIsSaving(false);
    }
  };

  const generateContractNumber = () => {
    const prefix = formData.documentType === 'quote' ? 'DEV' : (formData.documentType === 'reservation' ? 'RES' : 'CON');
    const year = new Date().getFullYear();
    const count = rentals.filter(r => r.createdAt && new Date(r.createdAt).getFullYear() === year).length + 1;
    const number = count.toString().padStart(4, '0');
    setFormData({ ...formData, contractNumber: `${prefix}-${year}-${number}` });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-stone-900">{rental ? 'Modifier la Location' : 'Nouvelle Location'}</h3>
            <div className="flex gap-4 mt-2">
              <button 
                type="button"
                onClick={() => setActiveSection('info')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'info' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Informations
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('period')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'period' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Période & Tarifs
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('photos')}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === 'photos' ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Photos
              </button>
              <button 
                type="button"
                onClick={() => setActiveSection('documents' as any)}
                className={clsx("text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all", activeSection === ('documents' as any) ? "border-emerald-500 text-emerald-600" : "border-transparent text-stone-400")}
              >
                Documents Client
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto flex-1">
            {activeSection === 'info' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">N° de Document / Contrat</label>
                  <div className="flex gap-2">
                    <input
                      required
                      placeholder="Ex: CON-2024-001"
                      value={formData.contractNumber}
                      onChange={(e) => setFormData({...formData, contractNumber: e.target.value})}
                      className="flex-1 px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={generateContractNumber}
                      className="px-4 py-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all text-xs font-bold"
                    >
                      Auto
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Client</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400" />
                    <input 
                      type="text"
                      placeholder="Rechercher un client..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm mb-2"
                    />
                    <select
                      required
                      value={formData.clientId}
                      onChange={(e) => {
                        const client = clients.find(c => c.id === e.target.value);
                        setFormData({
                          ...formData, 
                          clientId: e.target.value,
                          clientName: client?.name || formData.clientName,
                          clientPhone: client?.phone || formData.clientPhone,
                          clientEmail: client?.email || formData.clientEmail
                        });
                      }}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Sélectionner le conducteur principal</option>
                      {filteredClientsForSelect.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Denormalized Client Info (Visible if no client doc or for web bookings) */}
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Coordonnées Client (Auto-rempli)</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <input
                      placeholder="Nom complet"
                      value={formData.clientName}
                      onChange={(e) => setFormData({...formData, clientName: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        placeholder="Téléphone"
                        value={formData.clientPhone}
                        onChange={(e) => setFormData({...formData, clientPhone: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                      />
                      <input
                        placeholder="Email"
                        value={formData.clientEmail}
                        onChange={(e) => setFormData({...formData, clientEmail: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-stone-100 rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">2ème Conducteur (Optionnel)</label>
                  <select
                    value={formData.secondDriverId}
                    onChange={(e) => setFormData({...formData, secondDriverId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Aucun conducteur additionnel</option>
                    {filteredClientsForSelect.filter(c => c.id !== formData.clientId).map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Véhicule {formData.documentType !== 'reservation' && <span className="text-red-500">*</span>}</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-stone-400" />
                    <input 
                      type="text"
                      placeholder="Rechercher un véhicule..."
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-100 rounded-xl text-sm mb-2"
                    />
                    <select
                      required={formData.documentType !== 'reservation'}
                      value={formData.vehicleId}
                      onChange={(e) => setFormData({...formData, vehicleId: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{formData.documentType === 'reservation' ? 'Aucun véhicule (Optionnel)' : 'Sélectionner un véhicule'}</option>
                      {filteredVehiclesForSelect.map(v => {
                        const isBusy = isVehicleBusyDuringPeriod(v.id, formData.startDate, formData.endDate, rental?.id);
                        return (
                          <option key={v.id} value={v.id} disabled={isBusy && v.id !== rental?.vehicleId}>
                            {v.brand} {v.model} ({v.plate}) - {v.pricePerDay} TND/j
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type de Document</label>
                  <select
                    required
                    value={formData.documentType}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setFormData({
                        ...formData, 
                        documentType: newType,
                        paidAmount: newType === 'quote' ? 0 : formData.paidAmount,
                        paymentStatus: newType === 'quote' ? 'pending' : formData.paymentStatus
                      });
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="invoice">Facture</option>
                    <option value="quote">Devis</option>
                    <option value="reservation">Réservation</option>
                    <option value="credit_note">Avoir</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Agent (Sortie)</label>
                  <input
                    type="text"
                    required
                    value={formData.checkedOutBy}
                    onChange={(e) => setFormData({...formData, checkedOutBy: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Niveau de Carburant (%)</label>
                  <select
                    value={formData.fuelLevel}
                    onChange={(e) => setFormData({...formData, fuelLevel: Number(e.target.value)})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={0}>0% (Vide)</option>
                    <option value={12.5}>1/8 (12.5%)</option>
                    <option value={25}>1/4 (25%)</option>
                    <option value={37.5}>3/8 (37.5%)</option>
                    <option value={50}>1/2 (50%)</option>
                    <option value={62.5}>5/8 (62.5%)</option>
                    <option value={75}>3/4 (75%)</option>
                    <option value={87.5}>7/8 (87.5%)</option>
                    <option value={100}>100% (Plein)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">État de Lavage (Départ)</label>
                  <select
                    value={formData.washStatus}
                    onChange={(e) => setFormData({...formData, washStatus: e.target.value as any})}
                    className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="clean">Propre</option>
                    <option value="dirty">Sale</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'period' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Début</label>
                    <input
                      type="date"
                      required
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Fin</label>
                    <input
                      type="date"
                      required
                      value={formData.endDate}
                      onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Lieu de départ</label>
                    <input
                      type="text"
                      value={formData.pickupLocation}
                      onChange={(e) => setFormData({...formData, pickupLocation: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Lieu de retour</label>
                    <input
                      type="text"
                      value={formData.returnLocation}
                      onChange={(e) => setFormData({...formData, returnLocation: e.target.value})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Prix Journalier (TND)</label>
                    <input
                      type="number"
                      required
                      value={formData.dailyRate}
                      onChange={(e) => setFormData({...formData, dailyRate: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Caution (TND)</label>
                    <input
                      type="number"
                      value={formData.depositAmount}
                      onChange={(e) => setFormData({...formData, depositAmount: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Avec Chauffeur</label>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, withChauffeur: !formData.withChauffeur})}
                      className={clsx(
                        "w-12 h-6 rounded-full transition-all relative",
                        formData.withChauffeur ? "bg-emerald-600" : "bg-stone-300"
                      )}
                    >
                      <div className={clsx(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        formData.withChauffeur ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>
                  {formData.withChauffeur && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Prix Chauffeur / Jour (TND)</label>
                      <input
                        type="number"
                        value={formData.chauffeurPrice}
                        onChange={(e) => setFormData({...formData, chauffeurPrice: Number(e.target.value)})}
                        className="w-full px-4 py-2 bg-white border border-emerald-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                        placeholder="Ex: 50"
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Remise</label>
                    <input
                      type="number"
                      value={formData.discountAmount}
                      onChange={(e) => setFormData({...formData, discountAmount: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type Remise</label>
                    <select
                      value={formData.discountType}
                      onChange={(e) => setFormData({...formData, discountType: e.target.value as any})}
                      className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="fixed">Fixe (TND)</option>
                      <option value="percentage">Pourcentage (%)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'photos' && (
              <div className="space-y-6 col-span-full">
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Photos du véhicule (État des lieux)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { key: 'front', label: 'Avant' },
                      { key: 'back', label: 'Arrière' },
                      { key: 'left', label: 'Gauche' },
                      { key: 'right', label: 'Droite' }
                    ].map((view) => (
                      <div key={view.key} className="relative aspect-video bg-stone-100 rounded-xl overflow-hidden border border-stone-200 group">
                        {formData.vehiclePhotos[view.key as keyof typeof formData.vehiclePhotos] ? (
                          <>
                            <img src={formData.vehiclePhotos[view.key as keyof typeof formData.vehiclePhotos]} alt={view.label} className="w-full h-full object-cover" />
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, vehiclePhotos: { ...prev.vehiclePhotos, [view.key]: '' } }))}
                              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-stone-400">
                            <Camera className="w-6 h-6 mb-1" />
                            <span className="text-[10px] uppercase font-bold">{view.label}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="file"
                      id="multi-photo-upload"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        const keys = ['front', 'back', 'left', 'right'] as const;
                        for (let i = 0; i < Math.min(files.length, 4); i++) {
                          try {
                            const compressed = await compressImage(files[i], 800, 800, 0.7);
                            setFormData(prev => ({
                              ...prev,
                              vehiclePhotos: { ...prev.vehiclePhotos, [keys[i]]: compressed }
                            }));
                          } catch (err) { console.error(err); }
                        }
                      }}
                    />
                    <label
                      htmlFor="multi-photo-upload"
                      className="flex items-center gap-2 bg-white border border-stone-200 text-stone-700 px-6 py-3 rounded-2xl font-bold hover:bg-stone-50 transition-all cursor-pointer shadow-sm"
                    >
                      <Upload className="w-5 h-5 text-emerald-600" />
                      Parcourir l'appareil
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeSection === ('documents' as any) && (
              <div className="space-y-6 col-span-full">
                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Documents d'identité du client</h4>
                  {rental || clients.find(c => c.id === formData.clientId) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">CIN / Passeport ({rental?.clientCIN || clients.find(c => c.id === formData.clientId)?.cin})</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Recto</p>
                            <div className="aspect-[4/3] bg-stone-100 rounded-xl overflow-hidden border border-stone-200">
                              {(rental?.clientDocs?.cinRecto || clients.find(c => c.id === formData.clientId)?.cinRecto) ? (
                                <img src={rental?.clientDocs?.cinRecto || clients.find(c => c.id === formData.clientId)?.cinRecto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : <div className="w-full h-full flex items-center justify-center text-stone-300"><Camera className="w-6 h-6" /></div>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Verso</p>
                            <div className="aspect-[4/3] bg-stone-100 rounded-xl overflow-hidden border border-stone-200">
                              {(rental?.clientDocs?.cinVerso || clients.find(c => c.id === formData.clientId)?.cinVerso) ? (
                                <img src={rental?.clientDocs?.cinVerso || clients.find(c => c.id === formData.clientId)?.cinVerso} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : <div className="w-full h-full flex items-center justify-center text-stone-300"><Camera className="w-6 h-6" /></div>}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-stone-900 uppercase tracking-widest">Permis de conduire ({rental?.clientLicense || clients.find(c => c.id === formData.clientId)?.licenseNumber})</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Recto</p>
                            <div className="aspect-[4/3] bg-stone-100 rounded-xl overflow-hidden border border-stone-200">
                              {(rental?.clientDocs?.licenseRecto || clients.find(c => c.id === formData.clientId)?.licenseRecto) ? (
                                <img src={rental?.clientDocs?.licenseRecto || clients.find(c => c.id === formData.clientId)?.licenseRecto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : <div className="w-full h-full flex items-center justify-center text-stone-300"><Camera className="w-6 h-6" /></div>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Verso</p>
                            <div className="aspect-[4/3] bg-stone-100 rounded-xl overflow-hidden border border-stone-200">
                              {(rental?.clientDocs?.licenseVerso || clients.find(c => c.id === formData.clientId)?.licenseVerso) ? (
                                <img src={rental?.clientDocs?.licenseVerso || clients.find(c => c.id === formData.clientId)?.licenseVerso} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : <div className="w-full h-full flex items-center justify-center text-stone-300"><Camera className="w-6 h-6" /></div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-stone-400 italic">
                      Veuillez sélectionner un client pour voir ses documents.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-stone-50 p-8 rounded-3xl flex flex-col justify-between border border-stone-100 h-fit sticky top-0">
              <div>
                <h4 className="text-sm font-bold text-stone-400 uppercase tracking-widest mb-6">Récapitulatif</h4>
                <div className="space-y-4">
                  <div className="flex justify-between text-stone-600">
                    <span>Durée</span>
                    <span className="font-bold">{days} jours</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Prix journalier</span>
                    <span className="font-bold">{formData.dailyRate} TND</span>
                  </div>
                  {formData.withChauffeur && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Chauffeur ({days}j x {formData.chauffeurPrice} TND)</span>
                      <span className="font-bold">+{formData.chauffeurPrice * days} TND</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Remise</span>
                      <span className="font-bold">-{discount.toLocaleString()} TND</span>
                    </div>
                  )}
                  <div className="h-px bg-stone-200 my-4" />
                  <div className="flex justify-between text-stone-900">
                    <span className="font-medium">Total TTC</span>
                    {formData.vehicleId ? (
                      <span className="text-2xl font-bold text-emerald-600">{(calculatedTotalAmount || 0).toLocaleString()} TND</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={formData.manualTotalAmount}
                          onChange={(e) => setFormData({...formData, manualTotalAmount: Number(e.target.value)})}
                          className="w-24 px-2 py-1 bg-white border border-stone-200 rounded text-right font-bold text-emerald-600 focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-emerald-600">TND</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving || !formData.clientId || (formData.documentType !== 'reservation' && !formData.vehicleId)}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-8"
              >
                {isSaving ? 'Enregistrement...' : (rental ? 'Enregistrer' : 'Confirmer')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ rental, onClose, onConfirm, isSaving }: { rental: Rental, onClose: () => void, onConfirm: (amount: number) => void, isSaving: boolean }) {
  const [amount, setAmount] = useState(rental.totalAmount - (rental.paidAmount || 0));
  const [operationType, setOperationType] = useState<'payment' | 'credit_note'>('payment');

  const handleConfirm = () => {
    const finalAmount = operationType === 'credit_note' ? -Math.abs(amount) : Math.abs(amount);
    onConfirm(finalAmount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-stone-900">Enregistrer une opération</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Type d'opération</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOperationType('payment')}
                className={clsx(
                  "py-2 px-4 rounded-xl text-sm font-bold transition-all border",
                  operationType === 'payment' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-stone-500 border-stone-200"
                )}
              >
                Paiement
              </button>
              <button
                onClick={() => setOperationType('credit_note')}
                className={clsx(
                  "py-2 px-4 rounded-xl text-sm font-bold transition-all border",
                  operationType === 'credit_note' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-stone-500 border-stone-200"
                )}
              >
                Avoir (Retour)
              </button>
            </div>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Total à payer:</span>
              <span className="font-bold">{(rental.totalAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Déjà payé:</span>
              <span className="font-bold text-emerald-600">{(rental.paidAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="h-px bg-stone-200 my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Reste:</span>
              <span className="font-bold text-red-600">{((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              {operationType === 'payment' ? 'Montant du versement (TND)' : 'Montant du remboursement (TND)'}
            </label>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving}
              className={clsx(
                "flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg disabled:opacity-50",
                operationType === 'payment' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" : "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
              )}
            >
              {isSaving ? '...' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RentalClosureModal({ rental, vehicle, onClose, onConfirm, isSaving }: { rental: Rental, vehicle: Vehicle, onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [formData, setFormData] = useState({
    returnDate: format(new Date(), 'yyyy-MM-dd'),
    returnMileage: vehicle.mileage,
    returnFuelLevel: 100,
    parkingLocation: vehicle.parkingLocation || '',
    paymentStatus: rental.paymentStatus,
    paidAmount: rental.paidAmount,
    washStatus: 'clean' as 'clean' | 'dirty',
    checkedInBy: rental.checkedInBy || auth.currentUser?.displayName || ''
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">Clôture de Location</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(formData); }} className="p-8 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Date de Retour</label>
              <input
                type="date"
                required
                value={formData.returnDate}
                onChange={(e) => setFormData({...formData, returnDate: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage Retour</label>
              <input
                type="number"
                required
                min={vehicle.mileage}
                value={formData.returnMileage}
                onChange={(e) => setFormData({...formData, returnMileage: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Niveau Carburant (%)</label>
              <input
                type="number"
                required
                min="0"
                max="100"
                value={formData.returnFuelLevel}
                onChange={(e) => setFormData({...formData, returnFuelLevel: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Emplacement Parking</label>
              <input
                type="text"
                required
                value={formData.parkingLocation}
                onChange={(e) => setFormData({...formData, parkingLocation: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Ex: Parking A"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Agent (Entrée)</label>
              <input
                type="text"
                required
                value={formData.checkedInBy}
                onChange={(e) => setFormData({...formData, checkedInBy: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Nom de l'agent"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">État de Lavage (Retour)</label>
              <select
                value={formData.washStatus}
                onChange={(e) => setFormData({...formData, washStatus: e.target.value as any})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="clean">Propre</option>
                <option value="dirty">Sale</option>
              </select>
            </div>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl space-y-4 border border-stone-100">
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Paiement Final</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Statut</label>
                <select
                  value={formData.paymentStatus}
                  onChange={(e) => setFormData({...formData, paymentStatus: e.target.value as any})}
                  className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="pending">Impayé</option>
                  <option value="partial">Partiel</option>
                  <option value="paid">Payé</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Payé (TND)</label>
                <input
                  type="number"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({...formData, paidAmount: Number(e.target.value)})}
                  className="w-full px-3 py-2 bg-white border-none rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-stone-200">
              <span className="text-stone-500">Total Contrat:</span>
              <span className="font-bold">{(rental.totalAmount || 0).toLocaleString()} TND</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-stone-500">
                {formData.paidAmount > (rental.totalAmount || 0) ? 'Montant à rendre:' : 'Reste à payer:'}
              </span>
              <span className={clsx(
                "font-bold",
                formData.paidAmount > (rental.totalAmount || 0) ? "text-emerald-600" : "text-red-600"
              )}>
                {Math.abs((rental.totalAmount || 0) - formData.paidAmount).toLocaleString()} TND
              </span>
            </div>
          </div>

          {formData.paidAmount > (rental.totalAmount || 0) && (
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800">
                <p className="font-bold mb-1">Remboursement requis</p>
                <p>Le client a trop payé. Un avoir sera automatiquement généré lors de la clôture.</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
          >
            {isSaving ? 'Traitement...' : 'Confirmer le retour & Libérer le véhicule'}
          </button>
        </form>
      </div>
    </div>
  );
}

function VehicleSwapModal({ rental, currentVehicle, availableVehicles, onClose, onConfirm, isSaving }: { rental: Rental, currentVehicle: Vehicle, availableVehicles: Vehicle[], onClose: () => void, onConfirm: (data: any) => void, isSaving: boolean }) {
  const [formData, setFormData] = useState({
    newVehicleId: '',
    reason: '',
    mileageAtSwap: currentVehicle.mileage
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 resizable-modal">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h3 className="text-2xl font-bold text-stone-900">Échange de Véhicule</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-stone-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(formData); }} className="p-8 space-y-6 overflow-y-auto">
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-bold mb-1">Attention</p>
              <p>L'échange libérera le véhicule actuel ({currentVehicle.brand} {currentVehicle.model}) et affectera le nouveau véhicule à cette location.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Nouveau Véhicule</label>
              <select
                required
                value={formData.newVehicleId}
                onChange={(e) => setFormData({...formData, newVehicleId: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Sélectionner un véhicule disponible</option>
                {availableVehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kilométrage actuel ({currentVehicle.brand})</label>
              <input
                type="number"
                required
                min={currentVehicle.mileage}
                value={formData.mileageAtSwap}
                onChange={(e) => setFormData({...formData, mileageAtSwap: Number(e.target.value)})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Motif de l'échange</label>
              <textarea
                required
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                placeholder="Ex: Panne mécanique, demande client..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            {isSaving ? 'Échange en cours...' : 'Confirmer l\'échange'}
          </button>
        </form>
      </div>
    </div>
  );
}
