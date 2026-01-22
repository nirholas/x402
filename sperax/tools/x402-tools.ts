/**
 * Sperax X402 MCP Tools
 * 
 * Model Context Protocol tools for AI agents to interact with
 * X402 payment protocol using Sperax USDs on Arbitrum.
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { SperaxClient, type BalanceWithYield } from '../services/sperax';

// ============================================
// Tool Definitions (MCP Schema)
// ============================================

export const speraxToolDefinitions = {
  x402_check_usds_balance: {
    name: 'x402_check_usds_balance',
    description: 'Check USDs balance and earned yield for an address. Returns current balance, yield earned, and APY.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Ethereum address to check balance for'
        }
      },
      required: ['address']
    }
  },

  x402_pay_with_usds: {
    name: 'x402_pay_with_usds',
    description: 'Make an X402 payment using USDs stablecoin. Supports both standard and gasless (EIP-3009) payments.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Recipient address for the payment'
        },
        amount: {
          type: 'string',
          description: 'Amount in USDs to pay (e.g., "1.50" for $1.50)'
        },
        gasless: {
          type: 'boolean',
          description: 'Whether to use gasless EIP-3009 transfer (default: false)'
        },
        memo: {
          type: 'string',
          description: 'Optional memo/description for the payment'
        }
      },
      required: ['recipient', 'amount']
    }
  },

  x402_create_payment_authorization: {
    name: 'x402_create_payment_authorization',
    description: 'Create a signed EIP-3009 authorization for gasless X402 payment. Returns signature for facilitator submission.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Recipient address for the payment'
        },
        amount: {
          type: 'string',
          description: 'Amount in USDs to authorize'
        },
        validUntil: {
          type: 'number',
          description: 'Unix timestamp when authorization expires (default: 1 hour)'
        }
      },
      required: ['recipient', 'amount']
    }
  },

  x402_get_yield_stats: {
    name: 'x402_get_yield_stats',
    description: 'Get current USDs yield statistics including APY, vault TVL, and rebase info.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  x402_estimate_payment_cost: {
    name: 'x402_estimate_payment_cost',
    description: 'Estimate the cost of an X402 payment including gas fees.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Recipient address'
        },
        amount: {
          type: 'string',
          description: 'Payment amount in USDs'
        },
        gasless: {
          type: 'boolean',
          description: 'Whether to estimate gasless payment'
        }
      },
      required: ['recipient', 'amount']
    }
  },

  x402_verify_payment: {
    name: 'x402_verify_payment',
    description: 'Verify an X402 payment was completed successfully.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionHash: {
          type: 'string',
          description: 'Transaction hash to verify'
        }
      },
      required: ['transactionHash']
    }
  }
};

// ============================================
// Tool Handler Class
// ============================================

export interface SperaxToolConfig {
  privateKey?: string;
  rpcUrl?: string;
  network?: 'mainnet' | 'sepolia';
  facilitatorUrl?: string;
}

export class SperaxX402Tools {
  private speraxClient: SperaxClient;
  private config: SperaxToolConfig;
  private account?: ReturnType<typeof privateKeyToAccount>;

  constructor(config: SperaxToolConfig = {}) {
    this.config = {
      network: 'sepolia',
      facilitatorUrl: 'http://localhost:3002',
      ...config
    };

    const chain = this.config.network === 'mainnet' ? arbitrum : arbitrumSepolia;
    const rpcUrl = this.config.rpcUrl || chain.rpcUrls.default.http[0];

    this.speraxClient = new SperaxClient({
      rpcUrl,
      chainId: chain.id
    });

    if (this.config.privateKey) {
      this.account = privateKeyToAccount(this.config.privateKey as Hex);
    }
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'x402_check_usds_balance':
        return this.checkBalance(params.address as string);

      case 'x402_pay_with_usds':
        return this.payWithUSDs(
          params.recipient as string,
          params.amount as string,
          params.gasless as boolean,
          params.memo as string
        );

      case 'x402_create_payment_authorization':
        return this.createPaymentAuthorization(
          params.recipient as string,
          params.amount as string,
          params.validUntil as number
        );

      case 'x402_get_yield_stats':
        return this.getYieldStats();

      case 'x402_estimate_payment_cost':
        return this.estimatePaymentCost(
          params.recipient as string,
          params.amount as string,
          params.gasless as boolean
        );

      case 'x402_verify_payment':
        return this.verifyPayment(params.transactionHash as string);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Check USDs balance and yield for an address
   */
  async checkBalance(address: string): Promise<BalanceWithYield> {
    return this.speraxClient.getBalanceWithYield(address as Address);
  }

  /**
   * Make a payment with USDs
   */
  async payWithUSDs(
    recipient: string,
    amount: string,
    gasless: boolean = false,
    memo?: string
  ): Promise<{ txHash: string; status: string; memo?: string }> {
    if (!this.account) {
      throw new Error('No private key configured. Cannot make payments.');
    }

    const amountWei = parseUnits(amount, 18);

    if (gasless) {
      // Create and submit gasless authorization
      const auth = await this.createPaymentAuthorization(recipient, amount);
      
      // Submit to facilitator
      const response = await fetch(`${this.config.facilitatorUrl}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorization: auth,
          memo
        })
      });

      if (!response.ok) {
        throw new Error(`Facilitator error: ${await response.text()}`);
      }

      const result = await response.json();
      return {
        txHash: result.transactionHash,
        status: 'settled',
        memo
      };
    } else {
      // Standard transfer
      const txHash = await this.speraxClient.transfer(
        this.account,
        recipient as Address,
        amountWei
      );

      return {
        txHash,
        status: 'confirmed',
        memo
      };
    }
  }

  /**
   * Create EIP-3009 payment authorization
   */
  async createPaymentAuthorization(
    recipient: string,
    amount: string,
    validUntil?: number
  ): Promise<{
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    signature: string;
  }> {
    if (!this.account) {
      throw new Error('No private key configured. Cannot create authorization.');
    }

    const amountWei = parseUnits(amount, 18);
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 60; // Valid from 1 minute ago
    const validBefore = validUntil || now + 3600; // Valid for 1 hour by default
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}`;

    const signature = await this.speraxClient.signTransferAuthorization(
      this.account,
      recipient as Address,
      amountWei,
      BigInt(validAfter),
      BigInt(validBefore),
      nonce as Hex
    );

    return {
      from: this.account.address,
      to: recipient,
      value: amountWei.toString(),
      validAfter,
      validBefore,
      nonce,
      signature
    };
  }

  /**
   * Get current yield statistics
   */
  async getYieldStats(): Promise<{
    apy: string;
    tvl: string;
    lastRebase: string;
    rebasingCreditsPerToken: string;
  }> {
    const apy = await this.speraxClient.getCurrentAPY();
    
    return {
      apy: `${(apy * 100).toFixed(2)}%`,
      tvl: 'Query vault for TVL',
      lastRebase: new Date().toISOString(),
      rebasingCreditsPerToken: 'Query contract'
    };
  }

  /**
   * Estimate payment cost
   */
  async estimatePaymentCost(
    recipient: string,
    amount: string,
    gasless: boolean = false
  ): Promise<{
    paymentAmount: string;
    estimatedGas: string;
    estimatedGasCost: string;
    totalCost: string;
    savings: string;
  }> {
    const amountWei = parseUnits(amount, 18);

    if (gasless) {
      return {
        paymentAmount: amount,
        estimatedGas: '0',
        estimatedGasCost: '0',
        totalCost: amount,
        savings: 'Gas paid by facilitator'
      };
    }

    // Estimate gas for standard transfer (~65,000 gas on Arbitrum)
    const estimatedGas = 65000n;
    const gasPrice = 100000000n; // 0.1 gwei on Arbitrum
    const gasCostWei = estimatedGas * gasPrice;
    const gasCostEth = formatUnits(gasCostWei, 18);

    return {
      paymentAmount: amount,
      estimatedGas: estimatedGas.toString(),
      estimatedGasCost: `${gasCostEth} ETH`,
      totalCost: `${amount} USDs + ${gasCostEth} ETH`,
      savings: 'Use gasless=true to avoid gas costs'
    };
  }

  /**
   * Verify a payment transaction
   */
  async verifyPayment(transactionHash: string): Promise<{
    verified: boolean;
    status: string;
    blockNumber?: number;
    from?: string;
    to?: string;
    amount?: string;
  }> {
    try {
      const response = await fetch(`${this.config.facilitatorUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionHash })
      });

      if (response.ok) {
        const result = await response.json();
        return {
          verified: result.verified,
          status: result.status,
          blockNumber: result.blockNumber,
          from: result.from,
          to: result.to,
          amount: result.amount
        };
      }
    } catch {
      // Fall back to direct chain verification
    }

    // Direct verification via RPC
    const chain = this.config.network === 'mainnet' ? arbitrum : arbitrumSepolia;
    const client = createPublicClient({
      chain,
      transport: http()
    });

    const receipt = await client.getTransactionReceipt({
      hash: transactionHash as Hex
    });

    return {
      verified: receipt.status === 'success',
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber)
    };
  }

  /**
   * Get all tool definitions
   */
  static getToolDefinitions() {
    return Object.values(speraxToolDefinitions);
  }
}

// ============================================
// MCP Server Integration
// ============================================

export function createMCPHandler(config: SperaxToolConfig = {}) {
  const tools = new SperaxX402Tools(config);

  return {
    tools: SperaxX402Tools.getToolDefinitions(),

    async handleToolCall(
      name: string,
      arguments_: Record<string, unknown>
    ): Promise<{ content: Array<{ type: string; text: string }> }> {
      try {
        const result = await tools.executeTool(name, arguments_);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
    }
  };
}

export default SperaxX402Tools;
