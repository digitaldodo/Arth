import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTaxFieldCandidates,
  FORM_ADAPTERS,
  maskIdentifiers,
} from '../src/features/tax/document-extractor.js';

test('FORM_ADAPTERS registry covers all primary Indian tax forms and investment certificates', () => {
  const ids = FORM_ADAPTERS.map((a) => a.id);
  assert.ok(ids.includes('form16'), 'Form 16 adapter must exist');
  assert.ok(ids.includes('form16a'), 'Form 16A adapter must exist');
  assert.ok(ids.includes('statement'), 'AIS/26AS statement adapter must exist');
  assert.ok(ids.includes('payslip'), 'Payslip adapter must exist');
  assert.ok(ids.includes('investment_80c'), '80C investment adapter must exist');
  assert.ok(ids.includes('health_insurance'), '80D health insurance adapter must exist');
  assert.ok(ids.includes('home_loan'), 'Home loan adapter must exist');
  assert.ok(ids.includes('education_loan'), 'Education loan adapter must exist');
  assert.ok(ids.includes('nps'), 'NPS adapter must exist');
  assert.ok(ids.includes('donations'), 'Donations adapter must exist');
});

test('Form 16: extracts salary breakdown, standard deduction, TDS, and cross-checks taxable vs gross', () => {
  const form16Text = `
[PAGE 1]
Certificate under Section 203 of the Income-tax Act, 1961
Employer PAN: ABCDE1234F Employee PAN: FGHIJ5678K
Gross Salary: 15,00,000
Exemptions under section 10: 1,00,000
Standard Deduction under section 16(ia): 50,000
Total Taxable Salary: 13,50,000
Total Tax Deducted: 1,45,000
`;
  const candidates = detectTaxFieldCandidates(form16Text, 'text_pdf', 'form16');

  const gross = candidates.find((c) => c.key === 'salary.gross');
  const exemptions = candidates.find((c) => c.key === 'salary.exemptions');
  const stdDed = candidates.find((c) => c.key === 'salary.standard_deduction');
  const taxable = candidates.find((c) => c.key === 'salary.taxable');
  const tds = candidates.find((c) => c.key === 'tax.tds');

  assert.equal(gross?.value, '1500000');
  assert.equal(exemptions?.value, '100000');
  assert.equal(stdDed?.value, '50000');
  assert.equal(taxable?.value, '1350000');
  assert.equal(tds?.value, '145000');

  // Verify page provenance
  assert.equal(gross?.page, 1);
  assert.equal(tds?.page, 1);

  // Form 16 cross check: when taxable <= gross, no warning
  assert.equal(taxable?.crossCheckWarning, undefined);

  // Cross check warning triggered when taxable > gross
  const invalidForm16Text = `
[PAGE 1]
Gross Salary: 10,00,000
Income chargeable under the head salaries: 12,00,000
`;
  const invalidCandidates = detectTaxFieldCandidates(invalidForm16Text, 'text_pdf', 'form16');
  const invalidTaxable = invalidCandidates.find((c) => c.key === 'salary.taxable');
  assert.ok(invalidTaxable?.crossCheckWarning?.includes('Taxable salary exceeds gross salary'));
  assert.ok((invalidTaxable?.confidence ?? 1) < 0.74, 'Confidence should be reduced on cross-check warning');
});

test('Form 16A: extracts interest income and TDS with TAN/PAN masking', () => {
  const form16aText = `
[PAGE 2]
FORM NO. 16A - TDS Certificate
TAN of Deductor: BLRM12345A PAN of Deductee: ABCDE1234F
Gross Interest Paid: 84,500
Amount of Tax Deducted: 8,450
`;
  const candidates = detectTaxFieldCandidates(form16aText, 'text_pdf', 'form16a');
  const interest = candidates.find((c) => c.key === 'income.interest');
  const tds = candidates.find((c) => c.key === 'tax.tds');

  assert.equal(interest?.value, '84500');
  assert.equal(interest?.page, 2);
  assert.equal(tds?.value, '8450');
  assert.equal(tds?.page, 2);

  // Check masking in location
  assert.ok(!interest?.location.includes('ABCDE1234F'));
  assert.ok(!interest?.location.includes('BLRM12345A'));
});

test('Annual Information Statement (AIS/26AS): extracts TDS credits and interest', () => {
  const aisText = `
[PAGE 1]
Annual Information Statement (AIS) - Income-tax Department
PAN: ABCDE1234F Financial Year: 2025-26
Interest from Savings Bank: 12,400
TDS/TCS Credit: 42,000
`;
  const candidates = detectTaxFieldCandidates(aisText, 'text_pdf', 'ais');
  const interest = candidates.find((c) => c.key === 'income.interest');
  const tds = candidates.find((c) => c.key === 'tax.tds');

  assert.equal(interest?.value, '12400');
  assert.equal(tds?.value, '42000');
});

