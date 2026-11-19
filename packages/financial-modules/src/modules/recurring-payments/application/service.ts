import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { RecurringPaymentsInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: RecurringPaymentsInput): Promise<Output>; }
export class Service implements FinancialModule<RecurringPaymentsInput, Output> {
  readonly featureFlag = 'recurringPayments';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: RecurringPaymentsInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.recurringPayments) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
