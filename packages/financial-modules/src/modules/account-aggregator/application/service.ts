import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { AccountAggregatorInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: AccountAggregatorInput): Promise<Output>; }
export class Service implements FinancialModule<AccountAggregatorInput, Output> {
  readonly featureFlag = 'accountAggregator';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: AccountAggregatorInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.accountAggregator) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