test('Payslip: extracts gross earnings, EPF contribution under 80C, and TDS', () => {
  const payslipText = `
[PAGE 1]
Payslip for Month: October 2025
Gross Earnings: 1,25,000
EPF Employee Contribution: 9,000
Tax Deducted at Source: 12,500
`;
  const candidates = detectTaxFieldCandidates(payslipText, 'text_pdf', 'payslip');
  const gross = candidates.find((c) => c.key === 'salary.gross');
  const epf = candidates.find((c) => c.key === 'deduction.section_80c');
  const tds = candidates.find((c) => c.key === 'tax.tds');

  assert.equal(gross?.value, '125000');
  assert.equal(epf?.value, '9000');
  assert.equal(tds?.value, '12500');
});

test('Home Loan Statement: extracts interest under 24(b) and principal repayment under 80C', () => {
  const homeLoanText = `
[PAGE 1]
Provisional Interest Certificate for Housing Loan
Borrower PAN: ABCDE1234F
Interest on Housing Loan: 1,84,200
Housing Loan Principal: 72,500
`;
  const candidates = detectTaxFieldCandidates(homeLoanText, 'text_pdf', 'home_loan');
  const interest = candidates.find((c) => c.key === 'deduction.home_loan_interest');
  const principal = candidates.find((c) => c.key === 'deduction.section_80c');

  assert.equal(interest?.value, '184200');
  assert.equal(interest?.formSection, 'Section 24(b) / Section 22');
  assert.equal(principal?.value, '72500');
  assert.equal(principal?.formSection, 'Section 80C / Schedule XV');
});

test('Health Insurance & Education Loan & NPS & Donations receipts extract cleanly', () => {
  const healthInsuranceText = `
[PAGE 1]
Premium Paid Certificate for Health Insurance
Medical Insurance Premium: 24,800
`;
  const healthCandidates = detectTaxFieldCandidates(healthInsuranceText, 'text_pdf', 'health_insurance');
  const health = healthCandidates.find((c) => c.key === 'deduction.section_80d');
  assert.equal(health?.value, '24800');

  const educationLoanText = `
[PAGE 1]
Education Loan Interest Certificate
Interest on Education Loan: 65,000
`;
  const eduCandidates = detectTaxFieldCandidates(educationLoanText, 'text_pdf', 'education_loan');
  const edu = eduCandidates.find((c) => c.key === 'deduction.education_loan_interest');
  assert.equal(edu?.value, '65000');

  const npsText = `
[PAGE 1]
NPS Contribution Statement (PRAN 110022334455)
Additional NPS Deduction: 50,000
Employer Contribution to NPS: 75,000
`;
  const npsCandidates = detectTaxFieldCandidates(npsText, 'text_pdf', 'nps');
  const npsSelf = npsCandidates.find((c) => c.key === 'deduction.section_80ccd_1b');
  const npsEmp = npsCandidates.find((c) => c.key === 'deduction.employer_nps');
  assert.equal(npsSelf?.value, '50000');
  assert.equal(npsEmp?.value, '75000');

  const donationText = `
[PAGE 1]
Donation Receipt under Section 80G
Eligible Donation Amount: 15,000
`;
  const donationCandidates = detectTaxFieldCandidates(donationText, 'text_pdf', 'donation');
  const donation = donationCandidates.find((c) => c.key === 'deduction.donations');
  assert.equal(donation?.value, '15000');
});

test('Extraction confidence reflects method: text_pdf > spreadsheet > ocr_local', () => {
  const text = 'Gross Salary: 10,00,000';
  const pdfCandidates = detectTaxFieldCandidates(text, 'text_pdf');
  const sheetCandidates = detectTaxFieldCandidates(text, 'spreadsheet');
  const ocrCandidates = detectTaxFieldCandidates(text, 'ocr_local');

  assert.equal(pdfCandidates[0]?.confidence, 0.79);
  assert.equal(sheetCandidates[0]?.confidence, 0.68);
  assert.equal(ocrCandidates[0]?.confidence, 0.52);
});

test('maskIdentifiers securely removes PAN, TAN, and long account/card numbers', () => {
  const raw = 'Account 12345678901234 with PAN ABCDE1234F and TAN BLRM99999Z';
  const masked = maskIdentifiers(raw);
  assert.ok(!masked.includes('ABCDE1234F'));
  assert.ok(!masked.includes('BLRM99999Z'));
  assert.ok(!masked.includes('12345678901234'));
  assert.ok(masked.includes('[MASKED_PAN]'));
  assert.ok(masked.includes('[MASKED_TAN]'));
  assert.ok(masked.includes('[MASKED_IDENTIFIER]'));
});
