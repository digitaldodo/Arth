/**
 * Category Icon System for Arth
 * Provides intelligent default icons based on financial semantics and taxonomy names,
 * as well as a curated preset palette and helper functions for custom icon/emoji rendering.
 */

export const PRESET_CATEGORY_ICONS: string[] = [
  // Food & Dining
  '🍽️', '🍔', '☕', '🍎',
  // Transport & Travel
  '🚗', '⛽', '✈️', '🚌',
  // Housing & Utilities
  '🏠', '⚡', '💡', '🛠️',
  // Shopping & Goods
  '🛍️', '🛒', '👕', '📦',
  // Health & Fitness
  '💊', '🏥', '🏋️', '🧘',
  // Education & Learning
  '📚', '🎓', '💻', '✏️',
  // Entertainment & Leisure
  '🎬', '🎮', '🎵', '🎟️',
  // Personal & Family
  '👶', '🐾', '💈', '🎁',
  // Income & Growth
  '💼', '💵', '📈', '💰', '🏦', '🤝',
  // General
  '🏷️', '📌', '🧾', '⭐',
];

/**
 * Returns a sensible, high-quality default emoji icon for a category
 * based on its name and transaction type.
 */
export function getDefaultCategoryIcon(
  name: string,
  type: 'income' | 'expense' = 'expense'
): string {
  const normalized = (name || '').toLowerCase().trim();

  if (type === 'income') {
    if (
      normalized.includes('salary') ||
      normalized.includes('payroll') ||
      normalized.includes('wage') ||
      normalized.includes('stipend') ||
      normalized.includes('job') ||
      normalized.includes('work') ||
      normalized.includes('bonus') ||
      normalized.includes('allowance')
    ) {
      return '💼';
    }
    if (
      normalized.includes('freelance') ||
      normalized.includes('consult') ||
      normalized.includes('contract') ||
      normalized.includes('business') ||
      normalized.includes('client') ||
      normalized.includes('sales') ||
      normalized.includes('revenue')
    ) {
      return '💻';
    }
    if (
      normalized.includes('dividend') ||
      normalized.includes('interest') ||
      normalized.includes('return') ||
      normalized.includes('profit') ||
      normalized.includes('gain') ||
      normalized.includes('capital') ||
      normalized.includes('yield') ||
      normalized.includes('cashback') ||
      normalized.includes('reward')
    ) {
      return '📈';
    }
    if (
      normalized.includes('rent') ||
      normalized.includes('tenant') ||
      normalized.includes('lease')
    ) {
      return '🏠';
    }
    if (
      normalized.includes('gift') ||
      normalized.includes('refund') ||
      normalized.includes('reimburse')
    ) {
      return '💵';
    }
    return '💰';
  }

  // Expense categories
  if (
    normalized.includes('food') ||
    normalized.includes('grocer') ||
    normalized.includes('dine') ||
    normalized.includes('dining') ||
    normalized.includes('restaurant') ||
    normalized.includes('cafe') ||
    normalized.includes('coffee') ||
    normalized.includes('snack') ||
    normalized.includes('eat') ||
    normalized.includes('lunch') ||
    normalized.includes('dinner') ||
    normalized.includes('breakfast') ||
    normalized.includes('meal') ||
    normalized.includes('fruit') ||
    normalized.includes('veg') ||
    normalized.includes('beverage')
  ) {
    return '🍽️';
  }

  if (
    normalized.includes('transport') ||
    normalized.includes('commute') ||
    normalized.includes('travel') ||
    normalized.includes('car') ||
    normalized.includes('auto') ||
    normalized.includes('cab') ||
    normalized.includes('taxi') ||
    normalized.includes('uber') ||
    normalized.includes('ola') ||
    normalized.includes('bus') ||
    normalized.includes('train') ||
    normalized.includes('flight') ||
    normalized.includes('metro') ||
    normalized.includes('fuel') ||
    normalized.includes('petrol') ||
    normalized.includes('diesel') ||
    normalized.includes('parking') ||
    normalized.includes('toll')
  ) {
    return '🚗';
  }

  if (
    normalized.includes('rent') ||
    normalized.includes('house') ||
    normalized.includes('home') ||
    normalized.includes('housing') ||
    normalized.includes('apartment') ||
    normalized.includes('flat') ||
    normalized.includes('electric') ||
    normalized.includes('electricity') ||
    normalized.includes('water') ||
    normalized.includes('power') ||
    normalized.includes('utility') ||
    normalized.includes('utilities') ||
    normalized.includes('wifi') ||
    normalized.includes('internet') ||
    normalized.includes('broadband') ||
    normalized.includes('gas') ||
    normalized.includes('lpg') ||
    normalized.includes('bill') ||
    normalized.includes('recharge')
  ) {
    return '🏠';
  }

  if (
    normalized.includes('shop') ||
    normalized.includes('shopping') ||
    normalized.includes('cloth') ||
    normalized.includes('apparel') ||
    normalized.includes('shoe') ||
    normalized.includes('amazon') ||
    normalized.includes('flipkart') ||
    normalized.includes('mall') ||
    normalized.includes('purchase') ||
    normalized.includes('gadget') ||
    normalized.includes('electronics')
  ) {
    return '🛍️';
  }

  if (
    normalized.includes('health') ||
    normalized.includes('medic') ||
    normalized.includes('doctor') ||
    normalized.includes('hospital') ||
    normalized.includes('clinic') ||
    normalized.includes('pharma') ||
    normalized.includes('gym') ||
    normalized.includes('fitness') ||
    normalized.includes('workout') ||
    normalized.includes('yoga') ||
    normalized.includes('wellness')
  ) {
    return '💊';
  }

  if (
    normalized.includes('educat') ||
    normalized.includes('school') ||
    normalized.includes('college') ||
    normalized.includes('univ') ||
    normalized.includes('tuition') ||
    normalized.includes('course') ||
    normalized.includes('book') ||
    normalized.includes('study') ||
    normalized.includes('exam') ||
    normalized.includes('class')
  ) {
    return '📚';
  }

  if (
    normalized.includes('entertain') ||
    normalized.includes('movie') ||
    normalized.includes('cinema') ||
    normalized.includes('theatre') ||
    normalized.includes('film') ||
    normalized.includes('game') ||
    normalized.includes('gaming') ||
    normalized.includes('netflix') ||
    normalized.includes('spotify') ||
    normalized.includes('stream') ||
    normalized.includes('concert') ||
    normalized.includes('event') ||
    normalized.includes('hobby')
  ) {
    return '🎬';
  }

  if (
    normalized.includes('gift') ||
    normalized.includes('donation') ||
    normalized.includes('charity') ||
    normalized.includes('present')
  ) {
    return '🎁';
  }

  if (
    normalized.includes('invest') ||
    normalized.includes('stock') ||
    normalized.includes('share') ||
    normalized.includes('mutual fund') ||
    normalized.includes('sip') ||
    normalized.includes('gold') ||
    normalized.includes('crypto') ||
    normalized.includes('trading') ||
    normalized.includes('deposit') ||
    normalized.includes('insurance') ||
    normalized.includes('tax') ||
    normalized.includes('emi') ||
    normalized.includes('loan')
  ) {
    return '📈';
  }

  if (
    normalized.includes('salon') ||
    normalized.includes('hair') ||
    normalized.includes('groom') ||
    normalized.includes('beauty') ||
    normalized.includes('spa') ||
    normalized.includes('pet') ||
    normalized.includes('dog') ||
    normalized.includes('cat')
  ) {
    return '✂️';
  }

  return '🏷️';
}

/**
 * Resolves the icon to display for a category, using either the user-selected icon
 * or the semantic default based on name and transaction type.
 */
export function resolveCategoryIcon(
  icon: string | null | undefined,
  name: string,
  type: 'income' | 'expense' = 'expense'
): string {
  const trimmed = (icon || '').trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return getDefaultCategoryIcon(name, type);
}
