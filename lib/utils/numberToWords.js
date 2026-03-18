// lib/utils/numberToWords.js

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

function convert_tens(num) {
    if (num < 10) return ones[num];
    else if (num >= 10 && num < 20) return teens[num - 10];
    else {
        return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
    }
}

function convert_hundreds(num) {
    if (num > 99) {
        return ones[Math.floor(num / 100)] + ' Hundred ' + convert_tens(num % 100);
    } else {
        return convert_tens(num);
    }
}

export function numberToWords(num) {
    if (num === 0) return 'Zero';
    if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

    let integerPart = Math.floor(num);
    let decimalPart = Math.round((num - integerPart) * 100);

    let words = '';

    if (integerPart >= 10000000) {
        words += convert_hundreds(Math.floor(integerPart / 10000000)) + ' Crore ';
        integerPart %= 10000000;
    }

    if (integerPart >= 100000) {
        words += convert_hundreds(Math.floor(integerPart / 100000)) + ' Lakh ';
        integerPart %= 100000;
    }

    if (integerPart >= 1000) {
        // Handle thousands properly (up to 99,999)
        const thousandPart = Math.floor(integerPart / 1000);
        if (thousandPart < 100) {
            words += convert_tens(thousandPart) + ' Thousand ';
        } else {
            words += convert_hundreds(thousandPart) + ' Thousand ';
        }
        integerPart %= 1000;
    }

    if (integerPart > 0) {
        words += convert_hundreds(integerPart);
    }

    words = words.trim();

    // Fix empty case
    if (!words && decimalPart === 0) return 'Zero Rupees Only';
    if (!words) words = 'Zero';

    // Add decimal precision for paise
    let result = words + ' Rupees';
    if (decimalPart > 0) {
        result += ' and ' + convert_tens(decimalPart) + ' Paise';
    }

    return result + ' Only';
}
