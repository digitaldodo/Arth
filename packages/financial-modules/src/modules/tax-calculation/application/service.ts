import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { TaxCalculationInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: TaxCalculationInput): Promise<Output>; }
export class Service implements FinancialModule<TaxCalculationInput, Output> {
  readonly featureFlag = 'taxCalculation';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: TaxCalculationInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.taxCalculation) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
