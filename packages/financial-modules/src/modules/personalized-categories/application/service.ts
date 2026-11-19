import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { PersonalizedCategoriesInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: PersonalizedCategoriesInput): Promise<Output>; }
export class Service implements FinancialModule<PersonalizedCategoriesInput, Output> {
  readonly featureFlag = 'personalizedCategories';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: PersonalizedCategoriesInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.personalizedCategories) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
