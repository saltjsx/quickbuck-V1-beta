import { describe, expect, it } from "vitest";
import {
  calculateTrade,
  estimateTrade,
  parseTradeAmountInput,
  validateTrade,
} from "./trade-utils";

describe("parseTradeAmountInput", () => {
  it("parses whole share counts and flags fractional values as truncated", () => {
    expect(parseTradeAmountInput("10", "shares")).toEqual({
      value: 10,
      truncated: false,
    });

    expect(parseTradeAmountInput("15.7", "shares")).toEqual({
      value: 15,
      truncated: true,
    });
  });

  it("parses dollar amounts with two-decimal precision", () => {
    expect(parseTradeAmountInput("1,250.50", "dollars")).toEqual({
      value: 1250.5,
      truncated: false,
    });

    expect(parseTradeAmountInput("99.999", "dollars")).toEqual({
      value: 99.99,
      truncated: true,
    });
  });

  it("guards against empty and invalid values", () => {
    expect(parseTradeAmountInput("", "shares")).toEqual({
      value: 0,
      truncated: false,
    });

    expect(parseTradeAmountInput("abc", "dollars")).toEqual({
      value: 0,
      truncated: false,
    });
  });
});

describe("estimateTrade", () => {
  it("estimates share totals when entering number of shares directly", () => {
    const result = estimateTrade(12, "shares", 500);
    expect(result).toEqual({
      estimatedShares: 12,
      estimatedTotalCents: 6000,
      isValid: true,
      roundedDown: false,
    });
  });

  it("estimates shares from dollar inputs and rounds down fractional shares", () => {
    const result = estimateTrade(150.75, "dollars", 5000);
    expect(result).toEqual({
      estimatedShares: 3,
      estimatedTotalCents: 15000,
      isValid: true,
      roundedDown: true,
    });
  });

  it("marks estimates invalid when inputs are zero or price is invalid", () => {
    expect(estimateTrade(0, "shares", 500)).toMatchObject({ isValid: false });
    expect(estimateTrade(10, "shares", 0)).toMatchObject({ isValid: false });
  });
});

describe("validateTrade", () => {
  it("rejects trades that exceed balance or owned shares", () => {
    const estimation = {
      estimatedShares: 5,
      estimatedTotalCents: 10_000,
      isValid: true,
      roundedDown: false,
    } as const;

    const buyResult = validateTrade("buy", estimation, {
      availableBalanceCents: 5_000,
    });
    expect(buyResult.canSubmit).toBe(false);
    expect(buyResult.errors).toContain("Insufficient balance for this purchase.");

    const sellResult = validateTrade("sell", estimation, {
      availableOwnedShares: 2,
    });
    expect(sellResult.canSubmit).toBe(false);
    expect(sellResult.errors).toContain(
      "You do not own enough shares to sell this amount.",
    );
  });

  it("enforces maximum order size and includes rounding warnings", () => {
    const estimation = {
      estimatedShares: 12,
      estimatedTotalCents: 12_000,
      isValid: true,
      roundedDown: true,
    } as const;

    const result = validateTrade("buy", estimation, { maxSharesPerOrder: 10 });
    expect(result.canSubmit).toBe(false);
    expect(result.errors).toContain(
      "Order exceeds the maximum size of 10 shares.",
    );
    expect(result.warnings).toContain(
      "Fractional shares are not supported. Amount rounded down to the nearest whole share.",
    );
  });

  it("requires a positive share count from the estimation", () => {
    const estimation = {
      estimatedShares: 0,
      estimatedTotalCents: 0,
      isValid: false,
      roundedDown: false,
    } as const;

    const result = validateTrade("buy", estimation);
    expect(result.canSubmit).toBe(false);
    expect(result.errors).toEqual([
      "Enter a positive number of shares to continue.",
    ]);
  });
});

describe("calculateTrade", () => {
  it("combines parsing, estimation, and validation for a successful trade", () => {
    const output = calculateTrade(
      "100",
      "dollars",
      "buy",
      2_500,
      { availableBalanceCents: 10_000 },
    );

    expect(output.amount).toEqual({ value: 100, truncated: false });
    expect(output.estimation).toEqual({
      estimatedShares: 4,
      estimatedTotalCents: 10_000,
      isValid: true,
      roundedDown: false,
    });
    expect(output.validation.canSubmit).toBe(true);
    expect(output.validation.errors).toHaveLength(0);
  });

  it("propagates validation errors when constraints fail", () => {
    const output = calculateTrade(
      "50",
      "shares",
      "sell",
      3_000,
      { availableOwnedShares: 10 },
    );

    expect(output.estimation.estimatedShares).toBe(50);
    expect(output.validation.canSubmit).toBe(false);
    expect(output.validation.errors).toContain(
      "You do not own enough shares to sell this amount.",
    );
  });
});
