import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Office, UserProfile } from '../types';

interface OfficeContextType {
  offices: Office[];
  currentOffice: Office | null;
  setCurrentOffice: (office: Office) => void;
  loading: boolean;
}

const OfficeContext = createContext<OfficeContextType | undefined>(undefined);

export function OfficeProvider({ children }: { children: React.ReactNode }) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [currentOffice, setCurrentOffice] = useState<Office | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize offices if they don't exist
    const initOffices = async () => {
      const officeList = [
        { id: 'bureau-chedli', name: 'Bureau Chedli', isActive: true },
        { id: 'bureau-aymen', name: 'Bureau Aymen', isActive: true }
      ];

      for (const office of officeList) {
        const officeRef = doc(db, 'offices', office.id);
        const officeSnap = await getDoc(officeRef);
        if (!officeSnap.exists()) {
          await setDoc(officeRef, office);
        }
      }
    };

    initOffices();

    const unsub = onSnapshot(collection(db, 'offices'), (snapshot) => {
      const officeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Office[];
      setOffices(officeData);
      
      // Try to restore last selected office from localStorage or user profile
      const savedOfficeId = localStorage.getItem('selectedOfficeId');
      if (savedOfficeId) {
        const savedOffice = officeData.find(o => o.id === savedOfficeId);
        if (savedOffice) {
          setCurrentOffice(savedOffice);
        }
      }
      
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSetCurrentOffice = (office: Office) => {
    setCurrentOffice(office);
    localStorage.setItem('selectedOfficeId', office.id);
  };

  return (
    <OfficeContext.Provider value={{ 
      offices, 
      currentOffice, 
      setCurrentOffice: handleSetCurrentOffice, 
      loading 
    }}>
      {children}
    </OfficeContext.Provider>
  );
}

export function useOffice() {
  const context = useContext(OfficeContext);
  if (context === undefined) {
    throw new Error('useOffice must be used within an OfficeProvider');
  }
  return context;
}
