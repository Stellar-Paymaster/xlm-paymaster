#!/usr/bin/env tsx

/**
 * Demo script for AI-Powered Anomaly Detection
 * 
 * This script demonstrates the anomaly detection functionality by:
 * 1. Creating test data with realistic spending patterns
 * 2. Running anomaly detection
 * 3. Showing the results
 */

import { prisma } from "./src/utils/db";
import { 
  updateSpendBaseline, 
  checkAnomalies, 
  createFlaggedEvent,
  getPendingFlaggedEvents 
} from "./src/services/anomalyDetection";
import { createLogger } from "./src/utils/logger";

const logger = createLogger({ component: "anomaly_demo" });

const DEMO_TENANT_ID = "demo-tenant-anomaly";
const STROOPS_PER_XLM = 10_000_000;

async function setupDemoData() {
  console.log("🔧 Setting up demo data...");
  
  // Clean up any existing demo data
  await prisma.flaggedEvent.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.spendBaseline.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.transaction.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: DEMO_TENANT_ID } });
  
  // Create demo tenant
  await prisma.tenant.create({
    data: {
      id: DEMO_TENANT_ID,
      name: "Demo Anomaly Detection Tenant",
      subscriptionTierId: "free-tier"
    }
  });
  
  // Create baseline transactions (normal spending pattern)
  console.log("📊 Creating baseline transactions (7 days of normal spending)...");
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  
  for (let day = 0; day < 7; day++) {
    const date = new Date(sevenDaysAgo);
    date.setDate(date.getDate() + day);
    
    // Create 3-5 transactions per day, totaling ~0.1 XLM per day
    const dailyTransactions = Math.floor(Math.random() * 3) + 3;
    const costPerTransaction = Math.floor(1000000 / dailyTransactions); // ~0.1 XLM total
    
    for (let tx = 0; tx < dailyTransactions; tx++) {
      const txTime = new Date(date);
      txTime.setHours(Math.floor(Math.random() * 24));
      
      await prisma.transaction.create({
        data: {
          tenantId: DEMO_TENANT_ID,
          innerTxHash: `baseline-tx-${day}-${tx}`,
          status: "SUCCESS",
          costStroops: BigInt(costPerTransaction),
          category: "Payment",
          createdAt: txTime
        }
      });
    }
  }
  
  console.log("✅ Demo data setup complete");
}

