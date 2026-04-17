import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Rental, Vehicle, Client } from '../types';

export const generateContractPDF = (rental: Rental, vehicle: Vehicle | undefined, client: Client, settings: any, secondDriver?: Client) => {
  const doc = new jsPDF();
  const agencyName = settings?.agencyName || 'Dhokkar Rent a Car';
  const agencyAddress = settings?.agencyAddress || 'Rue Taieb Hachicha M\'saken A côté café Vegas';
  const agencyPhone = settings?.agencyPhone || '24621605 | 53666895';
  const agencyEmail = settings?.agencyEmail || 'dhokkarlocation2016@gmail.com';
  const agencyMF = settings?.agencyMF || '114739OR/A/M 000';
  const agencyLogo = settings?.agencyLogo;
  
  // Helper for drawing lines
  const drawLine = (y: number) => {
    doc.setDrawColor(230);
    doc.line(20, y, 190, y);
  };

  // Header - Professional Logo/Name
  if (agencyLogo) {
    try {
      // Detect format from data URL
      const imgFormat = agencyLogo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(agencyLogo, imgFormat, 20, 10, 40, 20);
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(16, 185, 129); // Emerald 600
      doc.text(agencyName.toUpperCase(), 20, 25);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(16, 185, 129); // Emerald 600
    doc.text(agencyName.toUpperCase(), 20, 25);
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  const headerTextY = agencyLogo ? 35 : 32;
  doc.text(agencyAddress, 20, headerTextY);
  doc.text(`Tél: ${agencyPhone} | Email: ${agencyEmail}`, 20, headerTextY + 5);
  doc.text(`MF: ${agencyMF}`, 20, headerTextY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('CONTRAT DE LOCATION DE VÉHICULE', 190, 25, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`CONTRAT N°: ${rental.contractNumber}`, 190, 32, { align: 'right' });
  doc.text(`DATE: ${format(new Date(), 'dd/MM/yyyy')}`, 190, 37, { align: 'right' });
  if (rental.agentName) {
    doc.text(`AGENT: ${rental.agentName}`, 190, 42, { align: 'right' });
  }

  drawLine(45);

  // Section 1: Parties
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('1. LES PARTIES', 20, 55);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // Agency (Lessor)
  doc.setFont('helvetica', 'bold');
  doc.text('LE LOUEUR:', 20, 62);
  doc.setFont('helvetica', 'normal');
  doc.text(agencyName, 50, 62);
  
  // Client (Lessee)
  doc.setFont('helvetica', 'bold');
  doc.text('LE LOCATAIRE:', 20, 68);
  doc.setFont('helvetica', 'normal');
  doc.text(`${client.name}`, 50, 68);
  doc.text(`CIN/Passport: ${client.cin || client.passportNumber || 'N/A'}`, 50, 73);
  doc.text(`Permis N°: ${client.licenseNumber}`, 50, 78);
  doc.text(`Tél: ${client.phone}`, 50, 83);
  doc.text(`Adresse: ${client.address}, ${client.city}`, 50, 88);

  if (secondDriver) {
    doc.setFont('helvetica', 'bold');
    doc.text('2ÈME CONDUCTEUR:', 20, 95);
    doc.setFont('helvetica', 'normal');
    doc.text(`${secondDriver.name}`, 50, 95);
    doc.text(`Permis N°: ${secondDriver.licenseNumber}`, 50, 100);
  }

  // Section 2: Vehicle
  const vehicleY = secondDriver ? 110 : 100;
  doc.setDrawColor(200);
  doc.rect(20, vehicleY - 5, 170, 35); // Border for vehicle section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. LE VÉHICULE', 25, vehicleY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (vehicle) {
    doc.text(`Marque / Modèle: ${vehicle.brand} ${vehicle.model}`, 25, vehicleY + 7);
    doc.text(`Immatriculation: ${vehicle.plate}`, 25, vehicleY + 12);
    doc.text(`Type: ${vehicle.type} | Transmission: ${vehicle.transmission}`, 25, vehicleY + 17);
    doc.text(`Kilométrage au départ: ${vehicle.mileage} km`, 25, vehicleY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`Niveau de carburant: ${rental.fuelLevel || 0}%`, 120, vehicleY + 22);
    doc.setFont('helvetica', 'normal');
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Véhicule non assigné (Réservation confirmée)', 20, vehicleY + 7);
    doc.setFont('helvetica', 'normal');
  }

  // Section 3: Rental Terms
  const termsY = vehicleY + 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('3. CONDITIONS DE LOCATION', 20, termsY);
  
  autoTable(doc, {
    startY: termsY + 5,
    margin: { left: 20, right: 20 },
    head: [['Désignation', 'Détails']],
    body: [
      ['Date et Heure de Départ', format(new Date(rental.startDate), 'dd/MM/yyyy HH:mm', { locale: fr })],
      ['Date et Heure de Retour', format(new Date(rental.endDate), 'dd/MM/yyyy HH:mm', { locale: fr })],
      ['Lieu de Prise en Charge', rental.pickupLocation],
      ['Durée de Location', `${rental.totalDays} jour(s)`],
      ['Tarif Journalier', `${(rental.dailyRate || 0).toLocaleString()} TND`],
      ['Niveau de Carburant', `${rental.fuelLevel || 0}%`],
      ['État de Lavage', rental.washStatus === 'clean' ? 'Propre' : 'Sale'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } }
  });

  // Section 4: Financial
  const financialY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('4. RÉSUMÉ FINANCIER', 20, financialY);
  
  const financialData = [
    ['MONTANT TOTAL TTC', `${(rental.totalAmount || 0).toLocaleString()} TND`],
    ['Acompte Versé', `${(rental.paidAmount || 0).toLocaleString()} TND`],
    ['SOLDE À PAYER', `${((rental.totalAmount || 0) - (rental.paidAmount || 0)).toLocaleString()} TND`],
  ];

  autoTable(doc, {
    startY: financialY + 5,
    margin: { left: 110, right: 20 },
    body: financialData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.row.index === 2 || data.row.index === 4) {
        data.cell.styles.fontStyle = 'bold';
        if (data.row.index === 2) data.cell.styles.fontSize = 10;
      }
    }
  });

  // Section 5: Vehicle Photos (Condition)
  let photosY = termsY + 60;
  if (rental.vehiclePhotos && Object.values(rental.vehiclePhotos).some(p => p)) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ÉTAT DES LIEUX (PHOTOS DU VÉHICULE)', 20, 20);
    
    const photos = [
      { label: 'AVANT', data: rental.vehiclePhotos.front },
      { label: 'ARRIÈRE', data: rental.vehiclePhotos.back },
      { label: 'GAUCHE', data: rental.vehiclePhotos.left },
      { label: 'DROITE', data: rental.vehiclePhotos.right }
    ].filter(p => p.data);

    let currentX = 20;
    let currentY = 30;
    const imgWidth = 80;
    const imgHeight = 60;

    photos.forEach((photo, index) => {
      if (index > 0 && index % 2 === 0) {
        currentX = 20;
        currentY += imgHeight + 20;
      } else if (index > 0) {
        currentX = 110;
      }

      if (photo.data) {
        doc.setFontSize(8);
        doc.text(photo.label, currentX, currentY - 2);
        try {
          doc.addImage(photo.data, 'JPEG', currentX, currentY, imgWidth, imgHeight);
        } catch (e) {
          console.error('Error adding image to PDF:', e);
        }
      }
    });
    photosY = currentY + imgHeight + 20;
  }

  // Section 6: Legal Terms
  const legalY = photosY > 200 ? 20 : photosY;
  if (photosY > 200) doc.addPage();
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CONDITIONS GÉNÉRALES ET SIGNATURES', 20, legalY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const defaultTerms = `ARTICLE 1 : UTILISATION DU VÉHICULE - Le locataire s'engage à ne pas laisser conduire le véhicule par d'autres personnes que lui-même ou celles agréées par le loueur.
ARTICLE 2 : ÉTAT DU VÉHICULE - Le véhicule est livré en parfait état de marche et de carrosserie. Le locataire s'engage à le rendre dans le même état.
ARTICLE 3 : ASSURANCES - Le véhicule est assuré tous risques avec une franchise restant à la charge du locataire en cas de sinistre responsable ou sans tiers identifié.
ARTICLE 4 : CARBURANT - Le véhicule doit être restitué avec le même niveau de carburant qu'au départ.
ARTICLE 5 : RESPONSABILITÉ - Le locataire est seul responsable des amendes et contraventions durant la période de location.`;
  
  const terms = settings?.rentalTerms || defaultTerms;
  const splitTerms = doc.splitTextToSize(terms, 170);
  doc.text(splitTerms, 20, legalY + 7);

  // Signatures
  const sigY = legalY + 55;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SIGNATURE DU LOUEUR', 40, sigY);
  doc.text('SIGNATURE DU LOCATAIRE', 140, sigY);
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text('(Précédé de la mention "Lu et approuvé")', 140, sigY + 5);

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} sur ${pageCount} | Généré par Dhokkar Rent a Car Management System`, 105, 285, { align: 'center' });
  }
  
  doc.save(`Contrat_${rental.contractNumber}.pdf`);
};

