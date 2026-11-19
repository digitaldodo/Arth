/**
 * Anonymized, privacy-safe statement fixtures for Indian bank and card adapters.
 *
 * PROVENANCE & ANONYMIZATION PROTOCOL:
 * - All account numbers, customer names, branch IFSC codes, and PANs have been replaced
 *   with synthetic masked identifiers (e.g. ••1234, MASKED_BRANCH, [PAN]).
 * - Real layout structures, header names, date formats, Indian digit groupings (e.g., ₹1,23,456.78),
 *   narrations (UPI, NEFT, IMPS, POS, ATM), debit/credit conventions, and running balances
 *   have been preserved to represent authentic statement formats.
 * - Exact paise calculations and balance transitions have been mathematically verified.
 */

export interface BankFixtureDefinition {
  adapterId: string;
  name: string;
  accountType: 'bank' | 'credit_card';
  format: 'csv' | 'table';
  content: string | string[][];
  expected: {
    rowCount: number;
    openingBalancePaise: string;
    closingBalancePaise: string;
    totalDebitsPaise: string;
    totalCreditsPaise: string;
    firstRowDate: string;
    firstRowAmountPaise: number;
    firstRowType: 'income' | 'expense';
    firstRowReference?: string | null;
  };
}

export const SBI_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'sbi',
  name: 'State Bank of India Savings Account CSV',
  accountType: 'bank',
  format: 'csv',
  content: `State Bank of India Statement of Account - Account No: ••••5678
Txn Date,Description,Ref No,Debit,Credit,Balance
01/10/2026,OPENING BALANCE,,,,"25,000.00"
02/10/2026,"UPI/527812983471/Grocery Store/SBIN0001234",REF-SBI-001,"1,250.00",,"23,750.00"
05/10/2026,"NEFT/SALARY CREDIT/EMPLOYER CORP/SBIN0004567",REF-SBI-002,,"75,000.00","98,750.00"
10/10/2026,"ATM CASH WDL/SBI ATM SOUTH EXT/SBIN0009876",REF-SBI-003,"5,000.00",,"93,750.00"
15/10/2026,"INT.PD:01-07-2026 to 30-09-2026",REF-SBI-004,,"625.50","94,375.50"`,
  expected: {
    rowCount: 4,
    openingBalancePaise: '2500000',
    closingBalancePaise: '9437550',
    totalDebitsPaise: '625000',
    totalCreditsPaise: '7562550',
    firstRowDate: '2026-10-02',
    firstRowAmountPaise: 125000,
    firstRowType: 'expense',
    firstRowReference: 'REF-SBI-001',
  },
};

export const HDFC_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'hdfc',
  name: 'HDFC Bank Savings Account NetBanking CSV',
  accountType: 'bank',
  format: 'csv',
  content: `HDFC BANK LIMITED - CUSTOMER STATEMENT - A/C NO ••••9012
Date,Narration,Chq Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
01/11/2026,POS 40129841 SUPERMARKET MUMBAI,HDFC-REF-101,845.50,,45154.50
03/11/2026,UPI-SWIGGY FOOD DELIVERY-SWIGGY@HDFC,HDFC-REF-102,420.00,,44734.50
05/11/2026,ACH C-DIVIDEND TECH CORP,HDFC-REF-103,,1500.00,46234.50
08/11/2026,NEFT DR-TRANSFER TO BROKER-HDFC0000123,HDFC-REF-104,10000.00,,36234.50`,
  expected: {
    rowCount: 4,
    openingBalancePaise: '4600000',
    closingBalancePaise: '3623450',
    totalDebitsPaise: '1126550',
    totalCreditsPaise: '150000',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 84550,
    firstRowType: 'expense',
    firstRowReference: 'HDFC-REF-101',
  },
};

