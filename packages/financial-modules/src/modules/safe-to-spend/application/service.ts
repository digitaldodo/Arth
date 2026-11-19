import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { SafeToSpendInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: SafeToSpendInput): Promise<Output>; }
export class Service implements FinancialModule<SafeToSpendInput, Output> {
  readonly featureFlag = 'safeToSpend';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: SafeToSpendInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.safeToSpend) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
