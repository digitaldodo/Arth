import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { GoalPlannerInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: GoalPlannerInput): Promise<Output>; }
export class Service implements FinancialModule<GoalPlannerInput, Output> {
  readonly featureFlag = 'goalPlanner';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: GoalPlannerInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.goalPlanner) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
