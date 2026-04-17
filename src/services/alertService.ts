import { collection, getDocs, addDoc, query, where, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Vehicle, AppNotification } from '../types';
import { differenceInDays, parseISO } from 'date-fns';

const SETTINGS_DOC = 'settings/system';

export async function getWarningPeriod(): Promise<number> {
  try {
    const settingsDoc = await getDoc(doc(db, SETTINGS_DOC));
    if (settingsDoc.exists()) {
      return settingsDoc.data().warningPeriod || 15;
    }
    return 15;
  } catch (error) {
    console.error("Error getting warning period:", error);
    return 15;
  }
}

export async function setWarningPeriod(days: number): Promise<void> {
  try {
    await setDoc(doc(db, SETTINGS_DOC), { warningPeriod: days }, { merge: true });
  } catch (error) {
    console.error("Error setting warning period:", error);
  }
}

export async function checkVehicleExpirations() {
  const warningPeriod = await getWarningPeriod();
  const vehiclesSnapshot = await getDocs(collection(db, 'vehicles'));
  const vehicles = vehiclesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Vehicle[];
  
  const today = new Date();
  
  for (const vehicle of vehicles) {
    if (!vehicle.id) continue;
    
    const documents = [
      { name: 'Assurance', date: vehicle.insuranceExpiry },
      { name: 'Vignette', date: vehicle.vignetteExpiry },
      { name: 'Visite Technique', date: vehicle.technicalInspectionExpiry },
      { name: 'Leasing', date: vehicle.leasingExpiry }
    ];

    for (const doc of documents) {
      if (doc.date) {
        const expiryDate = parseISO(doc.date);
        const daysLeft = differenceInDays(expiryDate, today);

        if (daysLeft <= warningPeriod && daysLeft >= 0) {
          // Check if a notification already exists for this vehicle and document today
          const notificationTitle = `Expiration: ${doc.name}`;
          const notificationMessage = `Le document ${doc.name} du véhicule ${vehicle.brand} ${vehicle.model} (${vehicle.plate}) expire dans ${daysLeft} jours.`;
          
          await createNotificationIfNew(notificationTitle, notificationMessage, vehicle.id, doc.name, vehicle.officeId);
        }
      }
    }

    // Check Oil Change (Vidange)
    if (vehicle.nextOilChangeMileage && vehicle.mileage) {
      const remainingKm = vehicle.nextOilChangeMileage - vehicle.mileage;
      if (remainingKm <= 100 && remainingKm > 0) {
        const title = "Alerte Vidange";
        const message = `Le véhicule ${vehicle.brand} ${vehicle.model} (${vehicle.plate}) doit faire sa vidange dans ${remainingKm} km.`;
        await createNotificationIfNew(title, message, vehicle.id, 'Vidange', vehicle.officeId);
      } else if (remainingKm <= 0) {
        const title = "Vidange Dépassée";
        const message = `Le véhicule ${vehicle.brand} ${vehicle.model} (${vehicle.plate}) a dépassé l'échéance de vidange de ${Math.abs(remainingKm)} km.`;
        await createNotificationIfNew(title, message, vehicle.id, 'Vidange', vehicle.officeId);
      }
    }
  }
}

async function createNotificationIfNew(title: string, message: string, vehicleId: string, docName: string, officeId: string) {
  const todayStr = new Date().toISOString().split('T')[0];
  const q = query(
    collection(db, 'notifications'),
    where('title', '==', title),
    where('vehicleId', '==', vehicleId),
    where('docName', '==', docName),
    where('date', '==', todayStr),
    where('officeId', '==', officeId)
  );
  
  const existing = await getDocs(q);
  if (existing.empty) {
    await addDoc(collection(db, 'notifications'), {
      title,
      message,
      type: 'warning',
      timestamp: new Date().toISOString(),
      read: false,
      vehicleId,
      docName,
      date: todayStr,
      isManual: false,
      officeId
    });
  }
}
