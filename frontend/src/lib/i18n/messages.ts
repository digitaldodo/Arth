export type SpendSenseLocale = 'en-IN' | 'hi-IN';
export type SpendSenseMessageKey =
  | 'category.suggested'
  | 'category.ruleAgreement'
  | 'category.confirmBeforeSaving'
  | 'category.useSuggestion'
  | 'category.correctionSaved'
  | 'category.notSharedTraining'
  | 'category.yourCorrection';

const messages: Record<SpendSenseLocale, Record<SpendSenseMessageKey, string>> = {
  'en-IN': {
    'category.suggested': 'Possible match: {category}',
    'category.ruleAgreement': 'Weak-label agreement {percent}%',
    'category.confirmBeforeSaving': 'Rule-based suggestion; confirm before saving',
    'category.useSuggestion': 'Use suggestion',
    'category.correctionSaved': 'Your correction was saved locally for this account.',
    'category.notSharedTraining': 'It does not train the shared model.',
    'category.yourCorrection': 'Matches your saved correction',
  },
  'hi-IN': {
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
