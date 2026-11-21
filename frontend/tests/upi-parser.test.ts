import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCounterpartyAndPaymentMethod,
  toCleanTitleCase,
  normalizeMerchantKey,
} from '../src/features/categorization/upi-parser.js';

describe('UPI Intelligence and Counterparty Extraction', () => {
  it('correctly handles UPI P2M merchant payment with RRN and VPA', () => {
    const raw = 'UPI-R S DAIRY-9876543210@paytm-UPI-123456789012-PAYMENT';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, true);
    assert.equal(result.paymentMethod, 'upi');
    assert.equal(result.cleanName, 'R S Dairy');
    assert.equal(result.merchantKey, 'r s dairy');
  });

  it('correctly handles UPI slash format with DR/RRN and person name', () => {
    const raw = 'UPI/DR/432198765432/HARSHIT YADAV/PYTM/harshit@paytm/Payment';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, true);
    assert.equal(result.paymentMethod, 'upi');
    assert.equal(result.cleanName, 'Harshit Yadav');
    assert.equal(result.merchantKey, 'harshit yadav');
  });

  it('correctly handles UPI P2M with coffee merchant and HDFC handle', () => {
    const raw = 'UPI/P2M/329871029381/STARBUCKS COFFEE/HDFC/starbucks@hdfc';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, true);
    assert.equal(result.paymentMethod, 'upi');
    assert.equal(result.cleanName, 'Starbucks Coffee');
  });

  it('correctly extracts merchant from VPA when no standalone merchant segment', () => {
    const raw = 'UPI-zomato.order@icici-123456789012';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, true);
    assert.equal(result.paymentMethod, 'upi');
    assert.ok(result.cleanName.toLowerCase().includes('zomato'));
  });

  it('correctly strips GST, URLs and masked card digits from POS transactions', () => {
    const raw = 'POS 4123********1234 STARBUCKS CAFE MUMBAI IN GST: 27AAAAA0000A1Z5';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, false);
    assert.equal(result.paymentMethod, 'online');
    assert.ok(result.cleanName.toLowerCase().includes('starbucks cafe'));
    assert.equal(result.cleanName.includes('27AAAAA'), false);
    assert.equal(result.cleanName.includes('********'), false);
  });

  it('correctly detects ATM cash withdrawals as cash payment method', () => {
    const raw = 'ATM WDL-12345678-MUMBAI BRANCH';
    const result = extractCounterpartyAndPaymentMethod(raw, 'expense');

    assert.equal(result.isUpi, false);
    assert.equal(result.paymentMethod, 'cash');
    assert.ok(result.cleanName.includes('Cash Withdrawal'));
  });

  it('toCleanTitleCase formats uppercase words properly while preserving acronyms', () => {
    assert.equal(toCleanTitleCase('R S DAIRY'), 'R S Dairy');
    assert.equal(toCleanTitleCase('HDFC BANK'), 'HDFC Bank');
    assert.equal(toCleanTitleCase('SWIGGY INSTAMART'), 'Swiggy Instamart');
  });

  it('normalizeMerchantKey normalizes punctuation and spacing', () => {
    assert.equal(normalizeMerchantKey('R S Dairy!'), 'r s dairy');
    assert.equal(normalizeMerchantKey('Swiggy-Instamart'), 'swiggy instamart');
  });
});
