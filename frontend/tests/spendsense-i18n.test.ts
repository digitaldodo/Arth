import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMessage, localizeEvidence } from '../src/lib/i18n/messages.js';

test('categorization guidance has an English default and a Hinglish translation', () => {
  assert.equal(getMessage('category.suggested', 'en-IN', { category: 'Transport' }), 'Possible match: Transport');
  assert.equal(getMessage('category.suggested', 'hi-IN', { category: 'Transport' }), 'Sambhavit category: Transport');
  assert.equal(getMessage('settings.language.title', 'hi-IN'), 'Bhasha');
});

test('categorization evidence prefixes can be localized without altering merchant or category names', () => {
  assert.equal(localizeEvidence('Known merchant matched: Food & Dining', 'hi-IN'), 'Pehchana hua merchant mila: Food & Dining');
  assert.equal(localizeEvidence('Known merchant matched: Food & Dining', 'en-IN'), 'Known merchant matched: Food & Dining');
});
