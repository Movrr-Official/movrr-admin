import { RewardTransaction, RiderBalance } from "@/schemas";
import { mockUsers } from "./mockUsers";
import { mockCampaigns } from "./mockCampaigns";
import { mockRoutes } from "./mockRoutes";

// Generate mock reward transactions
export const mockRewardTransactions: RewardTransaction[] = [
  {
    id: "txn-1",
    riderId: "rider-1",
    campaignId: mockCampaigns[0].id,
    routeId: mockRoutes[0].id,
    type: "awarded",
    points: 150,
    description: "Route completion bonus",
    balanceAfter: 150,
    createdAt: "2023-06-15T10:30:00Z",
  },
  {
    id: "txn-2",
    riderId: "rider-1",
    campaignId: mockCampaigns[1].id,
    routeId: mockRoutes[1].id,
    type: "awarded",
    points: 200,
    description: "High performance route bonus",
    balanceAfter: 350,
    createdAt: "2023-06-16T14:20:00Z",
  },
  {
    id: "txn-3",
    riderId: "rider-1",
    type: "redeemed",
    points: -50,
    description: "Redeemed for gift card",
    balanceAfter: 300,
    createdAt: "2023-06-17T09:15:00Z",
  },
  {
    id: "txn-4",
    riderId: "rider-2",
    campaignId: mockCampaigns[0].id,
    routeId: mockRoutes[2].id,
    type: "awarded",
    points: 100,
    description: "Route completion",
    balanceAfter: 100,
    createdAt: "2023-06-14T11:00:00Z",
  },
  {
    id: "txn-5",
    riderId: "rider-2",
    campaignId: mockCampaigns[2].id,
    routeId: mockRoutes[3].id,
    type: "awarded",
    points: 180,
    description: "Route completion bonus",
    balanceAfter: 280,
    createdAt: "2023-06-15T16:45:00Z",
  },
  {
    id: "txn-6",
    riderId: "rider-3",
    campaignId: mockCampaigns[1].id,
    routeId: mockRoutes[4].id,
    type: "awarded",
    points: 120,
    description: "Route completion",
    balanceAfter: 120,
    createdAt: "2023-06-13T08:30:00Z",
  },
  {
    id: "txn-7",
    riderId: "rider-3",
    type: "redeemed",
    points: -75,
    description: "Redeemed for merchandise",
    balanceAfter: 45,
    createdAt: "2023-06-18T13:20:00Z",
  },
  {
    id: "txn-8",
    riderId: "rider-4",
    campaignId: mockCampaigns[3].id,
    routeId: mockRoutes[0].id,
    type: "awarded",
    points: 250,
    description: "Excellent route performance",
    balanceAfter: 250,
    createdAt: "2023-06-12T10:00:00Z",
  },
  {
    id: "txn-9",
    riderId: "rider-1",
    type: "adjusted",
    points: 25,
    description: "Manual adjustment by admin",
    balanceAfter: 325,
    createdAt: "2023-06-19T15:00:00Z",
    createdBy: "admin-1",
  },
];

// Calculate rider balances from transactions
export const mockRiderBalances: RiderBalance[] = mockUsers
  .filter((user) => user.role === "rider")
  .map((user) => {
    const transactions = mockRewardTransactions.filter((txn) => txn.riderId === user.id);
    const totalPointsAwarded = transactions
      .filter((txn) => txn.type === "awarded" || txn.type === "adjusted")
      .reduce((sum, txn) => sum + Math.abs(txn.points), 0);
    const totalPointsRedeemed = transactions
      .filter((txn) => txn.type === "redeemed")
      .reduce((sum, txn) => sum + Math.abs(txn.points), 0);
    const currentBalance = transactions.length > 0 
      ? transactions[transactions.length - 1].balanceAfter 
      : 0;
    const lastTransaction = transactions.length > 0
      ? transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : null;

    return {
      riderId: user.id,
      riderName: user.name,
      riderEmail: user.email,
      totalPointsAwarded,
      totalPointsRedeemed,
      currentBalance,
      lastTransactionDate: lastTransaction?.createdAt,
    };
  });