export const ICICI_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'icici',
  name: 'ICICI Bank Savings Account CSV Statement',
  accountType: 'bank',
  format: 'csv',
  content: `ICICI Bank Statement - Account ••••3456
Transaction Date,Value Date,Transaction Remarks,Cheque Number,Withdrawal Amount,Deposit Amount,Balance
01/11/2026,01/11/2026,UPI/1234567890/Coffee Cafe/ICIC0001234,ICI-REF-201,180.00,,52320.00
03/11/2026,03/11/2026,NEFT-REVERSAL OF FAILED CHARGE,ICI-REF-202,,50.00,52370.00
07/11/2026,07/11/2026,BILLPAY ELECTRICITY DISCOM,ICI-REF-203,2450.00,,49920.00`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '5250000',
    closingBalancePaise: '4992000',
    totalDebitsPaise: '263000',
    totalCreditsPaise: '5000',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 18000,
    firstRowType: 'expense',
    firstRowReference: 'ICI-REF-201',
  },
};

export const AXIS_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'axis',
  name: 'Axis Bank Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `Axis Bank Limited - Account Summary ••••7890
Tran Date,Particulars,Chq No,Debit,Credit,Balance
02/11/2026,MOB/UPI/628192849182/PHARMACY,AXIS-REF-301,650.00,,28350.00
05/11/2026,NEFT/CREDIT/FREELANCE PAYMENT,AXIS-REF-302,,18000.00,46350.00
09/11/2026,ATM-CASH-WITHDRAWAL-BLR,AXIS-REF-303,2000.00,,44350.00`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '2900000',
    closingBalancePaise: '4435000',
    totalDebitsPaise: '265000',
    totalCreditsPaise: '1800000',
    firstRowDate: '2026-11-02',
    firstRowAmountPaise: 65000,
    firstRowType: 'expense',
    firstRowReference: 'AXIS-REF-301',
  },
};

export const KOTAK_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'kotak',
  name: 'Kotak Mahindra Bank Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `Kotak Mahindra Bank Account Statement ••••2345
Date,Description,Chq Ref No,Withdrawal (Dr),Deposit (Cr),Balance
01/11/2026,UPI/SHOPPING MALL/KKBK0000123,KTK-REF-401,1499.00,,61201.00
04/11/2026,INTEREST CREDIT QUARTERLY,KTK-REF-402,,450.25,61651.25
06/11/2026,FUEL STATION CARD SWIPE,KTK-REF-403,800.00,,60851.25`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '6270000',
    closingBalancePaise: '6085125',
    totalDebitsPaise: '229900',
    totalCreditsPaise: '45025',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 149900,
    firstRowType: 'expense',
    firstRowReference: 'KTK-REF-401',
  },
};

export const PNB_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'pnb',
  name: 'Punjab National Bank Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `Punjab National Bank - Customer Ledger ••••6789
Transaction Date,Description,Cheque Number,Withdrawals,Deposits,Balance
01/11/2026,UPI-MILK DAIRY-PUNB0000123,PNB-REF-501,120.00,,18880.00
03/11/2026,CASH DEPOSIT BRANCH,PNB-REF-502,,5000.00,23880.00
05/11/2026,UTILITY BILL MOBILE RECHARGE,PNB-REF-503,299.00,,23581.00`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '1900000',
    closingBalancePaise: '2358100',
    totalDebitsPaise: '41900',
    totalCreditsPaise: '500000',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 12000,
    firstRowType: 'expense',
    firstRowReference: 'PNB-REF-501',
  },
};

export const BOB_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'bob',
  name: 'Bank of Baroda Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `Bank of Baroda Account Statement ••••4321
Post Date,Details,Chq Ref Number,Debit,Credit,Balance
02/11/2026,BOOK STORE ONLINE,BOB-REF-601,450.00,,32150.00
04/11/2026,REFUND PROCESSED BY STORE,BOB-REF-602,,150.00,32300.00
08/11/2026,GROCERY OUTLET,BOB-REF-603,890.00,,31410.00`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '3260000',
    closingBalancePaise: '3141000',
    totalDebitsPaise: '134000',
    totalCreditsPaise: '15000',
    firstRowDate: '2026-11-02',
    firstRowAmountPaise: 45000,
    firstRowType: 'expense',
    firstRowReference: 'BOB-REF-601',
  },
};

export const CANARA_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'canara',
  name: 'Canara Bank Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `Canara Bank - Passbook Sheet ••••8765
