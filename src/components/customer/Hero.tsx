import React, { useState } from 'react';
import { Calendar, MapPin, Search, ArrowRight, Plane } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { clsx } from 'clsx';

interface VehicleSearchProps {
  onSearch: (startDate: string, endDate: string, type?: 'rental' | 'transfer') => void;
}

export function Hero({ onSearch }: VehicleSearchProps) {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [searchType, setSearchType] = useState<'rental' | 'transfer'>('rental');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(startDate, endDate, searchType);
    const element = document.getElementById('vehicles');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
      {/* Background with overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1920" 
          alt="Luxury Car" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900/90 via-stone-900/60 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 mb-6 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest">Premium Car Rental</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Louez l'excellence pour vos <span className="text-emerald-500 italic serif">trajets.</span>
          </h1>
          <p className="text-lg text-stone-300 mb-10 max-w-lg leading-relaxed">
            Découvrez notre flotte de véhicules premium et profitez d'un service de location professionnel, flexible et sans compromis.
          </p>

          {/* Search Box */}
          <div className="bg-white p-2 rounded-[2rem] shadow-2xl shadow-black/20 max-w-3xl">
            <div className="flex gap-2 mb-2 p-1">
              <button
                onClick={() => setSearchType('rental')}
                className={clsx(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  searchType === 'rental' ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-400 hover:bg-stone-100"
                )}
              >
                <MapPin className="w-4 h-4" />
                Location de voiture
              </button>
              <button
                onClick={() => setSearchType('transfer')}
                className={clsx(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  searchType === 'transfer' ? "bg-stone-900 text-white" : "bg-stone-50 text-stone-400 hover:bg-stone-100"
                )}
              >
                <Plane className="w-4 h-4" />
                Transfert Aéroport
              </button>
            </div>
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Date de début
                  </label>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Calendar className="w-3 h-3" /> Date de fin
                  </label>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="bg-emerald-600 text-white px-8 py-4 md:py-0 md:h-full rounded-2xl font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/20"
              >
                <Search className="w-5 h-5" />
                <span>Rechercher</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-10 right-10 hidden lg:block">
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-3xl font-bold text-white">24/7</p>
            <p className="text-xs text-stone-400 uppercase tracking-widest">Support Client</p>
          </div>
          <div className="w-px h-12 bg-white/20" />
          <div className="text-right">
            <p className="text-3xl font-bold text-white">+50</p>
            <p className="text-xs text-stone-400 uppercase tracking-widest">Véhicules</p>
          </div>
        </div>
      </div>
    </div>
  );
}
