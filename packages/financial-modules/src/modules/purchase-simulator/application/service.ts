import type { FinancialModule, ModuleResult } from '../../../shared/contracts.js';
import { financialModuleFlags } from '../../../shared/feature-flags.js';
import type { PurchaseSimulatorInput, Output } from '../contracts/types.js';
export interface Provider { evaluate(input: PurchaseSimulatorInput): Promise<Output>; }
export class Service implements FinancialModule<PurchaseSimulatorInput, Output> {
  readonly featureFlag = 'purchaseSimulator';
  constructor(private readonly provider?: Provider) {}
  async evaluate(input: PurchaseSimulatorInput): Promise<ModuleResult<Output>> {
    if (!financialModuleFlags.purchaseSimulator) return { status: 'unavailable', reason: 'feature_disabled' };
    if (!this.provider) return { status: 'unavailable', reason: 'provider_not_configured' };
    return { status: 'ready', value: await this.provider.evaluate(input) };
  }
}
