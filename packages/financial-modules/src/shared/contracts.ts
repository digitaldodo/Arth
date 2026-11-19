export type Paise = number & { readonly __brand: 'Paise' };
export type UserReference = string & { readonly __brand: 'UserReference' };
export type TransactionReference = string & { readonly __brand: 'TransactionReference' };

export interface TaxPeriod { readonly start: string; readonly end: string; readonly jurisdiction: 'IN'; }
export interface Provenance {
  readonly sourceId: string;
  readonly sourceType: 'transaction' | 'document' | 'user_input' | 'provider';
  readonly page?: number;
  readonly location?: string;
  readonly method: string;
  readonly observedAt: string;
  readonly verified: boolean;
}
export interface ModelMetadata { readonly modelId: string; readonly version: string; readonly method: string; }
export type Confidence = number & { readonly __brand: 'Confidence0To1' };
export interface ModelStatus { readonly status: 'ready' | 'unavailable'; readonly reason?: string; }
export interface FinancialModuleError { readonly code: string; readonly message: string; readonly retryable: boolean; }
export interface ExplainableOutput { readonly summary: string; readonly evidence: readonly string[]; }
export type ModuleResult<T> =
  | { readonly status: 'ready'; readonly value: T; readonly model?: ModelMetadata }
  | { readonly status: 'unavailable'; readonly reason: 'feature_disabled' | 'provider_not_configured' | 'unsupported_input' };

export interface FinancialFact {
  readonly id: string;
  readonly userId: UserReference;
  readonly kind: string;
  readonly amountPaise: Paise;
  readonly currency: 'INR';
  readonly taxPeriod?: TaxPeriod;
  readonly provenance: Provenance;
  readonly confidence: number;
  readonly verification: 'unreviewed' | 'verified' | 'rejected';
}

export interface FinancialModule<Input, Output> {
  readonly featureFlag: string;
  evaluate(input: Input): Promise<ModuleResult<Output>>;
}
