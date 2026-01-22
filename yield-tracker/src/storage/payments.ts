/**
 * Payment History Storage
 * 
 * SQLite-based storage for tracked payments and yield history.
 * Uses better-sqlite3 for synchronous, fast database operations.
 */

import Database from 'better-sqlite3';
import type { 
  TrackedPayment, 
  YieldHistoryPoint, 
  RebaseEvent 
} from '../types.js';

/**
 * Payment Storage using SQLite
 */
export class PaymentStorage {
  private db: Database.Database;

  constructor(dbPath: string = './yield-tracker.db') {
    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * Initialize database tables
   */
  private initialize() {
    // Payments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        initial_amount TEXT NOT NULL,
        initial_credits TEXT NOT NULL,
        initial_credits_per_token TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        description TEXT,
        is_rebasing INTEGER NOT NULL DEFAULT 1
      );
      
      CREATE INDEX IF NOT EXISTS idx_payments_address ON payments(address);
      CREATE INDEX IF NOT EXISTS idx_payments_timestamp ON payments(timestamp);
    `);

    // Yield history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS yield_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        balance TEXT NOT NULL,
        credits_per_token TEXT NOT NULL,
        cumulative_yield TEXT NOT NULL,
        block_number INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_yield_history_address ON yield_history(address);
      CREATE INDEX IF NOT EXISTS idx_yield_history_timestamp ON yield_history(timestamp);
    `);

    // Rebase events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rebase_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_number INTEGER NOT NULL UNIQUE,
        tx_hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        previous_credits_per_token TEXT NOT NULL,
        new_credits_per_token TEXT NOT NULL,
        rebase_percentage TEXT NOT NULL,
        estimated_apy TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_rebase_events_timestamp ON rebase_events(timestamp);
    `);

    // Global state table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS global_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  /**
   * Add a tracked payment
   */
  addPayment(payment: TrackedPayment): void {
    const stmt = this.db.prepare(`
      INSERT INTO payments (
        id, address, initial_amount, initial_credits, initial_credits_per_token,
        tx_hash, block_number, timestamp, description, is_rebasing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      payment.id,
      payment.address.toLowerCase(),
      payment.initialAmount,
      payment.initialCredits,
      payment.initialCreditsPerToken,
      payment.txHash,
      payment.blockNumber,
      payment.timestamp,
      payment.description || null,
      payment.isRebasing ? 1 : 0
    );
  }

  /**
   * Get payment by ID
   */
  getPayment(id: string): TrackedPayment | null {
    const stmt = this.db.prepare('SELECT * FROM payments WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToPayment(row) : null;
  }

  /**
   * Get all payments for an address
   */
  getPaymentsByAddress(address: string): TrackedPayment[] {
    const stmt = this.db.prepare('SELECT * FROM payments WHERE address = ? ORDER BY timestamp DESC');
    const rows = stmt.all(address.toLowerCase()) as any[];
    return rows.map(this.rowToPayment);
  }

  /**
   * Get all tracked addresses
   */
  getTrackedAddresses(): string[] {
    const stmt = this.db.prepare('SELECT DISTINCT address FROM payments');
    const rows = stmt.all() as any[];
    return rows.map(row => row.address);
  }

  /**
   * Convert database row to TrackedPayment
   */
  private rowToPayment(row: any): TrackedPayment {
    return {
      id: row.id,
      address: row.address as `0x${string}`,
      initialAmount: row.initial_amount,
      initialCredits: row.initial_credits,
      initialCreditsPerToken: row.initial_credits_per_token,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      timestamp: row.timestamp,
      description: row.description || undefined,
      isRebasing: row.is_rebasing === 1,
    };
  }

  /**
   * Add yield history point
   */
  addYieldHistory(point: YieldHistoryPoint & { address: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO yield_history (
        address, timestamp, balance, credits_per_token, cumulative_yield, block_number
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      point.address.toLowerCase(),
      point.timestamp,
      point.balance,
      point.creditsPerToken,
      point.cumulativeYield,
      point.blockNumber
    );
  }

  /**
   * Get yield history for an address
   */
  getYieldHistory(address: string, limit: number = 100): YieldHistoryPoint[] {
    const stmt = this.db.prepare(`
      SELECT timestamp, balance, credits_per_token, cumulative_yield, block_number
      FROM yield_history
      WHERE address = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(address.toLowerCase(), limit) as any[];
    return rows.map(row => ({
      timestamp: row.timestamp,
      balance: row.balance,
      creditsPerToken: row.credits_per_token,
      cumulativeYield: row.cumulative_yield,
      blockNumber: row.block_number,
    }));
  }

  /**
   * Add rebase event
   */
  addRebaseEvent(event: RebaseEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO rebase_events (
        block_number, tx_hash, timestamp, previous_credits_per_token,
        new_credits_per_token, rebase_percentage, estimated_apy
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.blockNumber,
      event.txHash,
      event.timestamp,
      event.previousCreditsPerToken,
      event.newCreditsPerToken,
      event.rebasePercentage,
      event.estimatedAPY
    );
  }

  /**
   * Get latest rebase event
   */
  getLatestRebaseEvent(): RebaseEvent | null {
    const stmt = this.db.prepare(`
      SELECT * FROM rebase_events ORDER BY block_number DESC LIMIT 1
    `);
    const row = stmt.get() as any;
    return row ? this.rowToRebaseEvent(row) : null;
  }

  /**
   * Get rebase events in time range
   */
  getRebaseEvents(fromTimestamp: number, toTimestamp?: number, limit: number = 100): RebaseEvent[] {
    const to = toTimestamp || Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      SELECT * FROM rebase_events
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(fromTimestamp, to, limit) as any[];
    return rows.map(this.rowToRebaseEvent);
  }

  /**
   * Get rebase count
   */
  getRebaseCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM rebase_events');
    const row = stmt.get() as any;
    return row.count;
  }

  /**
   * Convert database row to RebaseEvent
   */
  private rowToRebaseEvent(row: any): RebaseEvent {
    return {
      blockNumber: row.block_number,
      txHash: row.tx_hash,
      timestamp: row.timestamp,
      previousCreditsPerToken: row.previous_credits_per_token,
      newCreditsPerToken: row.new_credits_per_token,
      rebasePercentage: row.rebase_percentage,
      estimatedAPY: row.estimated_apy,
    };
  }

  /**
   * Set global state value
   */
  setGlobalState(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO global_state (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(key, value, Math.floor(Date.now() / 1000));
  }

  /**
   * Get global state value
   */
  getGlobalState(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM global_state WHERE key = ?');
    const row = stmt.get(key) as any;
    return row ? row.value : null;
  }

  /**
   * Get sum of initial amounts for an address
   */
  getTotalInitialDeposits(address: string): string {
    const stmt = this.db.prepare(`
      SELECT initial_amount FROM payments WHERE address = ? AND is_rebasing = 1
    `);
    const rows = stmt.all(address.toLowerCase()) as any[];
    
    let total = 0n;
    for (const row of rows) {
      try {
        // Parse the amount (could be in ETH format "1.5" or wei)
        const amount = row.initial_amount.includes('.')
          ? BigInt(Math.floor(parseFloat(row.initial_amount) * 10 ** 18))
          : BigInt(row.initial_amount);
        total += amount;
      } catch {
        // Skip invalid amounts
      }
    }
    
    return total.toString();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create payment storage instance
 */
export function createPaymentStorage(dbPath?: string): PaymentStorage {
  return new PaymentStorage(dbPath);
}