async function demonstrateAnomalyDetection() {
  console.log("\n🤖 Running anomaly detection demonstration...");
  
  // Step 1: Calculate and update baseline
  console.log("\n1️⃣ Calculating baseline spending profile...");
  await updateSpendBaseline(DEMO_TENANT_ID);
  
  const baseline = await prisma.spendBaseline.findUnique({
    where: { tenantId: DEMO_TENANT_ID }
  });
  
  if (baseline) {
    console.log(`   📈 Daily Average: ${Number(baseline.dailyAvgStroops) / STROOPS_PER_XLM} XLM`);
    console.log(`   📊 Hourly Average: ${Number(baseline.hourlyAvgStroops) / STROOPS_PER_XLM} XLM`);
    console.log(`   💳 Total Transactions: ${baseline.totalTransactions}`);
  }
  
  // Step 2: Create anomalous spending in current hour
  console.log("\n2️⃣ Simulating anomalous spending (3.5x daily average in 1 hour)...");
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  
  const anomalyMultiplier = 3.5;
  const dailyAvg = baseline?.dailyAvgStroops || BigInt(1000000);
  const anomalousSpend = dailyAvg * BigInt(Math.floor(anomalyMultiplier * 100)) / BigInt(100);
  
  // Create multiple high-value transactions in the current hour
  const numTransactions = 8;
  const costPerTransaction = anomalousSpend / BigInt(numTransactions);
  
  for (let i = 0; i < numTransactions; i++) {
    const txTime = new Date(hourStart);
    txTime.setMinutes(i * 7); // Spread throughout the hour
    
    await prisma.transaction.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        innerTxHash: `anomaly-tx-${i}`,
        status: "SUCCESS",
        costStroops: costPerTransaction,
        category: "High Value Transfer",
        createdAt: txTime
      }
    });
  }
  
  console.log(`   💸 Created ${numTransactions} transactions totaling ${Number(anomalousSpend) / STROOPS_PER_XLM} XLM`);
  console.log(`   ⚠️  This is ${anomalyMultiplier}x the normal daily average`);
  
  // Step 3: Run anomaly detection
  console.log("\n3️⃣ Running anomaly detection...");
  const anomaly = await checkAnomalies(DEMO_TENANT_ID);
  
  if (anomaly) {
    console.log(`   🚨 ANOMALY DETECTED!`);
    console.log(`   📊 Multiplier: ${anomaly.multiplier.toFixed(2)}x`);
    console.log(`   💰 Actual Spend: ${Number(anomaly.actualSpendStroops) / STROOPS_PER_XLM} XLM`);
    console.log(`   📈 Baseline Daily: ${Number(anomaly.baselineDailyStroops) / STROOPS_PER_XLM} XLM`);
    console.log(`   ⚡ Risk Score: ${(anomaly.riskScore * 100).toFixed(1)}%`);
    
    // Create flagged event
    await createFlaggedEvent({
      tenantId: anomaly.tenantId,
      hourStart: anomaly.hourStart,
      actualSpendStroops: anomaly.actualSpendStroops,
      baselineDailyStroops: anomaly.baselineDailyStroops,
      multiplier: anomaly.multiplier,
      riskScore: anomaly.riskScore,
      metadata: {
        detectedAt: new Date().toISOString(),
        transactionCount: numTransactions,
        category: "High Value Transfer"
      }
    });
    
    console.log("   ✅ Flagged event created for admin review");
  } else {
    console.log("   ✅ No anomalies detected");
  }
  
  // Step 4: Show flagged events
  console.log("\n4️⃣ Retrieving flagged events for admin dashboard...");
  const flaggedEvents = await getPendingFlaggedEvents();
  
  if (flaggedEvents.length > 0) {
    console.log(`   📋 Found ${flaggedEvents.length} pending flagged events:`);
    
    flaggedEvents.forEach((event, index) => {
      console.log(`   ${index + 1}. Tenant: ${event.tenantName}`);
      console.log(`      Risk Score: ${(event.riskScore * 100).toFixed(1)}%`);
      console.log(`      Multiplier: ${event.multiplier.toFixed(2)}x`);
      console.log(`      Spend: ${event.actualSpendXlm.toFixed(4)} XLM`);
      console.log(`      Time: ${event.hourStart.toISOString()}`);
      if (event.metadata) {
        console.log(`      Details: ${JSON.stringify(event.metadata)}`);
      }
    });
  } else {
    console.log("   📋 No pending flagged events");
  }
}

async function cleanup() {
  console.log("\n🧹 Cleaning up demo data...");
  await prisma.flaggedEvent.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.spendBaseline.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.transaction.deleteMany({ where: { tenantId: DEMO_TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: DEMO_TENANT_ID } });
  console.log("✅ Cleanup complete");
}

async function main() {
  console.log("🚀 AI-Powered Anomaly Detection Demo");
  console.log("=====================================");
  
  try {
    await setupDemoData();
    await demonstrateAnomalyDetection();
    
    console.log("\n🎉 Demo completed successfully!");
    console.log("\n📚 What you can do next:");
    console.log("   1. Start the server: npm run dev");
    console.log("   2. Visit the admin dashboard");
    console.log("   3. Check the flagged events section");
    console.log("   4. Test the API endpoints:");
    console.log("      GET /admin/flagged-events");
    console.log("      GET /admin/anomaly-stats");
    console.log("      PATCH /admin/flagged-events/:id");
    
    // Ask if user wants to cleanup
    console.log("\n❓ Clean up demo data? (y/n)");
    // For demo purposes, we'll cleanup automatically
    await cleanup();
    
  } catch (error) {
    console.error("❌ Demo failed:", error);
    await cleanup();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}
