import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { BehavioralInsightsInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: BehavioralInsightsInput): Promise<Output>; }
export class Service implements FinancialModule<BehavioralInsightsInput, Output> {
  readonly featureFlag = 'behavioralInsights';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: BehavioralInsightsInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.behavioralInsights) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