Tran Date,Particulars,Cheque No,Debit,Credit,Balance
01/11/2026,UPI-MEDICAL CLINIC,CNRB-REF-701,500.00,,21500.00
03/11/2026,RENT CREDIT FROM TENANT,CNRB-REF-702,,12000.00,33500.00
06/11/2026,BROADBAND INTERNET BILL,CNRB-REF-703,999.00,,32501.00`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '2200000',
    closingBalancePaise: '3250100',
    totalDebitsPaise: '149900',
    totalCreditsPaise: '1200000',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 50000,
    firstRowType: 'expense',
    firstRowReference: 'CNRB-REF-701',
  },
};

export const IDFC_SAVINGS_FIXTURE: BankFixtureDefinition = {
  adapterId: 'idfc_first',
  name: 'IDFC FIRST Bank Statement CSV',
  accountType: 'bank',
  format: 'csv',
  content: `IDFC FIRST Bank Statement of Accounts ••••1122
Transaction Date,Particulars,Reference Number,Debit,Credit,Balance
01/11/2026,RESTAURANT PAYMENT,IDFC-REF-801,1120.00,,74880.00
04/11/2026,MONTHLY INTEREST CREDIT,IDFC-REF-802,,350.50,75230.50
07/11/2026,ONLINE STREAMING SUB,IDFC-REF-803,499.00,,74731.50`,
  expected: {
    rowCount: 3,
    openingBalancePaise: '7600000',
    closingBalancePaise: '7473150',
    totalDebitsPaise: '161900',
    totalCreditsPaise: '35050',
    firstRowDate: '2026-11-01',
    firstRowAmountPaise: 112000,
    firstRowType: 'expense',
    firstRowReference: 'IDFC-REF-801',
  },
};

export const CREDIT_CARD_FIXTURE: BankFixtureDefinition = {
  adapterId: 'credit_card_generic',
  name: 'Credit Card Statement CSV',
  accountType: 'credit_card',
  format: 'csv',
  content: `Credit Card Account Statement - Card Ending ••••9988 - Total Amount Due: 18,250.00
Transaction Date,Transaction Details,Reference Number,Debit,Credit,Balance
05/10/2026,AIRLINE TICKET BOOKING,CC-REF-901,12450.00,,12450.00
10/10/2026,HOTEL RESERVATION,CC-REF-902,5800.00,,18250.00
15/10/2026,CREDIT CARD BILL PAYMENT NEFT,CC-REF-903,,10000.00,8250.00
18/10/2026,MERCHANT CASHBACK REWARD,CC-REF-904,,250.00,8000.00`,
  expected: {
    rowCount: 4,
    openingBalancePaise: '0',
    closingBalancePaise: '800000',
    totalDebitsPaise: '1825000',
    totalCreditsPaise: '1025000',
    firstRowDate: '2026-10-05',
    firstRowAmountPaise: 1245000,
    firstRowType: 'expense',
    firstRowReference: 'CC-REF-901',
  },
};

export const ALL_BANK_FIXTURES: BankFixtureDefinition[] = [
  SBI_SAVINGS_FIXTURE,
  HDFC_SAVINGS_FIXTURE,
  ICICI_SAVINGS_FIXTURE,
  AXIS_SAVINGS_FIXTURE,
  KOTAK_SAVINGS_FIXTURE,
  PNB_SAVINGS_FIXTURE,
  BOB_SAVINGS_FIXTURE,
  CANARA_SAVINGS_FIXTURE,
  IDFC_SAVINGS_FIXTURE,
  CREDIT_CARD_FIXTURE,
];
