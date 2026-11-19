/** All teammate-owned engines remain unavailable until their owner ships a reviewed provider. */
export const financialModuleFlags = {
  safeToSpend: false,
  purchaseSimulator: false,
  emiAffordability: false,
  goalPlanner: false,
  firePlanner: false,
  spendingForecast: false,
  recurringPayments: false,
  personalizedCategories: false,
  taxCalculation: false,
  behavioralInsights: false,
  accountAggregator: false,
} as const;

export type FinancialModuleFlag = keyof typeof financialModuleFlags;