export const generateInvoicePDF = (rental: Rental, vehicle: Vehicle | undefined, client: Client, settings: any) => {
  const doc = new jsPDF();
  const agencyName = settings?.agencyName || 'Dhokkar Rent a Car';
  const agencyAddress = settings?.agencyAddress || 'Rue Taieb Hachicha M\'saken A côté café Vegas';
  const agencyPhone = settings?.agencyPhone || '24621605 | 53666895';
  const agencyEmail = settings?.agencyEmail || 'dhokkarlocation2016@gmail.com';
  const agencyMF = settings?.agencyMF || '114739OR/A/M 000';
  const agencyLogo = settings?.agencyLogo;
  
  const documentType = rental.documentType === 'quote' ? 'DEVIS' : (rental.documentType === 'credit_note' ? 'AVOIR' : 'FACTURE');

  // Header
  if (agencyLogo) {
    try {
      const imgFormat = agencyLogo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(agencyLogo, imgFormat, 20, 10, 40, 20);
    } catch (e) {
      console.error('Error adding logo to PDF:', e);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(16, 185, 129);
      doc.text(agencyName.toUpperCase(), 20, 25);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(16, 185, 129);
    doc.text(agencyName.toUpperCase(), 20, 25);
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  const headerTextY = agencyLogo ? 35 : 32;
  doc.text(agencyAddress, 20, headerTextY);
  doc.text(`Tél: ${agencyPhone} | Email: ${agencyEmail}`, 20, headerTextY + 5);
  doc.text(`MF: ${agencyMF}`, 20, headerTextY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(documentType, 190, 25, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`N°: ${rental.id.slice(-6).toUpperCase()}`, 190, 32, { align: 'right' });
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 190, 37, { align: 'right' });
  if (rental.agentName) {
    doc.text(`Agent: ${rental.agentName}`, 190, 42, { align: 'right' });
  }

  // Bill To
  doc.setDrawColor(230);
  doc.line(20, 45, 190, 45);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DESTINATAIRE:', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(client.name, 20, 62);
  doc.text(client.address || '', 20, 67);
  doc.text(client.city || '', 20, 72);
  doc.text(`Tél: ${client.phone}`, 20, 77);

  // Table
  autoTable(doc, {
    startY: 90,
    margin: { left: 20, right: 20 },
    head: [['Description', 'Période', 'Qté', 'PU', 'Total']],
    body: [
      [
        vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.plate})` : 'Réservation de véhicule (Modèle à confirmer)',
        `${format(new Date(rental.startDate), 'dd/MM/yyyy')} - ${format(new Date(rental.endDate), 'dd/MM/yyyy')}`,
        `${rental.totalDays} j`,
        `${(rental.dailyRate || 0).toLocaleString()} TND`,
        `${(rental.totalAmount || 0).toLocaleString()} TND`
      ],
    ],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 60 },
      4: { halign: 'right' }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  // Totals
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL TTC:', 140, finalY);
  doc.text(`${(rental.totalAmount || 0).toLocaleString()} TND`, 190, finalY, { align: 'right' });

  // Payment Info
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Mode de paiement: ' + (rental.paymentMethod || 'Espèces'), 20, finalY + 30);
  doc.text('Statut: ' + (rental.paymentStatus === 'paid' ? 'PAYÉ' : 'À PAYER'), 20, finalY + 35);

  // Footer
  doc.setFontSize(8);
  doc.text('Merci de votre confiance !', 105, 280, { align: 'center' });
  
  doc.save(`${documentType}_${rental.id.slice(-6).toUpperCase()}.pdf`);
};

export const generateWorkerReportPDF = (
  month: string, 
  workers: any[], 
  attendances: any[], 
  transactions: any[], 
  officeName: string
) => {
  const doc = new jsPDF();
  const monthLabel = format(new Date(month + '-01'), 'MMMM yyyy', { locale: fr });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('RAPPORT DES SALAIRES', 20, 25);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Période: ${monthLabel}`, 20, 32);
  doc.text(`Bureau: ${officeName}`, 20, 37);
  doc.text(`Date de génération: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 190, 32, { align: 'right' });

  // Table Data
  const tableData = workers.map(worker => {
    const workerAttendances = attendances.filter(a => a.workerId === worker.id && a.date.startsWith(month));
    const workerTransactions = transactions.filter(t => t.workerId === worker.id && t.month === month);
    
    const presentDays = workerAttendances.filter(a => a.status === 'present').length;
    const paidLeaveDays = workerAttendances.filter(a => a.status === 'leave' && a.isPaid).length;
    const paidSickDays = workerAttendances.filter(a => a.status === 'sick' && a.isPaid).length;
    
    const absentDays = workerAttendances.filter(a => a.status === 'absent').length;
    const unpaidLeaveDays = workerAttendances.filter(a => a.status === 'leave' && !a.isPaid).length;
    const unpaidSickDays = workerAttendances.filter(a => a.status === 'sick' && !a.isPaid).length;

    const baseSalary = Number(worker.baseSalary) || 0;
    const dailyRate = baseSalary / 26;
    
    let earned = 0;
    if (worker.salaryType === 'daily') {
      earned = (presentDays + paidLeaveDays + paidSickDays) * baseSalary;
    } else {
      const unpaidDays = absentDays + unpaidLeaveDays + unpaidSickDays;
      earned = baseSalary - (unpaidDays * dailyRate);
    }
    earned = Math.max(0, earned);

    const advances = workerTransactions.filter(t => t.type === 'advance').reduce((sum, t) => sum + t.amount, 0);
    const payments = workerTransactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);
    const bonuses = workerTransactions.filter(t => t.type === 'bonus').reduce((sum, t) => sum + t.amount, 0);
    const deductions = workerTransactions.filter(t => t.type === 'deduction').reduce((sum, t) => sum + t.amount, 0);

    const netToPay = earned + bonuses - deductions - advances;
    const remaining = netToPay - payments;

    return [
      worker.fullName,
      worker.role,
      `${presentDays + paidLeaveDays + paidSickDays} j`,
      `${earned.toLocaleString()} DT`,
      `${advances.toLocaleString()} DT`,
      `${bonuses.toLocaleString()} DT`,
      `${payments.toLocaleString()} DT`,
      `${remaining.toLocaleString()} DT`
    ];
  });

  autoTable(doc, {
    startY: 45,
    head: [['Nom', 'Poste', 'Jours', 'Salaire Dû', 'Avances', 'Primes', 'Payé', 'Reste']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }
    }
  });

  doc.save(`Rapport_Salaires_${month}.pdf`);
};

export const generateWorkerDetailedReportPDF = (
  month: string,
  worker: any,
  attendances: any[],
  transactions: any[],
  officeName: string
) => {
  const doc = new jsPDF();
  const monthLabel = format(new Date(month + '-01'), 'MMMM yyyy', { locale: fr });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(16, 185, 129);
  doc.text('FICHE DE PAIE DÉTAILLÉE', 20, 25);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Employé: ${worker.fullName}`, 20, 32);
  doc.text(`Période: ${monthLabel}`, 20, 37);
  doc.text(`Bureau: ${officeName}`, 20, 42);
  doc.text(`Date de génération: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 190, 32, { align: 'right' });

  // Attendance Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RÉSUMÉ DES PRÉSENCES', 20, 55);
  
  const workerAttendances = attendances.filter(a => a.workerId === worker.id && a.date.startsWith(month));
  const attendanceSummary = [
    ['Présences', workerAttendances.filter(a => a.status === 'present').length],
    ['Congés Payés', workerAttendances.filter(a => a.status === 'leave' && a.isPaid).length],
    ['Congés Non-Payés', workerAttendances.filter(a => a.status === 'leave' && !a.isPaid).length],
    ['Maladies Payées', workerAttendances.filter(a => a.status === 'sick' && a.isPaid).length],
    ['Maladies Non-Payées', workerAttendances.filter(a => a.status === 'sick' && !a.isPaid).length],
    ['Absences', workerAttendances.filter(a => a.status === 'absent').length],
  ];

  autoTable(doc, {
    startY: 60,
    body: attendanceSummary,
    theme: 'plain',
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
  });

  // Compte Trace
  const transY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('HISTORIQUE DU COMPTE TRACE', 20, transY);

  const workerTransactions = transactions.filter(t => t.workerId === worker.id && t.month === month);
  const transactionData = workerTransactions.map(t => [
    format(new Date(t.date), 'dd/MM/yyyy HH:mm'),
    t.type.toUpperCase(),
    t.note || '-',
    `${t.amount.toLocaleString()} DT`
  ]);

  autoTable(doc, {
    startY: transY + 5,
    head: [['Date & Heure', 'Type', 'Note', 'Montant']],
    body: transactionData,
    theme: 'striped',
    headStyles: { fillColor: [100, 100, 100] },
    styles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' } }
  });

  // Final Totals
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  const presentDays = workerAttendances.filter(a => a.status === 'present').length;
  const paidLeaveDays = workerAttendances.filter(a => a.status === 'leave' && a.isPaid).length;
  const paidSickDays = workerAttendances.filter(a => a.status === 'sick' && a.isPaid).length;
  const absentDays = workerAttendances.filter(a => a.status === 'absent').length;
  const unpaidLeaveDays = workerAttendances.filter(a => a.status === 'leave' && !a.isPaid).length;
  const unpaidSickDays = workerAttendances.filter(a => a.status === 'sick' && !a.isPaid).length;

  const baseSalary = Number(worker.baseSalary) || 0;
  const dailyRate = baseSalary / 26;
  
  let earned = 0;
  if (worker.salaryType === 'daily') {
    earned = (presentDays + paidLeaveDays + paidSickDays) * baseSalary;
  } else {
    const unpaidDays = absentDays + unpaidLeaveDays + unpaidSickDays;
    earned = baseSalary - (unpaidDays * dailyRate);
  }
  earned = Math.max(0, earned);

  const advances = workerTransactions.filter(t => t.type === 'advance').reduce((sum, t) => sum + t.amount, 0);
  const payments = workerTransactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);
  const bonuses = workerTransactions.filter(t => t.type === 'bonus').reduce((sum, t) => sum + t.amount, 0);
  const deductions = workerTransactions.filter(t => t.type === 'deduction').reduce((sum, t) => sum + t.amount, 0);

  const netToPay = earned + bonuses - deductions - advances;
  const remaining = netToPay - payments;

  autoTable(doc, {
    startY: finalY,
    margin: { left: 110 },
    body: [
      ['Salaire de Base', `${baseSalary.toLocaleString()} DT`],
      ['Salaire Dû (Précences)', `${earned.toLocaleString()} DT`],
      ['Total Primes', `+ ${bonuses.toLocaleString()} DT`],
      ['Total Retenues', `- ${deductions.toLocaleString()} DT`],
      ['Total Avances', `- ${advances.toLocaleString()} DT`],
      ['NET À PAYER', `${netToPay.toLocaleString()} DT`],
      ['Déjà Payé', `- ${payments.toLocaleString()} DT`],
      ['RESTE À PAYER', `${remaining.toLocaleString()} DT`],
    ],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 
      0: { fontStyle: 'bold' },
      1: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.row.index === 5 || data.row.index === 7) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 11;
        if (data.row.index === 7) data.cell.styles.textColor = [16, 185, 129];
      }
    }
  });

  doc.save(`Fiche_Paie_${worker.fullName}_${month}.pdf`);
};
