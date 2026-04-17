import React from 'react';
import { useOffice } from '../contexts/OfficeContext';
import { Car, MapPin, ChevronRight, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'motion/react';

export function OfficeSelection() {
  const { offices, setCurrentOffice } = useOffice();

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="max-w-2xl w-full">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-4xl font-black text-stone-900 mb-4 tracking-tight">Sélection du Bureau</h1>
          <p className="text-stone-500 text-lg italic serif">Veuillez choisir le bureau dans lequel vous travaillez aujourd'hui.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {offices.map((office, index) => (
            <motion.button
              key={office.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentOffice(office)}
              className="group relative bg-white p-8 rounded-3xl border border-stone-200 shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Building2 className="w-32 h-32" />
              </div>
              
              <div className="relative z-10">
                <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                  <MapPin className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold text-stone-900 mb-2">{office.name}</h3>
                <p className="text-stone-500 text-sm mb-6">Accédez à la gestion des véhicules et contrats de ce bureau.</p>
                
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-widest">
                  Sélectionner
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12"
        >
          <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">
            Vous pourrez changer de bureau à tout moment depuis les paramètres.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
