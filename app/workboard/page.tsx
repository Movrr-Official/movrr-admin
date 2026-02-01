"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  CalendarDays,
  Sparkles,
  ClipboardCheck,
  KanbanSquare,
  MoreHorizontal,
  Users,
  Archive,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NEXT_PUBLIC_USE_MOCK_DATA, isProduction } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/supabase/client";
import {
  bootstrapWorkboardTeam,
  createWorkboardBoard,
  createWorkboardCard,
  deleteWorkboardBoard,
  getWorkboardBoards,
  getWorkboardCards,
  getWorkboardMembers,
  inviteWorkboardMember,
  updateWorkboardMemberRole,
  removeWorkboardMember,
} from "@/app/actions/workboard";
import { useToast } from "@/hooks/useToast";
import {
  workboardMockBoards,
  workboardMockCards,
  workboardMockMembers,
  type WorkboardBoard,
  type WorkboardCard,
  type WorkboardMember,
} from "@/data/workboardMockData";

type WorkboardRole = "owner" | "admin" | "editor" | "viewer";

const typeTone: Record<WorkboardCard["type"], string> = {
  Engineering: "bg-slate-100 text-slate-700",
  Operations: "bg-emerald-100 text-emerald-700",
  Campaign: "bg-indigo-100 text-indigo-700",
  Product: "bg-amber-100 text-amber-700",
  Growth: "bg-purple-100 text-purple-700",
};

const priorityTone: Record<WorkboardCard["priority"], string> = {
  Low: "bg-slate-50 text-slate-600",
  Medium: "bg-blue-50 text-blue-600",
  High: "bg-orange-50 text-orange-600",
  Critical: "bg-rose-50 text-rose-600",
};

const boardTones: WorkboardBoard["tone"][] = [
  "slate",
  "indigo",
  "amber",
  "emerald",
];

const toBoardStatus = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "new-board";

const formatDueDate = (date?: string | null) => {
  if (!date) return "TBD";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "TBD";
  }
};

const formatCardId = (card: WorkboardCard) => {
  if (card.card_reference) return card.card_reference.toUpperCase();
  if (!card.id) return "";
  if (card.id.length <= 8) return card.id.toUpperCase();
  const lastChunk = card.id.split("-").pop() ?? card.id;
  return lastChunk.slice(0, 6).toUpperCase();
};

