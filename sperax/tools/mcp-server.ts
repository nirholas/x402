/**
 * Sperax X402 MCP Server
 * 
 * Standalone MCP server for AI agents to interact with X402 payments.
 * Supports Claude, GPT, and other MCP-compatible AI assistants.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SperaxX402Tools, speraxToolDefinitions } from './x402-tools';

const server = new Server(
  {
    name: 'sperax-x402',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize tools with environment config
const tools = new SperaxX402Tools({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.ARBITRUM_RPC_URL,
  network: (process.env.NETWORK as 'mainnet' | 'sepolia') || 'sepolia',
  facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3002',
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.values(speraxToolDefinitions).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await tools.executeTool(name, args || {});
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error('Starting Sperax X402 MCP Server...');
  console.error('Available tools:', Object.keys(speraxToolDefinitions).join(', '));

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Sperax X402 MCP Server running on stdio');
}

main().catch(console.error);
