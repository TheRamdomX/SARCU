import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Expense {
  id: string;
  workerId?: string;
  workerName?: string;
  concept: string;
  amount: number;
  photo: string;
  date: Date;
}

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatDateShort = (date: Date) => {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getImageDataUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(error);
    return '';
  }
};

export const downloadSingleExpensePDF = async (expense: any) => {
  try {
    const doc = new jsPDF();
    const logoBase64 = await fetchLogoAsBase64('/c-mvt_logo.png');
    
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 15, 12, 14, 14); 
    }

    doc.setTextColor(8, 145, 178);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text('COMPROBANTE DE GASTO', 195, 18, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text(`Sistema COARFE - Folio: ${expense.id.slice(0, 8).toUpperCase()}`, 195, 24, { align: 'right' });

    doc.setDrawColor(8, 145, 178);
    doc.setLineWidth(0.8);
    doc.line(15, 30, 195, 30);

    autoTable(doc, {
      startY: 38,
      body: [
        ['Folio de Operación', expense.id],
        ['Trabajador', expense.workerName || 'Desconocido'],
        ['Concepto del Gasto', expense.concept],
        ['Fecha de Registro', formatDate(expense.date)],
        ['Monto Total', `$${expense.amount.toLocaleString('es-CL')}`],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [100, 116, 139], fillColor: [248, 250, 252], cellWidth: 60 },
        1: { textColor: [51, 65, 85] }
      },
      alternateRowStyles: { fillColor: [255, 255, 255] }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 12;

    if (expense.photo) {
      try {
        const imageData = await getImageDataUrl(expense.photo);
        if (imageData) {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.roundedRect(15, currentY, 180, 10, 2, 2, 'FD');

          doc.setFontSize(10);
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "bold");
          doc.text('EVIDENCIA FOTOGRÁFICA', 105, currentY + 7, { align: 'center' });

          currentY += 15;

          const imgProps = doc.getImageProperties(imageData);
          const maxImgWidth = 180;
          const maxImgHeight = 280 - currentY; 

          let finalWidth = maxImgWidth;
          let finalHeight = (imgProps.height * maxImgWidth) / imgProps.width;

          if (finalHeight > maxImgHeight) {
              finalHeight = maxImgHeight;
              finalWidth = (imgProps.width * maxImgHeight) / imgProps.height;
          }

          const xOffset = (210 - finalWidth) / 2;

          doc.setDrawColor(226, 232, 240);
          doc.rect(xOffset - 1, currentY - 1, finalWidth + 2, finalHeight + 2);
          doc.addImage(imageData, 'JPEG', xOffset, currentY, finalWidth, finalHeight);
        }
      } catch (error) {
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text('Error al cargar la imagen de evidencia', 105, currentY + 20, { align: 'center' });
      }
    }

    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, pageHeight - 15, 195, pageHeight - 15);

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el ${formatDate(new Date())} - Sistema COARFE`, 15, pageHeight - 10);

    const safeDate = formatDateShort(expense.date).replace(/\//g, '-');
    doc.save(`rendicion_${expense.id.slice(0,8)}_${safeDate}.pdf`);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};



const fetchLogoAsBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('No se pudo cargar el logo para el PDF');
        return '';
    }
};

export const downloadMultipleExpensesPDF = async (expenses: any[], title: string) => {
    try {
        const doc = new jsPDF();
        let pageNumber = 1;

        const logoBase64 = await fetchLogoAsBase64('/c-mvt_logo.png');

        const imagesBase64 = await Promise.all(
            expenses.map(exp => exp.photo ? getImageDataUrl(exp.photo) : Promise.resolve(''))
        );

        const addFooter = () => {
            const pageHeight = doc.internal.pageSize.height;
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(15, pageHeight - 15, 195, pageHeight - 15);
            
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.setFont("helvetica", "normal");
            doc.text(`Generado el ${formatDateShort(new Date())} - Sistema CMVT`, 15, pageHeight - 10);
            doc.text(`Página ${pageNumber}`, 195, pageHeight - 10, { align: 'right' });
            pageNumber++;
        };

        const drawHeader = (mainTitle: string, subtitle: string) => {
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 15, 12, 14, 14);
            }

            doc.setTextColor(8, 145, 178);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(18);
            doc.text(mainTitle, 195, 18, { align: 'right' });
            
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.setFont("helvetica", "normal");
            doc.text(subtitle, 195, 24, { align: 'right' });

            doc.setDrawColor(8, 145, 178);
            doc.setLineWidth(0.8);
            doc.line(15, 30, 195, 30);
        };

        drawHeader('REPORTE GENERAL DE GASTOS', `CMVT - ${title}`);

        const tableData = expenses.map(exp => [
            exp.id.slice(0, 8).toUpperCase(),
            exp.workerName || 'Desconocido',
            exp.concept,
            formatDateShort(exp.date),
            `$${exp.amount.toLocaleString('es-CL')}`
        ]);

        autoTable(doc, {
            startY: 38,
            head: [['Folio', 'Trabajador', 'Concepto', 'Fecha', 'Monto']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [8, 145, 178], textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 4, textColor: [40, 40, 40] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { fontStyle: 'bold', textColor: [100, 116, 139] },
                4: { halign: 'right', fontStyle: 'bold', textColor: [8, 145, 178] }
            },
        });

        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(115, finalY - 8, 80, 16, 2, 2, 'FD');

        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "normal");
        doc.text('Total Acumulado:', 120, finalY + 2);

        doc.setFontSize(12);
        doc.setTextColor(8, 145, 178);
        doc.setFont("helvetica", "bold");
        doc.text(`$${total.toLocaleString('es-CL')}`, 190, finalY + 2, { align: 'right' });

        addFooter();

        for (let i = 0; i < expenses.length; i++) {
            const exp = expenses[i];
            const imgData = imagesBase64[i];

            if (imgData) {
                doc.addPage();
                
                drawHeader('ANEXO DE EVIDENCIA', `Folio: ${exp.id.toUpperCase()}`);

                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.roundedRect(15, 38, 180, 28, 3, 3, 'FD');

                doc.setFontSize(9);
                doc.setTextColor(148, 163, 184);
                doc.setFont("helvetica", "normal");
                doc.text('TRABAJADOR', 20, 46);
                doc.text('CONCEPTO', 85, 46);
                doc.text('FECHA', 145, 46);
                doc.text('MONTO', 175, 46);

                doc.setFontSize(10);
                doc.setTextColor(51, 65, 85);
                doc.setFont("helvetica", "bold");
                doc.text(`${exp.workerName || 'Desconocido'}`, 20, 54);
                doc.text(`${exp.concept}`, 85, 54);
                doc.text(`${formatDateShort(exp.date)}`, 145, 54);
                
                doc.setTextColor(8, 145, 178);
                doc.text(`$${exp.amount.toLocaleString('es-CL')}`, 175, 54);

                try {
                    const imgProps = doc.getImageProperties(imgData);
                    const maxImgWidth = 180;
                    const maxImgHeight = 190;
                    
                    let finalWidth = maxImgWidth;
                    let finalHeight = (imgProps.height * maxImgWidth) / imgProps.width;

                    if (finalHeight > maxImgHeight) {
                        finalHeight = maxImgHeight;
                        finalWidth = (imgProps.width * maxImgHeight) / imgProps.height;
                    }

                    const xOffset = (210 - finalWidth) / 2;
                    const yOffset = 75;
                    
                    doc.setDrawColor(226, 232, 240);
                    doc.rect(xOffset - 1, yOffset - 1, finalWidth + 2, finalHeight + 2);
                    doc.addImage(imgData, 'JPEG', xOffset, yOffset, finalWidth, finalHeight);
                } catch (e) {
                    doc.setFontSize(10);
                    doc.setTextColor(150, 150, 150);
                    doc.text('Error al cargar la imagen de evidencia', 105, 120, { align: 'center' });
                }

                addFooter();
            }
        }

        doc.save(`CMVT_Gastos_${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
        return true;
    } catch (error) {
        console.error('Error generando reporte:', error);
        return false;
    }
};