export default function WorkboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { toast } = useToast();
  const useMockData = NEXT_PUBLIC_USE_MOCK_DATA && !isProduction;
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("MOVRR HQ");
  const [currentRole, setCurrentRole] = useState<WorkboardRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [boards, setBoards] = useState<WorkboardBoard[]>(() =>
    useMockData ? workboardMockBoards : [],
  );
  const [cards, setCards] = useState<WorkboardCard[]>(() =>
    useMockData ? workboardMockCards : [],
  );
  const [members, setMembers] = useState<WorkboardMember[]>([]);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedBoardId, setDraggedBoardId] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCreateBoardId, setActiveCreateBoardId] = useState<string | null>(
    null,
  );
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDescription, setNewCardDescription] = useState("");
  const [isBoardFormOpen, setIsBoardFormOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newBoardHelper, setNewBoardHelper] = useState("");
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkboardRole>("editor");
  const [showArchived, setShowArchived] = useState(false);
  const [pendingBoardScrollId, setPendingBoardScrollId] = useState<
    string | null
  >(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [editingBoard, setEditingBoard] = useState<WorkboardBoard | null>(null);
  const [editingCard, setEditingCard] = useState<WorkboardCard | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<WorkboardBoard | null>(
    null,
  );
  const [cardToDelete, setCardToDelete] = useState<WorkboardCard | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    if (useMockData) {
      setBoards(workboardMockBoards);
      setCards(workboardMockCards);
      setTeamId("local");
      setTeamName("MOVRR Mock Team");
      setCurrentRole("owner");
      setCurrentUserId("mock-user");
      setMembers([
        {
          id: "mock-owner",
          team_id: "local",
          user_id: "mock-user",
          email: "owner@movrr.nl",
          role: "owner",
          status: "active",
        },
      ]);
      return;
    }

    setBoards([]);
    setCards([]);

    let mounted = true;
    bootstrapWorkboardTeam()
      .then((data) => {
        if (!mounted) return;
        setTeamId(data.teamId);
        setTeamName(data.teamName);
        setCurrentRole(data.role);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        toast({
          title: "Workboard unavailable",
          description: message,
          variant: "destructive",
        });
      });

    return () => {
      mounted = false;
    };
  }, [toast, useMockData]);

  const canManageTeam = currentRole === "owner" || currentRole === "admin";
  const canManageBoards = canManageTeam;
  const canEditCards =
    currentRole === "owner" ||
    currentRole === "admin" ||
    currentRole === "editor";
  const canDeleteCards = currentRole === "owner" || currentRole === "admin";

  const filteredBoards = useMemo(
    () =>
      boards
        .filter((board) => (showArchived ? true : !board.archived_at))
        .sort((a, b) => a.position - b.position),
    [boards, showArchived],
  );

  const grouped = useMemo(() => {
    return filteredBoards.map((board) => ({
      ...board,
      items: cards
        .filter((card) => card.board_id === board.id)
        .filter((card) => (showArchived ? true : !card.archived_at))
        .sort((a, b) => a.position - b.position),
    }));
  }, [cards, filteredBoards, showArchived]);

  const displayMembers = useMemo(() => {
    if (useMockData) return workboardMockMembers;
    return members.map((member) => {
      const label = member.email || member.user_id || "User";
      const initials = label
        .split(/\s|@/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
      return {
        name: label,
        initials: initials || "MV",
        avatarUrl: "",
      };
    });
  }, [members, useMockData]);

  const fetchBoards = async (team: string) => {
    const data = await getWorkboardBoards(team);
    setBoards(data as WorkboardBoard[]);
  };

  const fetchCards = async (team: string) => {
    const data = await getWorkboardCards(team);
    setCards(data as WorkboardCard[]);
  };

  const fetchMembers = async (team: string) => {
    const data = await getWorkboardMembers(team);
    setMembers(data as WorkboardMember[]);
  };

  useEffect(() => {
    if (!teamId || useMockData) return;
    fetchBoards(teamId);
    fetchCards(teamId);
    fetchMembers(teamId);

    const channel = supabase
      .channel(`workboard:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workboard_boards",
          filter: `team_id=eq.${teamId}`,
        },
        () => fetchBoards(teamId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workboard_cards",
          filter: `team_id=eq.${teamId}`,
        },
        () => fetchCards(teamId),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, teamId, useMockData]);

  const handleDragStart = (cardId: string) => (event: DragEvent) => {
    event.dataTransfer.setData("text/plain", cardId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedCardId(cardId);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setActiveBoardId(null);
    setActiveCardId(null);
  };

  const handleBoardDragStart = (boardId: string) => (event: DragEvent) => {
    event.dataTransfer.setData("application/x-workboard-board", boardId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedBoardId(boardId);
  };

  const handleBoardDragEnd = () => {
    setDraggedBoardId(null);
    setActiveBoardId(null);
  };

  const persistBoardOrder = async (nextBoards: WorkboardBoard[]) => {
    if (!currentUserId || useMockData) return;
    await Promise.all(
      nextBoards.map((board, index) =>
        supabase
          .from("workboard_boards")
          .update({ position: index, updated_by: currentUserId })
          .eq("id", board.id),
      ),
    );
  };

  const reorderBoards = (sourceId: string, targetId: string) => {
    setBoards((prev) => {
      const sourceIndex = prev.findIndex((board) => board.id === sourceId);
      const targetIndex = prev.findIndex((board) => board.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;
      const nextBoards = [...prev];
      const [moved] = nextBoards.splice(sourceIndex, 1);
      nextBoards.splice(targetIndex, 0, moved);
      const withPositions = nextBoards.map((board, index) => ({
        ...board,
        position: index,
      }));
      persistBoardOrder(withPositions);
      return withPositions;
    });
  };

  const persistBoardPositions = async (
    boardId: string,
    boardCards: WorkboardCard[],
  ) => {
    if (!currentUserId) return;
    if (useMockData) return;
    await Promise.all(
      boardCards.map((card, index) =>
        supabase
          .from("workboard_cards")
          .update({
            position: index,
            board_id: boardId,
            updated_by: currentUserId,
          })
          .eq("id", card.id),
      ),
    );
  };

  const moveCard = async (
    cardId: string,
    nextBoardId: string,
    nextIndex?: number,
  ) => {
    if (!canEditCards) return;
    setCards((prev) => {
      const moving = prev.find((card) => card.id === cardId);
      if (!moving) return prev;
      const filtered = prev.filter((card) => card.id !== cardId);
      const updatedCard = { ...moving, board_id: nextBoardId };
      const before = filtered.filter((card) => card.board_id === nextBoardId);
      const after = filtered.filter((card) => card.board_id !== nextBoardId);

      if (nextIndex === undefined || nextIndex < 0) {
        return [...before, updatedCard, ...after];
      }

      const insertAt = Math.min(before.length, nextIndex);
      const reordered = [
        ...before.slice(0, insertAt),
        updatedCard,
        ...before.slice(insertAt),
      ];

      return [...reordered, ...after];
    });

    const updatedCards = cards.filter((card) => card.id !== cardId);
    const movingCard = cards.find((card) => card.id === cardId);
    if (!movingCard) return;

    const originBoardId = movingCard.board_id;
    const nextBoardCards = updatedCards
      .filter((card) => card.board_id === nextBoardId)
      .sort((a, b) => a.position - b.position);
    const originBoardCards = updatedCards
      .filter((card) => card.board_id === originBoardId)
      .sort((a, b) => a.position - b.position);

    const insertAt = nextIndex ?? nextBoardCards.length;
    nextBoardCards.splice(insertAt, 0, {
      ...movingCard,
      board_id: nextBoardId,
    });

    await persistBoardPositions(nextBoardId, nextBoardCards);
    if (originBoardId !== nextBoardId) {
      await persistBoardPositions(originBoardId, originBoardCards);
    }
  };

  const handleBoardOrCardDrop = (boardId: string) => (event: DragEvent) => {
    event.preventDefault();
    const boardDragId = event.dataTransfer.getData(
      "application/x-workboard-board",
    );
    if (boardDragId) {
      if (boardDragId !== boardId) {
        reorderBoards(boardDragId, boardId);
      }
      setActiveBoardId(null);
      return;
    }

    const cardId = event.dataTransfer.getData("text/plain");
    if (!cardId) return;
    moveCard(cardId, boardId);
    setActiveBoardId(null);
    setActiveCardId(null);
  };

  const handleDropOnCard =
    (boardId: string, cardId: string) => (event: DragEvent) => {
      event.preventDefault();
      const movingId = event.dataTransfer.getData("text/plain");
      if (!movingId) return;
      const boardCards = cards
        .filter((card) => card.board_id === boardId)
        .sort((a, b) => a.position - b.position);
      const targetIndex = boardCards.findIndex((card) => card.id === cardId);
      moveCard(movingId, boardId, targetIndex);
      setActiveBoardId(null);
      setActiveCardId(null);
    };

  const resetCardComposer = () => {
    setNewCardTitle("");
    setNewCardDescription("");
    setActiveCreateBoardId(null);
  };

  const handleAddCard = async (boardId: string) => {
    if (!canEditCards || !teamId || !currentUserId) return;
    const trimmedTitle = newCardTitle.trim();
    if (!trimmedTitle) return;

    const boardCards = cards.filter((card) => card.board_id === boardId);
    const nextPosition = boardCards.length;

    if (useMockData) {
      setCards((prev) => {
        const maxNumber = prev.reduce(
          (max, card) => Math.max(max, card.card_number ?? 0),
          0,
        );
        const nextNumber = maxNumber + 1;
        return [
          ...prev,
          {
            id: `mock-${Date.now()}`,
            card_number: nextNumber,
            card_reference: `MOVRR-${nextNumber}`,
            team_id: teamId,
            board_id: boardId,
            title: trimmedTitle,
            description: newCardDescription.trim() || null,
            type: "Operations",
            priority: "Medium",
            due_date: null,
            effort: "3 pts",
            position: nextPosition,
            archived_at: null,
          },
        ];
      });
      resetCardComposer();
      return;
    }

    try {
      await createWorkboardCard({
        teamId,
        boardId,
        title: trimmedTitle,
        description: newCardDescription.trim() || null,
        type: "Operations",
        priority: "Medium",
        dueDate: null,
        effort: "3 pts",
        position: nextPosition,
      });
      await fetchCards(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Unable to add card",
        description: message,
        variant: "destructive",
      });
      return;
    }

    resetCardComposer();
  };

  const handleCreateBoard = async () => {
    if (!teamId || !currentUserId || !canManageBoards) return;
    const title = newBoardTitle.trim();
    if (!title) return;
    const helper = newBoardHelper.trim() || "New MOVRR workflow lane";
    const baseStatus = toBoardStatus(title);
    let status = baseStatus;
    let suffix = 1;
    while (boards.some((board) => board.status_key === status)) {
      status = `${baseStatus}-${suffix}`;
      suffix += 1;
    }
    const tone = boardTones[boards.length % boardTones.length];

    if (useMockData) {
      setBoards((prev) => [
        ...prev,
        {
          id: status,
          team_id: teamId,
          title,
          helper,
          tone,
          status_key: status,
          position: prev.length,
          archived_at: null,
        },
      ]);
      setPendingBoardScrollId(status);
      setNewBoardTitle("");
      setNewBoardHelper("");
      setIsBoardFormOpen(false);
      return;
    }

    try {
      const result = await createWorkboardBoard({
        teamId,
        title,
        helper,
        tone,
        statusKey: status,
        position: boards.length,
      });
      setPendingBoardScrollId(result.id);
      await fetchBoards(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Unable to add board",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setNewBoardTitle("");
    setNewBoardHelper("");
    setIsBoardFormOpen(false);
  };

  const closeBoardModal = () => {
    setIsBoardFormOpen(false);
    setNewBoardTitle("");
    setNewBoardHelper("");
  };

  const handleUpdateBoard = async () => {
    if (!editingBoard || !currentUserId) return;
    if (useMockData) {
      setBoards((prev) =>
        prev.map((board) =>
          board.id === editingBoard.id ? editingBoard : board,
        ),
      );
      setEditingBoard(null);
      return;
    }
    const { error } = await supabase
      .from("workboard_boards")
      .update({
        title: editingBoard.title,
        helper: editingBoard.helper,
        updated_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingBoard.id);

    if (error) {
      toast({
        title: "Unable to update board",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setEditingBoard(null);
  };

  const handleArchiveBoard = async (boardId: string) => {
    if (!currentUserId) return;
    if (useMockData) {
      setBoards((prev) =>
        prev.map((board) =>
          board.id === boardId
            ? { ...board, archived_at: new Date().toISOString() }
            : board,
        ),
      );
      return;
    }
    await supabase
      .from("workboard_boards")
      .update({
        archived_at: new Date().toISOString(),
        updated_by: currentUserId,
      })
      .eq("id", boardId);
  };

  const handleDeleteBoard = async () => {
    if (!boardToDelete) return;
    if (useMockData) {
      setBoards((prev) =>
        prev.filter((board) => board.id !== boardToDelete.id),
      );
      setCards((prev) =>
        prev.filter((card) => card.board_id !== boardToDelete.id),
      );
      setBoardToDelete(null);
      return;
    }
    try {
      await deleteWorkboardBoard({
        teamId: boardToDelete.team_id,
        boardId: boardToDelete.id,
      });
      if (teamId) {
        await fetchBoards(teamId);
        await fetchCards(teamId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Unable to delete board",
        description: message,
        variant: "destructive",
      });
    }
    setBoardToDelete(null);
  };

  const handleUpdateCard = async () => {
    if (!editingCard || !currentUserId) return;
    if (useMockData) {
      setCards((prev) =>
        prev.map((card) => (card.id === editingCard.id ? editingCard : card)),
      );
      setEditingCard(null);
      return;
    }
    const { error } = await supabase
      .from("workboard_cards")
      .update({
        title: editingCard.title,
        description: editingCard.description,
        priority: editingCard.priority,
        type: editingCard.type,
        due_date: editingCard.due_date,
        effort: editingCard.effort,
        updated_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingCard.id);

    if (error) {
      toast({
        title: "Unable to update card",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setEditingCard(null);
  };

  const handleArchiveCard = async (cardId: string) => {
    if (!currentUserId) return;
    if (useMockData) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, archived_at: new Date().toISOString() }
            : card,
        ),
      );
      return;
    }
    await supabase
      .from("workboard_cards")
      .update({
        archived_at: new Date().toISOString(),
        updated_by: currentUserId,
      })
      .eq("id", cardId);
  };

  const handleDeleteCard = async () => {
    if (!cardToDelete) return;
    if (useMockData) {
      setCards((prev) => prev.filter((card) => card.id !== cardToDelete.id));
      setCardToDelete(null);
      return;
    }
    const { error } = await supabase
      .from("workboard_cards")
      .delete()
      .eq("id", cardToDelete.id);
    if (error) {
      toast({
        title: "Unable to delete card",
        description: error.message,
        variant: "destructive",
      });
    }
    setCardToDelete(null);
  };

  const handleInvite = async () => {
    if (!teamId || !canManageTeam) return;
    if (useMockData) {
      setMembers((prev) => [
        ...prev,
        {
          id: `mock-member-${Date.now()}`,
          team_id: teamId,
          user_id: `mock-${Date.now()}`,
          email: inviteEmail,
          role: inviteRole,
          status: "active",
        },
      ]);
      setInviteEmail("");
      setInviteRole("editor");
      return;
    }
    try {
      await inviteWorkboardMember({
        teamId,
        email: inviteEmail,
        role: inviteRole,
      });
      toast({
        title: "Invite sent",
        description: `Invite sent to ${inviteEmail}.`,
      });
      setInviteEmail("");
      setInviteRole("editor");
      fetchMembers(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Invite failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (memberId: string, role: WorkboardRole) => {
    if (useMockData) {
      setMembers((prev) =>
        prev.map((member) =>
          member.id === memberId ? { ...member, role } : member,
        ),
      );
      return;
    }
    await updateWorkboardMemberRole({ memberId, role });
    if (teamId) fetchMembers(teamId);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (useMockData) {
      setMembers((prev) => prev.filter((member) => member.id !== memberId));
      return;
    }
    await removeWorkboardMember(memberId);
    if (teamId) fetchMembers(teamId);
  };

  useEffect(() => {
    if (!pendingBoardScrollId) return;
    const container = boardScrollRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-board-id="${pendingBoardScrollId}"]`,
    );
    if (target) {
      target.scrollIntoView({ behavior: "smooth", inline: "end" });
    } else if (container) {
      container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
    }
    setPendingBoardScrollId(null);
  }, [pendingBoardScrollId, boards]);

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Cross-team delivery board
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Track product, engineering, operations, and campaign execution in
              a single flow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <KanbanSquare className="h-3.5 w-3.5" />
              {cards.filter((card) => !card.archived_at).length} active
              initiatives
            </div>
            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {cards.filter((card) => card.priority === "High").length} high
              priority
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Team members
              </span>
              <div className="flex -space-x-2">
                {displayMembers.map((member) => (
                  <Avatar key={member.name} className="h-7 w-7 border">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.name} />
                    ) : null}
                    <AvatarFallback className="text-[10px]">
                      {member.initials}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setIsTeamModalOpen(true)}
            >
              <Users className="h-4 w-4" />
              Team
            </Button>
            <Button
              size="sm"
              onClick={() => setIsBoardFormOpen(true)}
              disabled={!canManageBoards}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowArchived((prev) => !prev)}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          </div>
        </div>

        <Dialog
          open={isBoardFormOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsBoardFormOpen(true);
            } else {
              closeBoardModal();
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create a new work board</DialogTitle>
              <DialogDescription>
                Add a stage to track how MOVRR work flows across teams.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Board title
                </label>
                <Input
                  value={newBoardTitle}
                  onChange={(event) => setNewBoardTitle(event.target.value)}
                  placeholder="e.g. Live Ops"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Helper text
                </label>
                <Input
                  value={newBoardHelper}
                  onChange={(event) => setNewBoardHelper(event.target.value)}
                  placeholder="What moves through this stage"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={closeBoardModal}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreateBoard}>
                  Add board
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Workboard team</DialogTitle>
              <DialogDescription>
                Manage invites, roles, and visibility for this workboard.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Invite email
                    </label>
                    <Input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="name@movrr.nl"
                      disabled={!canManageTeam}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Role
                    </label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) =>
                        setInviteRole(value as WorkboardRole)
                      }
                      disabled={!canManageTeam}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleInvite}
                    disabled={!canManageTeam || !inviteEmail}
                  >
                    Send invite
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Active members</h3>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                    >
                      <div className="min-w-[200px]">
                        <p className="text-sm font-medium text-foreground">
                          {member.email || member.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Role: {member.role}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            handleRoleChange(member.id, value as WorkboardRole)
                          }
                          disabled={!canManageTeam}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canManageTeam}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!members.length && (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No members loaded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(editingBoard)}
          onOpenChange={() => setEditingBoard(null)}
        >
          {editingBoard && (
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit board</DialogTitle>
                <DialogDescription>Update the board details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  value={editingBoard.title}
                  onChange={(event) =>
                    setEditingBoard({
                      ...editingBoard,
                      title: event.target.value,
                    })
                  }
                />
                <Input
                  value={editingBoard.helper ?? ""}
                  onChange={(event) =>
                    setEditingBoard({
                      ...editingBoard,
                      helper: event.target.value,
                    })
                  }
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditingBoard(null)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateBoard}>Save</Button>
                </div>
              </div>
            </DialogContent>
          )}
        </Dialog>

        <Dialog
          open={Boolean(editingCard)}
          onOpenChange={() => setEditingCard(null)}
        >
          {editingCard && (
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit card</DialogTitle>
                <DialogDescription>
                  Update card details and priority.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  value={editingCard.title}
                  onChange={(event) =>
                    setEditingCard({
                      ...editingCard,
                      title: event.target.value,
                    })
                  }
                />
                <Textarea
                  value={editingCard.description ?? ""}
                  onChange={(event) =>
                    setEditingCard({
                      ...editingCard,
                      description: event.target.value,
                    })
                  }
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Select
                    value={editingCard.type}
                    onValueChange={(value) =>
                      setEditingCard({
                        ...editingCard,
                        type: value as WorkboardCard["type"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Campaign">Campaign</SelectItem>
                      <SelectItem value="Product">Product</SelectItem>
                      <SelectItem value="Growth">Growth</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={editingCard.priority}
                    onValueChange={(value) =>
                      setEditingCard({
                        ...editingCard,
                        priority: value as WorkboardCard["priority"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={editingCard.due_date ?? ""}
                    onChange={(event) =>
                      setEditingCard({
                        ...editingCard,
                        due_date: event.target.value,
                      })
                    }
                    placeholder="YYYY-MM-DD"
                  />
                  <Input
                    value={editingCard.effort ?? ""}
                    onChange={(event) =>
                      setEditingCard({
                        ...editingCard,
                        effort: event.target.value,
                      })
                    }
                    placeholder="Effort (e.g. 5 pts)"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEditingCard(null)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateCard}>Save</Button>
                </div>
              </div>
            </DialogContent>
          )}
        </Dialog>

        <AlertDialog
          open={Boolean(boardToDelete)}
          onOpenChange={() => setBoardToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete board</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the board and all cards inside it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteBoard}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(cardToDelete)}
          onOpenChange={() => setCardToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete card</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the card.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCard}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="overflow-x-auto pb-2" ref={boardScrollRef}>
          <div className="flex w-max gap-6 items-start">
            {grouped.map((board) => (
              <div
                key={board.id}
                data-board-id={board.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  setActiveBoardId(board.id);
                }}
                onDrop={handleBoardOrCardDrop(board.id)}
                onDragLeave={() => setActiveBoardId(null)}
                className={cn(
                  "h-fit w-80 rounded-2xl border bg-muted/30 p-4 transition-colors",
                  activeBoardId === board.id && "bg-emerald-50/60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "space-y-1",
                      canManageBoards && "cursor-move",
                    )}
                    draggable={canManageBoards}
                    onDragStart={handleBoardDragStart(board.id)}
                    onDragEnd={handleBoardDragEnd}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {board.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-0 px-2 text-[10px] font-semibold",
                          board.tone === "slate" &&
                            "bg-slate-100 text-slate-600",
                          board.tone === "indigo" &&
                            "bg-indigo-100 text-indigo-700",
                          board.tone === "emerald" &&
                            "bg-emerald-100 text-emerald-700",
                          board.tone === "amber" &&
                            "bg-amber-100 text-amber-700",
                        )}
                      >
                        {board.items.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {board.helper}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setActiveCreateBoardId(board.id);
                        setNewCardTitle("");
                        setNewCardDescription("");
                      }}
                      disabled={!canEditCards}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingBoard(board)}
                          disabled={!canManageBoards}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleArchiveBoard(board.id)}
                          disabled={!canManageBoards}
                        >
                          <Archive className="mr-2 h-3.5 w-3.5" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-600"
                          onClick={() => setBoardToDelete(board)}
                          disabled={!canManageBoards}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {board.items.map((card) => (
                    <Card
                      key={card.id}
                      draggable={canEditCards}
                      onDragStart={handleDragStart(card.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setActiveCardId(card.id);
                      }}
                      onDrop={handleDropOnCard(board.id, card.id)}
                      className={cn(
                        "cursor-grab border-0 bg-background shadow-sm transition-all",
                        draggedCardId === card.id && "opacity-60",
                        activeCardId === card.id &&
                          draggedCardId !== card.id &&
                          "ring-2 ring-emerald-200",
                      )}
                    >
                      <CardContent className="space-y-3 p-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              className={cn("text-[10px]", typeTone[card.type])}
                            >
                              {card.type}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border-0 text-[10px]",
                                  priorityTone[card.priority],
                                )}
                              >
                                {card.priority}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => setEditingCard(card)}
                                    disabled={!canEditCards}
                                  >
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleArchiveCard(card.id)}
                                    disabled={!canEditCards}
                                  >
                                    <Archive className="mr-2 h-3.5 w-3.5" />
                                    Archive
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-rose-600"
                                    onClick={() => setCardToDelete(card)}
                                    disabled={!canDeleteCards}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          <h3 className="text-sm font-semibold text-foreground">
                            {card.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {card.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDueDate(card.due_date)}
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {card.effort || "-"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex -space-x-2">
                            {displayMembers.map((person) => (
                              <Avatar
                                key={`${card.id}-${person.initials}`}
                                className="h-7 w-7 border"
                              >
                                {person.avatarUrl ? (
                                  <AvatarImage
                                    src={person.avatarUrl}
                                    alt={person.name}
                                  />
                                ) : null}
                                <AvatarFallback className="text-[10px]">
                                  {person.initials}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {formatCardId(card)}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {activeCreateBoardId === board.id && (
                    <Card className="border border-emerald-200 bg-emerald-50/40">
                      <CardContent className="space-y-3 p-4">
                        <Input
                          value={newCardTitle}
                          onChange={(event) =>
                            setNewCardTitle(event.target.value)
                          }
                          placeholder="Card title"
                        />
                        <Textarea
                          value={newCardDescription}
                          onChange={(event) =>
                            setNewCardDescription(event.target.value)
                          }
                          placeholder="Add context or acceptance criteria"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAddCard(board.id)}
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={resetCardComposer}
                          >
                            Cancel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
