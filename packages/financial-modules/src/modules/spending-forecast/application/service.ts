import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { SpendingForecastInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: SpendingForecastInput): Promise<Output>; }
export class Service implements FinancialModule<SpendingForecastInput, Output> {
  readonly featureFlag = 'spendingForecast';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: SpendingForecastInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.spendingForecast) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
