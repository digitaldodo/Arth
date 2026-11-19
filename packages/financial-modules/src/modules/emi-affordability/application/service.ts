import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { EmiAffordabilityInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: EmiAffordabilityInput): Promise<Output>; }
export class Service implements FinancialModule<EmiAffordabilityInput, Output> {
  readonly featureFlag = 'emiAffordability';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: EmiAffordabilityInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.emiAffordability) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
