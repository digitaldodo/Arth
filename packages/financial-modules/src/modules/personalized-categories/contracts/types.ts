import type { FinancialFact, ExplainableOutput, Paise, TaxPeriod, TransactionReference, UserReference } from '../../../shared/contracts.js';
export interface PersonalizedCategoriesInput { userReference: UserReference; merchantReference: string; transactionReference: TransactionReference; }
export interface Output { recommendations: readonly CategoryRecommendation[]; }
export interface GoalInput { readonly id: string; readonly amountPaise: Paise; readonly targetDate: string; readonly priorityTier: 1 | 2 | 3; readonly monthlyContributionPaise: Paise; }
export interface GoalProgress { readonly id: string; readonly progressPaise: Paise; readonly shortfallPaise: Paise; readonly delayMonths?: number; }
export interface FireScenario { readonly id: string; readonly retirementCorpusPaise?: Paise; readonly requiredMonthlySavingsPaise?: Paise; readonly assumptions: Readonly<Record<string, number>>; }
export interface DailySpend { readonly date: string; readonly amountPaise: Paise; }
export interface ForecastPoint { readonly date: string; readonly predictedAmountPaise?: Paise; readonly intervalPaise?: readonly [Paise, Paise]; }
export interface RecurringTransaction { readonly id: TransactionReference; readonly merchantReference: string; readonly amountPaise: Paise; readonly date: string; }
export interface RecurringCandidate { readonly merchantReference: string; readonly expectedAmountPaise?: Paise; readonly expectedIntervalDays?: number; readonly anomalyScore?: number; readonly reviewStatus: 'needs_review' | 'confirmed' | 'dismissed'; }
export interface CategoryRecommendation { readonly categoryReference: string; readonly confidence: number; readonly evidence: readonly string[]; }
export interface Intervention { readonly trigger: string; readonly message: string; readonly channel: 'in_app' | 'notification' | 'email'; readonly feedback?: 'helpful' | 'dismissed'; }
