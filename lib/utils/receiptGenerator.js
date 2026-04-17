// lib/utils/receiptGenerator.js
import * as Print from 'expo-print';
import { numberToWords } from './numberToWords';

export async function generateReceiptPDF({
    schoolDetails,
    studentDetails,
    paymentDetails,
    selectedMonths,
    isPromotionReceipt,
    receiptSettings = {}
}) {
    const { name, logoUrl, address, website, phone, slogan } = schoolDetails;
    const { receiptNo, date, totalAmount, paidAmount, balance, mode, collectedBy } = paymentDetails;
    const { admissionNo, studentName, fatherName, session, className } = studentDetails;

    const {
        receiptPaperSize = 'a4',
        showSchoolLogo = true,
        showBalanceDue = true,
        showPaymentMode = true,
        showSignatureLine = true,
        receiptFooterText = ''
    } = receiptSettings;
    const normalizedPaperSize = receiptPaperSize === 'thermal' || receiptPaperSize === 'letter' ? receiptPaperSize : 'a4';
    const pageRule = normalizedPaperSize === 'thermal'
        ? 'margin: 0; size: 80mm auto;'
        : normalizedPaperSize === 'letter'
            ? 'size: Letter portrait; margin: 10mm;'
            : 'size: A4 portrait; margin: 10mm;';
    const bodyFontSize = normalizedPaperSize === 'thermal' ? '11px' : '14px';
    const bodyPadding = normalizedPaperSize === 'thermal' ? '10px' : '20px';
    const bodyWidth = normalizedPaperSize === 'thermal' ? '76mm' : '100%';

    const formattedDate = new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const timeString = new Date(date).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });

    const receiptTitle = isPromotionReceipt ? 'Promotion Receipt' : 'Fee Receipt';

    // Build the month string (e.g., "July,August,September")
    const monthsString = selectedMonths.join(',');

    // Group fees by component mapping from selected months' components
    const componentMap = {};
    let totalLateFee = 0;
    
    selectedMonths.forEach(month => {
        // We pass the raw component breakdown if provided, otherwise default fallback
        if (month.components) {
            month.components.forEach(comp => {
                if (comp.name.toLowerCase().includes('late')) {
                    totalLateFee += parseFloat(comp.amount);
                } else {
                    if (!componentMap[comp.name]) componentMap[comp.name] = 0;
                    componentMap[comp.name] += parseFloat(comp.amount);
                }
            });
        }
    });

    let tableRows = '';
    for (const [headName, amount] of Object.entries(componentMap)) {
        tableRows += `
        <tr>
            <td style="text-align: left;"># ${headName.toUpperCase()}</td>
            <td style="text-align: right;">0.0</td>
            <td style="text-align: right;">${amount.toFixed(1)}</td>
        </tr>`;
    }
    
    // Add late fee row
    tableRows += `
        <tr>
            <td style="text-align: left;"># Late Fee</td>
            <td style="text-align: right;">0.0</td>
            <td style="text-align: right;">${totalLateFee.toFixed(1)}</td>
        </tr>`;

    let html = `
        <html>
            <head>
                <style>
                    @page { ${pageRule} }
                    body {
                        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                        font-size: ${bodyFontSize};
                        margin: 0;
                        padding: ${bodyPadding};
                        width: ${bodyWidth};
                        color: #000;
                    }
                    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
                    .header img { max-width: 50px; max-height: 50px; margin-bottom: 3px; }
                    .header h2 { margin: 0; font-size: 16px; text-transform: uppercase; }
                    .header p { margin: 2px 0; font-size: 10px; }
                    .title { text-align: center; font-weight: bold; font-size: 13px; text-transform: uppercase; margin: 8px 0; text-decoration: underline; }
                    
                    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
                    
                    .info-table td { padding: 2px 0; vertical-align: top;}
                    .info-table td:nth-child(even) { text-align: left; }
                    
                    .items-table { border-top: 1px solid #000; border-bottom: 1px solid #000; margin-top: 5px; }
                    .items-table th { border-bottom: 1px solid #000; padding: 4px 0; text-align: right; }
                    .items-table th:first-child { text-align: left; }
                    .items-table td { padding: 4px 0; border-bottom: 1px dotted #ccc; }
                    
                    .totals-box { width: 100%; margin-top: 10px; font-size: 10px; }
                    .totals-box td { padding: 2px 0; }
                    
                    .footer { border-top: 1px solid #000; margin-top: 15px; padding-top: 5px; font-size: 10px; }
                    .signature-box { margin-top: 30px; display: flex; justify-content: space-between; }
                    .signature { border-top: 1px solid #000; width: 45%; text-align: center; font-size: 9px; padding-top: 2px; }
                    .words { font-style: italic; font-weight: bold; border-top: 1px solid #000; margin-top: 5px; padding-top: 5px;}
                </style>
            </head>
            <body>
                <div class="header">
                    ${(showSchoolLogo && logoUrl) ? `<img src="${logoUrl}" />` : ''}
                    <h2>${name}</h2>
                    <p>${address}</p>
                    <p>${slogan ? slogan : ''}</p>
                    <p>Phone: ${phone}</p>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                        <span style="font-weight: bold; text-decoration: underline;">${receiptTitle}</span>
                        <span>Student's Copy</span>
                    </div>
                </div>

                <table class="info-table">
                    <tr>
                        <td style="width: 25%;">RcptNo</td>
                        <td style="width: 25%;">:${receiptNo}</td>
                        <td style="width: 25%;">Admn No</td>
                        <td style="width: 25%;">:${admissionNo}</td>
                    </tr>
                    <tr>
                        <td>Name</td>
                        <td>:${studentName}</td>
                        <td>Date</td>
                        <td>:${formattedDate}</td>
                    </tr>
                    <tr>
                        <td>F.Name</td>
                        <td>:${fatherName || 'N/A'}</td>
                        <td>Session</td>
                        <td>:${session}</td>
                    </tr>
                    <tr>
                        <td>Month</td>
                        <td colspan="3">:${monthsString}</td>
                    </tr>
                </table>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th style="width: 50%;">Head Name</th>
                            <th style="width: 25%;">Prev. Dues</th>
                            <th style="width: 25%;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>

                <table class="totals-box">
                    <tr>
                        <td style="vertical-align: top; width: 45%;">
                            Collected By:<br/><b>${collectedBy}</b><br/><br/>
                            Time: ${timeString}<br/>
                            ${showPaymentMode ? `PayMode: By ${mode}` : ''}
                        </td>
                        <td style="width: 55%;">
                            <table style="width: 100%;">
                                <tr><td>Fee Total</td><td>:</td><td style="text-align: right;">${totalAmount.toFixed(1)}</td></tr>
                                <tr><td>Grand Total</td><td>:</td><td style="text-align: right;">${totalAmount.toFixed(1)}</td></tr>
                                <tr><td colspan="3"><hr style="border-top:1px dashed #000; margin:3px 0;"/></td></tr>
                                <tr><td>Payable Amt</td><td>:</td><td style="text-align: right;">${totalAmount.toFixed(1)}</td></tr>
                                <tr><td>Paid Amt</td><td>:</td><td style="text-align: right;">${paidAmount.toFixed(1)}</td></tr>
                                ${showBalanceDue ? `<tr><td>Curr. Dues</td><td>:</td><td style="text-align: right;">${balance.toFixed(1)}</td></tr>` : ''}
                            </table>
                        </td>
                    </tr>
                </table>

                <div class="words">
                    Amount In Word: ${numberToWords(paidAmount)}
                </div>

                ${showSignatureLine ? `
                <div class="signature-box">
                    <div class="signature">Signature of Cashier</div>
                    <div class="signature">Signature of Depositor</div>
                </div>
                ` : ''}

                ${receiptFooterText ? `
                <div style="text-align: center; font-size: 9px; margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 5px;">
                    ${receiptFooterText}
                </div>
                ` : ''}
            </body>
        </html>
    `;

    // Generate Silent PDF (no print dialog box)
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
}
