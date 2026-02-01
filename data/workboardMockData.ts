export type WorkboardBoard = {
  id: string;
  team_id: string;
  title: string;
  helper: string | null;
  tone: "slate" | "indigo" | "emerald" | "amber";
  status_key: string;
  position: number;
  archived_at: string | null;
};

export type WorkboardCard = {
  id: string;
  card_number: number | null;
  card_reference: string | null;
  team_id: string;
  board_id: string;
  title: string;
  description: string | null;
  type: "Engineering" | "Operations" | "Campaign" | "Product" | "Growth";
  priority: "Low" | "Medium" | "High" | "Critical";
  due_date: string | null;
  effort: string | null;
  position: number;
  archived_at: string | null;
};

export type WorkboardMember = {
  id: string;
  team_id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "inactive";
};

export type WorkboardMockMember = {
  name: string;
  initials: string;
  avatarUrl: string;
};

export const workboardMockMembers: WorkboardMockMember[] = [
  {
    name: "Lea",
    initials: "LE",
    avatarUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&w=128&h=128&q=80",
  },
  {
    name: "Milan",
    initials: "MI",
    avatarUrl:
      "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=facearea&w=128&h=128&q=80",
  },
  {
    name: "Ava",
    initials: "AV",
    avatarUrl:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&w=128&h=128&q=80",
  },
  {
    name: "Ravi",
    initials: "RA",
    avatarUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&w=128&h=128&q=80",
  },
];

export const workboardMockBoards: WorkboardBoard[] = [
  {
    id: "draft",
    team_id: "local",
    title: "Draft",
    helper: "Early ideas and unscoped work",
    status_key: "draft",
    tone: "slate",
    position: 0,
    archived_at: null,
  },
  {
    id: "backlog",
    team_id: "local",
    title: "Backlog",
    helper: "Prioritized work awaiting pickup",
    status_key: "backlog",
    tone: "indigo",
    position: 1,
    archived_at: null,
  },
  {
    id: "in-progress",
    team_id: "local",
    title: "In Progress",
    helper: "Active work in progress",
    status_key: "in-progress",
    tone: "amber",
    position: 2,
    archived_at: null,
  },
  {
    id: "done",
    team_id: "local",
    title: "Done",
    helper: "Work ready for handoff",
    status_key: "done",
    tone: "emerald",
    position: 3,
    archived_at: null,
  },
  {
    id: "completed",
    team_id: "local",
    title: "Completed",
    helper: "Delivered and verified outcomes",
    status_key: "completed",
    tone: "emerald",
    position: 4,
    archived_at: null,
  },
];

export const workboardMockCards: WorkboardCard[] = [
  {
    id: "mvrr-201",
    card_number: 201,
    card_reference: "MOVRR-201",
    team_id: "local",
    board_id: "draft",
    title: "New partner onboarding concept",
    description: "Outline the scope, milestones, and success metrics.",
    type: "Product",
    priority: "Medium",
    due_date: "2026-04-02",
    effort: "5 pts",
    position: 0,
    archived_at: null,
  },
  {
    id: "mvrr-202",
    card_number: 202,
    card_reference: "MOVRR-202",
    team_id: "local",
    board_id: "backlog",
    title: "Ops: Rider onboarding playbook",
    description: "Refresh training flow, safety checklist, and supply handoff.",
    type: "Operations",
    priority: "Medium",
    due_date: "2026-03-28",
    effort: "5 pts",
    position: 1,
    archived_at: null,
  },
  {
    id: "mvrr-203",
    card_number: 203,
    card_reference: "MOVRR-203",
    team_id: "local",
    board_id: "in-progress",
    title: "Product: Partner brief automation",
    description: "Auto-generate advertiser briefs with KPIs and geo heatmaps.",
    type: "Product",
    priority: "High",
    due_date: "2026-04-05",
    effort: "13 pts",
    position: 0,
    archived_at: null,
  },
  {
    id: "mvrr-204",
    card_number: 204,
    card_reference: "MOVRR-204",
    team_id: "local",
    board_id: "in-progress",
    title: "Engineering: Map routing perf patch",
    description: "Reduce route solver latency under peak traffic loads.",
    type: "Engineering",
    priority: "Critical",
    due_date: "2026-03-25",
    effort: "3 pts",
    position: 1,
    archived_at: null,
  },
  {
    id: "mvrr-205",
    card_number: 205,
    card_reference: "MOVRR-205",
    team_id: "local",
    board_id: "backlog",
    title: "Growth: Ambassador outreach wave",
    description: "Coordinate with ambassadors and track referral conversions.",
    type: "Growth",
    priority: "Medium",
    due_date: "2026-04-01",
    effort: "5 pts",
    position: 2,
    archived_at: null,
  },
  {
    id: "mvrr-206",
    card_number: 206,
    card_reference: "MOVRR-206",
    team_id: "local",
    board_id: "done",
    title: "Compliance: Identity verification audit",
    description: "Review flagged verifications and document outcomes.",
    type: "Operations",
    priority: "High",
    due_date: "2026-03-27",
    effort: "2 pts",
    position: 0,
    archived_at: null,
  },
  {
    id: "mvrr-207",
    card_number: 207,
    card_reference: "MOVRR-207",
    team_id: "local",
    board_id: "completed",
    title: "Campaign: Winter impact wrap-up",
    description: "Deliver final report with impression totals + ROI summary.",
    type: "Campaign",
    priority: "Low",
    due_date: "2026-03-18",
    effort: "3 pts",
    position: 0,
    archived_at: null,
  },
];
