import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Rental, Expense, Maintenance, Client, Vehicle, StockMovement, Leasing } from '../types';
import { useOffice } from '../contexts/OfficeContext';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText, 
  ClipboardList, 
  RotateCcw, 
  Search, 
  Trash2, 
  Edit2, 
  Printer,
  ChevronRight,
  Filter,
  Download,
  AlertTriangle,
  Car,
  Info,
  X,
  BarChart as BarChartIcon
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx } from 'clsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { logActivity } from '../services/logService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Receipt } from './Receipt';
import { RentalModal } from './RentalList';
import { DeleteModal } from './DeleteModal';

export function StatisticsPanel() {
  const { currentOffice } = useOffice();
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [leasings, setLeasings] = useState<Leasing[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'invoice' | 'quote' | 'credit_note'>('all');
  const [selectedDocForReceipt, setSelectedDocForReceipt] = useState<{rental: Rental, vehicle?: Vehicle, client: Client} | null>(null);
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, id: string }>({ isOpen: false, id: '' });
  const [activeView, setActiveView] = useState<'documents' | 'vehicles'>('documents');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!currentOffice) return;

    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setRentals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rental[]);
    });
    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Expense[]);
    });
    const unsubMaintenances = onSnapshot(query(collection(db, 'maintenances'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setMaintenances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Maintenance[]);
    });
    const unsubStockMovements = onSnapshot(query(collection(db, 'stockMovements'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setStockMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockMovement[]);
    });
    const unsubLeasings = onSnapshot(query(collection(db, 'leasings'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setLeasings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Leasing[]);
    });
    const unsubClients = onSnapshot(query(collection(db, 'clients'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });
    const unsubVehicles = onSnapshot(query(collection(db, 'vehicles'), where('officeId', '==', currentOffice.id)), (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vehicle[]);
      setLoading(false);
    });

    return () => {
      unsubRentals();
      unsubExpenses();
      unsubMaintenances();
      unsubStockMovements();
      unsubLeasings();
      unsubClients();
      unsubVehicles();
    };
  }, [currentOffice]);

  const totalRevenue = rentals
    .filter(r => isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) }))
    .reduce((acc, curr) => acc + (curr.paidAmount || 0), 0) +
    leasings.reduce((acc, l) => {
      const paidLeasingRevenue = l.payments
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
        .reduce((pAcc, p) => {
          let revenue = 0;
          if (l.isSubcontracted) {
            revenue += p.amount;
            if (l.commissionType === 'monthly') {
              revenue += (l.commissionAmount || 0);
            }
          }
          return pAcc + revenue;
        }, 0);
      
      // Add total commission if it falls within the period
      let totalCommission = 0;
      if (l.isSubcontracted && l.commissionType === 'total' && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        totalCommission = l.commissionAmount || 0;
      }

      return acc + paidLeasingRevenue + totalCommission;
    }, 0);

  const totalExpenses = expenses
    .filter(e => isWithinInterval(new Date(e.date), { start: new Date(startDate), end: new Date(endDate) }))
    .reduce((acc, curr) => acc + curr.amount, 0) + 
    maintenances
    .filter(m => isWithinInterval(new Date(m.date), { start: new Date(startDate), end: new Date(endDate) }))
    .reduce((acc, curr) => acc + curr.cost, 0) +
    stockMovements
    .filter(sm => sm.type === 'out' && isWithinInterval(new Date(sm.date), { start: new Date(startDate), end: new Date(endDate) }))
    .reduce((acc, curr) => acc + (curr.quantity * (curr.priceTTC || 0)), 0) +
    leasings.reduce((acc, l) => {
      const paidLeasingExpense = l.payments
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
        .reduce((pAcc, p) => pAcc + p.amount, 0);
      
      // Add deposit if it falls within the period
      let depositExpense = 0;
      if (l.deposit && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        if (l.depositType === 'total') {
          depositExpense = l.deposit;
        }
      }
      // If deposit is monthly, it should probably be handled differently, but usually deposit is a one-time thing or added to payments.
      // For now, let's stick to total deposit at start.

      return acc + paidLeasingExpense + depositExpense;
    }, 0);
  
  const invoiceCount = rentals.filter(r => r.documentType === 'invoice' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;
  const quoteCount = rentals.filter(r => r.documentType === 'quote' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;
  const creditNoteCount = rentals.filter(r => r.documentType === 'credit_note' && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })).length;

  const filteredDocs = rentals.filter(r => {
    if (!isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) })) return false;
    if (docTypeFilter !== 'all' && r.documentType !== docTypeFilter) return false;
    const client = clients.find(c => c.id === r.clientId);
    const vehicle = vehicles.find(v => v.id === r.vehicleId);
    const searchStr = `${client?.name} ${vehicle?.brand} ${vehicle?.model} ${r.contractNumber || ''}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const vehicleStats = vehicles.map(vehicle => {
    const vehicleRentals = rentals.filter(r => r.vehicleId === vehicle.id && isWithinInterval(new Date(r.startDate), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleExpenses = expenses.filter(e => e.vehicleId === vehicle.id && isWithinInterval(new Date(e.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleMaintenances = maintenances.filter(m => m.vehicleId === vehicle.id && isWithinInterval(new Date(m.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleStockCosts = stockMovements.filter(sm => sm.vehicleId === vehicle.id && sm.type === 'out' && isWithinInterval(new Date(sm.date), { start: new Date(startDate), end: new Date(endDate) }));
    const vehicleLeasings = leasings.filter(l => l.vehicleId === vehicle.id);

    const revenue = vehicleRentals.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0) +
                    vehicleLeasings.reduce((acc, l) => {
                      const paidLeasingRevenue = l.payments
                        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
                        .reduce((pAcc, p) => {
                          let rev = 0;
                          if (l.isSubcontracted) {
                            rev += p.amount;
                            if (l.commissionType === 'monthly') rev += (l.commissionAmount || 0);
                          }
                          return pAcc + rev;
                        }, 0);
                      
                      let totalComm = 0;
                      if (l.isSubcontracted && l.commissionType === 'total' && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
                        totalComm = l.commissionAmount || 0;
                      }
                      return acc + paidLeasingRevenue + totalComm;
                    }, 0);

    const expenseCosts = vehicleExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const maintenanceCosts = vehicleMaintenances.reduce((acc, curr) => acc + curr.cost, 0);
    const stockCosts = vehicleStockCosts.reduce((acc, curr) => acc + (curr.quantity * (curr.priceTTC || 0)), 0);
    const leasingCosts = vehicleLeasings.reduce((acc, l) => {
      const paidLeasingExp = l.payments
        .filter(p => p.status === 'paid' && p.paidDate && isWithinInterval(new Date(p.paidDate), { start: new Date(startDate), end: new Date(endDate) }))
        .reduce((pAcc, p) => pAcc + p.amount, 0);
      
      let depExp = 0;
      if (l.deposit && l.startDate && isWithinInterval(new Date(l.startDate), { start: new Date(startDate), end: new Date(endDate) })) {
        if (l.depositType === 'total') depExp = l.deposit;
      }
      return acc + paidLeasingExp + depExp;
    }, 0);

    const totalExp = expenseCosts + maintenanceCosts + stockCosts + leasingCosts;

    return {
      ...vehicle,
      revenue,
      expenses: expenseCosts + stockCosts,
      maintenance: maintenanceCosts,
      totalExpenses: totalExp,
      profit: revenue - totalExp
    };
  }).filter(v => 
    v.brand.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.plate.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const vehicleRevenueTrend = vehicles.map(vehicle => {
    const months = Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), 5 - i);
      const mStart = startOfMonth(date);
      const mEnd = endOfMonth(date);
      
      const monthlyRevenue = rentals
        .filter(r => r.vehicleId === vehicle.id && isWithinInterval(new Date(r.startDate), { start: mStart, end: mEnd }))
        .reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
        
      return {
        month: format(date, 'MMM', { locale: fr }),
        revenue: monthlyRevenue
      };
    });
    
    return {
      name: `${vehicle.brand} ${vehicle.model}`,
      data: months,
      totalRevenue: months.reduce((acc, curr) => acc + curr.revenue, 0)
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5); // Top 5 vehicles

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>Rapport Financier par Véhicule</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #1c1917; }
            h1 { font-size: 24px; margin-bottom: 10px; }
            p { color: #78716c; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; border-bottom: 1px solid #e7e5e4; text-align: left; }
            th { background: #f5f5f4; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
            .amount { font-family: monospace; text-align: right; }
            .profit { font-weight: bold; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .footer { margin-top: 40px; font-size: 12px; color: #a8a29e; border-top: 1px solid #e7e5e4; pt: 20px; }
          </style>
        </head>
        <body>
          <h1>Rapport Financier par Véhicule</h1>
          <p>Période du ${format(new Date(startDate), 'dd/MM/yyyy')} au ${format(new Date(endDate), 'dd/MM/yyyy')}</p>
          <table>
            <thead>
              <tr>
                <th>Véhicule</th>
                <th>Immatriculation</th>
                <th class="amount">Revenus</th>
                <th class="amount">Dépenses</th>
                <th class="amount">Maintenance</th>
                <th class="amount">Bénéfice</th>
              </tr>
            </thead>
            <tbody>
              ${vehicleStats.map(v => `
                <tr>
                  <td>${v.brand} ${v.model}</td>
                  <td>${v.plate}</td>
                  <td class="amount">${v.revenue.toLocaleString()} TND</td>
                  <td class="amount">${v.expenses.toLocaleString()} TND</td>
                  <td class="amount">${v.maintenance.toLocaleString()} TND</td>
                  <td class="amount profit ${v.profit >= 0 ? 'positive' : 'negative'}">${v.profit.toLocaleString()} TND</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="background: #f5f5f4; font-weight: bold;">
                <td colspan="2">TOTAL</td>
                <td class="amount">${totalRevenue.toLocaleString()} TND</td>
                <td class="amount">${(expenses.reduce((acc, curr) => acc + curr.amount, 0) + stockMovements.filter(sm => sm.type === 'out').reduce((acc, curr) => acc + (curr.quantity * (curr.priceTTC || 0)), 0)).toLocaleString()} TND</td>
                <td class="amount">${maintenances.reduce((acc, curr) => acc + curr.cost, 0).toLocaleString()} TND</td>
                <td class="amount">${(totalRevenue - totalExpenses).toLocaleString()} TND</td>
              </tr>
            </tfoot>
          </table>
          <div class="footer">
            Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm')}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleDeleteDoc = async (rentalId: string) => {
    try {
      await deleteDoc(doc(db, 'rentals', rentalId));
      if (auth.currentUser) {
        logActivity(auth.currentUser.uid, 'delete_document', `Document supprimé: ${rentalId}`, auth.currentUser.displayName || undefined);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rentals/${rentalId}`);
    }
  };

  const handlePrint = (rental: Rental) => {
    const vehicle = vehicles.find(v => v.id === rental.vehicleId);
    const client = clients.find(c => c.id === rental.clientId);
    if (vehicle && client) {
      setSelectedDocForReceipt({ rental, vehicle, client });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">État de Statistique</h2>
            <p className="text-stone-500 italic serif">Vue d'ensemble de la performance financière et gestion des documents.</p>
          </div>
          <button 
            onClick={() => setIsHelpOpen(true)}
            className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
            title="Guide d'utilisation"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-stone-200 shadow-sm">
            <Filter className="w-4 h-4 text-stone-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0"
            />
            <span className="text-stone-300">à</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none text-sm font-medium focus:ring-0 p-0"
            />
          </div>
          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2.5 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg"
          >
            <Printer className="w-4 h-4" />
            Imprimer Rapport
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">Revenus</span>
          </div>
          <p className="text-3xl font-bold text-stone-900">{(totalRevenue || 0).toLocaleString()} TND</p>
          <p className="text-sm text-stone-500 mt-1">Total des encaissements</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 px-2 py-1 rounded-md">Dépenses</span>
          </div>
          <p className="text-3xl font-bold text-stone-900">{(totalExpenses || 0).toLocaleString()} TND</p>
          <p className="text-sm text-stone-500 mt-1">Maintenance & Frais fixes</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Bénéfice Net</span>
          </div>
          <p className={clsx(
            "text-3xl font-bold",
            (totalRevenue - totalExpenses) >= 0 ? "text-emerald-600" : "text-red-600"
          )}>
            {((totalRevenue || 0) - (totalExpenses || 0)).toLocaleString()} TND
          </p>
          <p className="text-sm text-stone-500 mt-1">Résultat d'exploitation</p>
        </div>
      </div>

      {/* Document Counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-stone-900 p-6 rounded-3xl text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Factures</p>
              <p className="text-2xl font-bold">{invoiceCount}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-600" />
        </div>

        <div className="bg-stone-900 p-6 rounded-3xl text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Devis</p>
              <p className="text-2xl font-bold">{quoteCount}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-600" />
        </div>

        <div className="bg-stone-900 p-6 rounded-3xl text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Avoirs</p>
              <p className="text-2xl font-bold">{creditNoteCount}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-600" />
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex gap-1 bg-stone-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveView('documents')}
          className={clsx(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeView === 'documents' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          Documents
        </button>
        <button
          onClick={() => setActiveView('vehicles')}
          className={clsx(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            activeView === 'vehicles' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          )}
        >
          Performance Véhicules
        </button>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
        <h3 className="text-xl font-bold text-stone-900 mb-8 flex items-center gap-2">
          <BarChartIcon className="w-6 h-6 text-emerald-500" />
          Top 5 Revenus par Véhicule (6 derniers mois)
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vehicleRevenueTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#a8a29e', fontSize: 10, fontWeight: 600}} 
              />
              <Tooltip 
                cursor={{fill: '#f8fafc'}}
                contentStyle={{backgroundColor: '#fff', borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
              />
              <Bar dataKey="totalRevenue" name="Revenu Total (6 mois)" radius={[8, 8, 0, 0]}>
                {vehicleRevenueTrend.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][index % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {activeView === 'documents' ? (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="text"
                placeholder="Rechercher un document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value as any)}
                className="px-4 py-2 bg-stone-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Tous les documents</option>
                <option value="invoice">Factures</option>
                <option value="quote">Devis</option>
                <option value="credit_note">Avoirs</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Date</th>
                  <th className="px-8 py-4">Document</th>
                  <th className="px-8 py-4">Client</th>
                  <th className="px-8 py-4">Véhicule</th>
                  <th className="px-8 py-4">Montant</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredDocs.map((doc) => {
                  const client = clients.find(c => c.id === doc.clientId);
                  const vehicle = vehicles.find(v => v.id === doc.vehicleId);
                  return (
                    <tr key={doc.id} className="hover:bg-stone-50/50 transition-all group">
                      <td className="px-8 py-5 text-sm text-stone-600">
                        {format(new Date(doc.startDate), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-8 py-5">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
                          doc.documentType === 'quote' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          doc.documentType === 'credit_note' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {doc.documentType === 'quote' ? 'Devis' : 
                           doc.documentType === 'credit_note' ? 'Avoir' : 'Facture'}
                        </span>
                      </td>
                      <td className="px-8 py-5 font-bold text-stone-900">{client?.name || 'Inconnu'}</td>
                      <td className="px-8 py-5 text-sm text-stone-500">{vehicle?.brand} {vehicle?.model}</td>
                      <td className="px-8 py-5 font-bold text-stone-900">{(doc.totalAmount || 0).toLocaleString()} TND</td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => { setEditingRental(doc); setIsModalOpen(true); }}
                            className="p-2 hover:bg-stone-100 text-stone-600 rounded-lg transition-all"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handlePrint(doc)}
                            className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-all"
                            title="Imprimer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeleteModal({ isOpen: true, id: doc.id })}
                            className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-stone-100">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input
                type="text"
                placeholder="Rechercher un véhicule..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50/50 text-stone-400 text-xs font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Véhicule</th>
                  <th className="px-8 py-4">Immatriculation</th>
                  <th className="px-8 py-4 text-right">Gains</th>
                  <th className="px-8 py-4 text-right">Dépenses</th>
                  <th className="px-8 py-4 text-right">Maintenance</th>
                  <th className="px-8 py-4 text-right">Bénéfice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {vehicleStats.map((v) => (
                  <tr key={v.id} className="hover:bg-stone-50/50 transition-all group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center">
                          <Car className="w-5 h-5 text-stone-400" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{v.brand} {v.model}</p>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{v.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 font-mono text-sm font-bold text-stone-600">{v.plate}</td>
                    <td className="px-8 py-5 text-right font-bold text-emerald-600">{v.revenue.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right font-bold text-red-400">{v.expenses.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right font-bold text-amber-500">{v.maintenance.toLocaleString()} TND</td>
                    <td className="px-8 py-5 text-right">
                      <span className={clsx(
                        "font-bold px-3 py-1 rounded-lg",
                        v.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      )}>
                        {v.profit.toLocaleString()} TND
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedDocForReceipt && (
        <Receipt 
          rental={selectedDocForReceipt.rental}
          vehicle={selectedDocForReceipt.vehicle}
          client={selectedDocForReceipt.client}
          onClose={() => setSelectedDocForReceipt(null)}
        />
      )}

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

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '' })}
        onConfirm={() => handleDeleteDoc(deleteModal.id)}
        title="Supprimer le document"
        message="Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible."
      />

      {isHelpOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" />
                <h3 className="text-xl font-bold">Guide: Statistiques & Rentabilité</h3>
              </div>
              <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4 text-stone-600">
              <div className="space-y-2">
                <p className="font-bold text-stone-900">1. Calcul du Bénéfice</p>
                <p className="text-sm">• <span className="font-bold text-emerald-600">Revenus:</span> Locations payées + Commissions de sous-traitance.</p>
                <p className="text-sm">• <span className="font-bold text-red-600">Dépenses:</span> Maintenance + Frais + Paiements Leasing.</p>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-stone-900">2. Performance Véhicule</p>
                <p className="text-sm">L'onglet "Performance Véhicules" vous permet de voir exactement quel véhicule est le plus rentable après déduction de tous ses frais (leasing inclus).</p>
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
    </div>
  );
}
