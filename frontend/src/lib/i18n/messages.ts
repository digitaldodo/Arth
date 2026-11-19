export type SpendSenseLocale = 'en-IN' | 'hi-IN';
export type SpendSenseMessageKey =
  | 'settings.language.title'
  | 'settings.language.description'
  | 'settings.language.english'
  | 'settings.language.hinglish'
  | 'category.label'
  | 'category.loading'
  | 'category.rememberMerchant'
  | 'category.merchantRuleSaved'
  | 'category.suggested'
  | 'category.ruleAgreement'
  | 'category.confirmBeforeSaving'
  | 'category.useSuggestion'
  | 'category.correctionSaved'
  | 'category.notSharedTraining'
  | 'category.yourCorrection';

const messages: Record<SpendSenseLocale, Record<SpendSenseMessageKey, string>> = {
  'en-IN': {
    'settings.language.title': 'Language',
    'settings.language.description': 'Choose the language used for transaction categorization guidance.',
    'settings.language.english': 'English (India)',
    'settings.language.hinglish': 'Hinglish',
    'category.label': 'Category',
    'category.loading': 'Loading categories…',
    'category.rememberMerchant': 'Remember this category for this merchant',
    'category.merchantRuleSaved': 'Saved for this merchant on this account.',
    'category.suggested': 'Possible match: {category}',
    'category.ruleAgreement': 'Weak-label agreement {percent}%',
    'category.confirmBeforeSaving': 'Rule-based suggestion; confirm before saving',
    'category.useSuggestion': 'Use suggestion',
    'category.correctionSaved': 'Your correction was saved locally for this account.',
    'category.notSharedTraining': 'It does not train the shared model.',
    'category.yourCorrection': 'Matches your saved correction',
  },
  'hi-IN': {
    'settings.language.title': 'Bhasha',
    'settings.language.description': 'Transaction category guidance ke liye bhasha chunein.',
    'settings.language.english': 'English (India)',
    'settings.language.hinglish': 'Hinglish',
    'category.label': 'Category',
    'category.loading': 'Categories load ho rahi hain…',
    'category.rememberMerchant': 'Is merchant ke liye yeh category yaad rakhein',
    'category.merchantRuleSaved': 'Is account mein merchant ke liye save hua.',
    'category.suggested': 'Sambhavit category: {category}',
    'category.ruleAgreement': 'Rule agreement {percent}%',
    'category.confirmBeforeSaving': 'Rule-based sujhaav; save karne se pehle confirm karein',
    'category.useSuggestion': 'Sujhaav chunen',
    'category.correctionSaved': 'Aapka correction is account ke liye isi browser mein save hua.',
    'category.notSharedTraining': 'Yeh shared model ko train nahi karta.',
    'category.yourCorrection': 'Aapke pehle save kiye correction se mila',
  },
};

export function getMessage(key: SpendSenseMessageKey, locale: SpendSenseLocale = 'en-IN', values: Record<string, string | number> = {}): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

export function localizeEvidence(text: string, locale: SpendSenseLocale): string {
  if (locale === 'en-IN') return text;
  return text
    .replace(/^merchant alias$/, 'merchant alias')
    .replace(/^transaction context$/, 'transaction context')
    .replace(/^your saved correction$/, 'aapka saved correction')
    .replace(/^Known merchant matched:/, 'Pehchana hua merchant mila:')
    .replace(/^Narration context matched:/, 'Description ka context mila:')
    .replace(/^You previously assigned this merchant to/, 'Aapne pehle is merchant ko category di thi:');
}
