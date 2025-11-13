/**
 * Utility helpers for calculating trade amounts, validations, and guardrails.
 *
 * Prices in the app are represented in cents to avoid floating point drift.
 * These helpers follow the same convention.
 */

export type TradeType = "buy" | "sell";
export type PurchaseMode = "shares" | "dollars";

export interface TradeAmountParseResult {
  /**
   * Parsed numeric value from user input. Always non-negative.
   */
  value: number;
  /**
   * Indicates whether the parsed value exceeded the supported precision
   * (for example, more than two decimals for dollar amounts).
   */
  truncated: boolean;
}

/**
 * Constraints used when validating trades.
 */
export interface TradeConstraints {
  /**
   * Maximum allowable shares per order across accounts.
   */
  maxSharesPerOrder?: number;
  /**
   * Available cash balance (in cents) for buy orders.
   */
  availableBalanceCents?: number;
  /**
   * Owned share count that can be sold.
   */
  availableOwnedShares?: number;
}

/**
 * Result of estimating a trade based on the user input.
 */
export interface TradeEstimation {
  estimatedShares: number;
  estimatedTotalCents: number;
  isValid: boolean;
  /**
   * True when the user attempted to buy fractional shares which were rounded down.
   */
  roundedDown: boolean;
}

/**
 * Summary returned after validating a trade before submission.
 */
export interface TradeValidationResult {
  canSubmit: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse a numeric input provided by the user. Handles commas and whitespace.
 * When `mode` is `"shares"`, the precision is zero decimals.
 * When `mode` is `"dollars"`, the precision is capped at two decimals.
 */
export function parseTradeAmountInput(
  rawValue: string,
  mode: PurchaseMode,
): TradeAmountParseResult {
  if (!rawValue) {
    return { value: 0, truncated: false };
  }

  const sanitized = rawValue.replace(/,/g, "").trim();
  if (!sanitized) {
    return { value: 0, truncated: false };
  }

  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: 0, truncated: false };
  }

  if (mode === "shares") {
    const wholeShares = Math.floor(parsed);
    return {
      value: wholeShares,
      truncated: !Number.isInteger(parsed),
    };
  }

  // Dollars: clamp to two decimals
  const cents = Math.floor(parsed * 100);
  const roundedDollars = cents / 100;
  const truncated = Math.abs(parsed - roundedDollars) > Number.EPSILON;

  return { value: roundedDollars, truncated };
}

/**
 * Estimate how many shares are requested and the total cost in cents.
 * Returns rounded down shares when mode is dollars.
 */
export function estimateTrade(
  amountValue: number,
  mode: PurchaseMode,
  pricePerShareCents: number,
): TradeEstimation {
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return { estimatedShares: 0, estimatedTotalCents: 0, isValid: false, roundedDown: false };
  }

  if (!Number.isFinite(pricePerShareCents) || pricePerShareCents <= 0) {
    return { estimatedShares: 0, estimatedTotalCents: 0, isValid: false, roundedDown: false };
  }

  if (mode === "shares") {
    const shares = Math.floor(amountValue);
    const total = shares * pricePerShareCents;
    return {
      estimatedShares: shares,
      estimatedTotalCents: total,
      isValid: shares > 0,
      roundedDown: false,
    };
  }

  const cents = Math.floor(amountValue * 100);
  const shares = Math.floor(cents / pricePerShareCents);
  const total = shares * pricePerShareCents;
  return {
    estimatedShares: shares,
    estimatedTotalCents: total,
    isValid: shares > 0,
    roundedDown: shares * pricePerShareCents !== cents,
  };
}

/**
 * Validates a trade using the supplied estimation and constraints.
 */
export function validateTrade(
  tradeType: TradeType,
  estimation: TradeEstimation,
  constraints: TradeConstraints = {},
): TradeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!estimation.isValid || estimation.estimatedShares <= 0) {
    errors.push("Enter a positive number of shares to continue.");
    return { canSubmit: false, errors, warnings };
  }

  const { maxSharesPerOrder, availableBalanceCents, availableOwnedShares } = constraints;

  if (typeof maxSharesPerOrder === "number" && estimation.estimatedShares > maxSharesPerOrder) {
    errors.push(`Order exceeds the maximum size of ${maxSharesPerOrder.toLocaleString()} shares.`);
  }

  if (tradeType === "buy" && typeof availableBalanceCents === "number") {
    if (estimation.estimatedTotalCents > availableBalanceCents) {
      errors.push("Insufficient balance for this purchase.");
    }
  }

  if (tradeType === "sell" && typeof availableOwnedShares === "number") {
    if (estimation.estimatedShares > availableOwnedShares) {
      errors.push("You do not own enough shares to sell this amount.");
    }
  }

  if (estimation.roundedDown) {
    warnings.push("Fractional shares are not supported. Amount rounded down to the nearest whole share.");
  }

  return { canSubmit: errors.length === 0, errors, warnings };
}

/**
 * Convenience helper that combines parsing, estimation, and validation.
 * Useful for running all calculations in a single call.
 */
export function calculateTrade(
  rawAmount: string,
  mode: PurchaseMode,
  tradeType: TradeType,
  pricePerShareCents: number,
  constraints: TradeConstraints = {},
): {
  amount: TradeAmountParseResult;
  estimation: TradeEstimation;
  validation: TradeValidationResult;
} {
  const amount = parseTradeAmountInput(rawAmount, mode);
  const estimation = estimateTrade(amount.value, mode, pricePerShareCents);
  const validation = validateTrade(tradeType, estimation, constraints);

  return { amount, estimation, validation };
}
