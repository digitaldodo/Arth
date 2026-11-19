import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { FirePlannerInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: FirePlannerInput): Promise<Output>; }
export class Service implements FinancialModule<FirePlannerInput, Output> {
  readonly featureFlag = 'firePlanner';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: FirePlannerInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.firePlanner) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
