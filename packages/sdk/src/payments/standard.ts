/**
 * @fileoverview Standard Payment Implementation
 * @copyright Copyright (c) 2024-2026 nirholas
 * @license MIT
 */

import {
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  parseUnits,
  formatUnits,
} from 'viem';
import type {
  PaymentRequest,
  PaymentTransaction,
  X402Token,
  X402Chain,
  BalanceInfo,
} from '../types';
import { X402Error, X402ErrorCode } from '../types';
import { TOKENS, ERC20_ABI, NETWORKS } from '../constants';

/**
 * Standard ERC-20 payment handler
 */
export class StandardPayment {
  constructor(
    private readonly publicClient: PublicClient,
    private readonly walletClient: WalletClient | undefined,
    private readonly chain: X402Chain
  ) {}

  /**
   * Execute a standard ERC-20 transfer
   */
  async execute(request: PaymentRequest): Promise<PaymentTransaction> {
    if (!this.walletClient?.account) {
      throw new X402Error(
        'Wallet not configured. Provide privateKey in client config.',
        X402ErrorCode.MISSING_PRIVATE_KEY
      );
    }

    const tokenConfig = this.getTokenConfig(request.token);
    const amount = parseUnits(request.amount, tokenConfig.decimals);

    // Check balance
    const balance = await this.getBalance(this.walletClient.account.address, request.token);
    if (balance.raw < amount) {
      throw new X402Error(
        `Insufficient ${request.token} balance. Have ${balance.formatted}, need ${request.amount}`,
        X402ErrorCode.INSUFFICIENT_BALANCE,
        { balance: balance.formatted, required: request.amount }
      );
    }

    let hash: Hash;

    if (this.isNativeToken(request.token)) {
      // Native token transfer
      hash = await this.walletClient.sendTransaction({
        to: request.recipient,
        value: amount,
      });
    } else {
      // ERC-20 transfer
      hash = await this.walletClient.writeContract({
        address: tokenConfig.address,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [request.recipient, amount],
      });
    }

    const transaction: PaymentTransaction = {
      hash,
      chainId: NETWORKS[this.chain].chainId,
      from: this.walletClient.account.address,
      to: request.recipient,
      amount: amount.toString(),
      formattedAmount: request.amount,
      token: request.token,
      tokenAddress: this.isNativeToken(request.token) ? undefined : tokenConfig.address,
      status: 'pending',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Wait for confirmation
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    transaction.status = receipt.status === 'success' ? 'confirmed' : 'failed';
    transaction.blockNumber = Number(receipt.blockNumber);
    transaction.gasUsed = receipt.gasUsed.toString();

    if (transaction.status === 'failed') {
      throw new X402Error(
        'Transaction reverted',
        X402ErrorCode.TRANSACTION_REVERTED,
        { hash, receipt }
      );
    }

    return transaction;
  }

  /**
   * Get token balance for an address
   */
  async getBalance(address: Address, token: X402Token): Promise<BalanceInfo> {
    const tokenConfig = this.getTokenConfig(token);

    let raw: bigint;

    if (this.isNativeToken(token)) {
      raw = await this.publicClient.getBalance({ address });
    } else {
      raw = await this.publicClient.readContract({
        address: tokenConfig.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;
    }

    return {
      raw,
      formatted: formatUnits(raw, tokenConfig.decimals),
      token,
    };
  }

  /**
   * Approve token spending
   */
  async approve(
    spender: Address,
    amount: string,
    token: X402Token
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new X402Error(
        'Wallet not configured',
        X402ErrorCode.MISSING_PRIVATE_KEY
      );
    }

    const tokenConfig = this.getTokenConfig(token);

    if (this.isNativeToken(token)) {
      throw new X402Error(
        'Cannot approve native token',
        X402ErrorCode.UNSUPPORTED_TOKEN
      );
    }

    const amountParsed = parseUnits(amount, tokenConfig.decimals);

    const hash = await this.walletClient.writeContract({
      address: tokenConfig.address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amountParsed],
    });

    await this.publicClient.waitForTransactionReceipt({ hash });

    return hash;
  }

  /**
   * Get token allowance
   */
  async getAllowance(
    owner: Address,
    spender: Address,
    token: X402Token
  ): Promise<BalanceInfo> {
    const tokenConfig = this.getTokenConfig(token);

    if (this.isNativeToken(token)) {
      return { raw: BigInt(0), formatted: '0', token };
    }

    const raw = await this.publicClient.readContract({
      address: tokenConfig.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    }) as bigint;

    return {
      raw,
      formatted: formatUnits(raw, tokenConfig.decimals),
      token,
    };
  }

  /**
   * Get token configuration
   */
  private getTokenConfig(token: X402Token) {
    const config = TOKENS[this.chain]?.[token];
    if (!config) {
      throw new X402Error(
        `Token ${token} not available on ${this.chain}`,
        X402ErrorCode.UNSUPPORTED_TOKEN
      );
    }
    return config;
  }

  /**
   * Check if token is native (ETH)
   */
  private isNativeToken(token: X402Token): boolean {
    return token === 'ETH';
  }
}
