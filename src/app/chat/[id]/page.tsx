"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { Header } from "@/components/header"; // Headerをインポート
import { useChatStore } from "@/store/chat-store";
import { MainBranchView } from "@/components/chat/main-branch-view";
import { SubBranchView } from "@/components/chat/sub-branch-view";
import { TopLinearLoader } from "@/components/chat/top-linear-loader";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { chatData, isLoading, error, fetchChat, clearChat } = useChatStore();
  const [creationContext, setCreationContext] = useState<{ parentBlockId: string } | undefined>();
  const [branchContext, setBranchContext] = useState<any>(null);
  const [initialMessage, setInitialMessage] = useState<string | null>(null);
  const [targetBlockId, setTargetBlockId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ blockId: string; t: number } | null>(null);

  const isLoaded = !isLoading && !!chatData;


  useEffect(() => {
    const handleHashChange = () => {
      if (!chatData || !isLoaded) return;
      const hash = window.location.hash;
      if (hash.startsWith("#block-")) {
        const blockId = hash.replace("#block-", "");
        const block = chatData.blocks[blockId];
        if (block) {
          setTargetBlockId(blockId);
          setScrollRequest({ blockId, t: Date.now() });
          const branch = chatData.branches[block.branch_id];
          if (branch && branch.depth > 0) {
            setBranchContext(chatData.branches[branch.parent_branch_id!] || null);
            setCreationContext({ parentBlockId: branch.parent_block_id! });
          } else {
            setCreationContext(undefined);
            setBranchContext(null);
          }
        }
      } else {
        setTargetBlockId(null);
        setScrollRequest(null);
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [chatData, isLoaded, id]);

  const parseError = (err: unknown) => {
    const fallbackMessage = "送信中にエラーが発生しました。";

    if (err instanceof Error && err.message) {
      const match = err.message.match(/^\[(\d+)\]\s*(.*)$/);
      if (match) {
        return {
          code: Number(match[1]),
          message: match[2] || fallbackMessage,
        };
      }

      return { code: 500, message: err.message };
    }

    return { code: 500, message: fallbackMessage };
  };

  const revertInitializedChat = async () => {
    try {
      await fetch("/api/internal/chat/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id }),
      });
    } catch (revertError) {
      console.error("[ChatInitRevertFailed]", revertError);
    }
  };

  const handleInitialSendError = async (sendError: unknown) => {
    const parsed = parseError(sendError);
    await revertInitializedChat();

    sessionStorage.setItem(
      "chat-init-error",
      JSON.stringify({ code: parsed.code, message: parsed.message })
    );

    void fetch("/api/internal/chat/list");
    router.replace("/");
  };

  useEffect(() => {
    try {
      const key = `pending-init:${id}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;

      sessionStorage.removeItem(key);

      const parsed = JSON.parse(raw) as { message?: unknown };
      const pendingMessage =
        typeof parsed.message === "string" ? parsed.message.trim() : "";

      if (pendingMessage) {
        setInitialMessage(pendingMessage);
      }
    } catch (storageError) {
      console.error("[PendingInitReadFailed]", storageError);
    }
  }, [id]);

  useEffect(() => {
    clearChat();
    void fetchChat(id);
  }, [id, fetchChat, clearChat]);

  const mainBranch = useMemo(
    () =>
      Object.values(chatData?.branches ?? {}).find(
        (branch) => branch.depth === 0 && !branch.parent_branch_id
      ) ?? null,
    [chatData]
  );

  const deepestBranch = useMemo(() => {
    if (!chatData?.branches) return null;

    // 有効なブランチ（active/locked）のみを抽出
    const branches = Object.values(chatData.branches);
    const validBranches = branches.filter(
      (b) => b.status === "active" || b.status === "locked"
    );

    if (validBranches.length === 0) {
      // 全て無効な場合はメインブランチ（depth 0）を探す
      return branches.find(b => b.depth === 0) || null;
    }

    // 最も深いブランチを選択。同じ深さなら作成日時が新しいものを優先
    return validBranches.reduce((prev, current) => {
      if (!prev) return current;
      if (current.depth > prev.depth) return current;
      if (current.depth === prev.depth) {
        return new Date(current.created_at).getTime() > new Date(prev.created_at).getTime() ? current : prev;
      }
      return prev;
    }, null as any);
  }, [chatData]);

  const handleCloseSubBranch = () => {
    setCreationContext(undefined);
    setBranchContext(null);
  };

  const handleReload = async () => {
    await fetchChat(id);
    const data = useChatStore.getState().chatData;
    if (!data) return;

    if (creationContext?.parentBlockId) {
      const activeSiblings = Object.values(data.branches).filter(
        b => b.parent_block_id === creationContext.parentBlockId &&
          (b.status === "active" || b.status === "locked")
      );

      // アクティブな兄弟がいなくなったら、サブブランチの表示を閉じる
      if (activeSiblings.length === 0) {
        handleCloseSubBranch();
      }
    }
  };

  const handleSwitchToSub = (blockId: string) => {
    const data = useChatStore.getState().chatData;
    const block = data?.blocks[blockId];
    if (block) {
      setBranchContext(data?.branches[block.branch_id] || null);
    }
    setCreationContext({ parentBlockId: blockId });
  };

  useEffect(() => {
    if (error === "NOT_FOUND") {
      notFound();
    }
  }, [error]);

  // ビューの判定
  const isMainView = !creationContext && (deepestBranch?.depth === 0);

  return (
    <div className="flex flex-col h-screen w-full bg-[#fafafa]">
      <Header title={chatData?.chat_title ?? ""} className="bg-[#fafafa]" />

      {isLoading && <TopLinearLoader />}

      <main className={`flex-1 bg-[#fafafa] ${isMainView ? "p-6 overflow-y-auto" : "overflow-hidden"}`}>
        <div className={`mx-auto h-full ${isMainView ? "max-w-4xl space-y-6 pb-10" : "max-w-none w-full"}`}>
          {error && error !== "NOT_FOUND" && <p className="text-sm text-destructive p-4">{error}</p>}

          {chatData && deepestBranch && (
            isMainView ? (
              <MainBranchView
                chatId={chatData.chat_id}
                branch={deepestBranch}
                reload={handleReload}
                initialMessage={initialMessage}
                onInitialMessageHandled={() => setInitialMessage(null)}
                onInitialSendError={handleInitialSendError}
                onSwitchToSubBranch={handleSwitchToSub}
                scrollRequest={scrollRequest || undefined}
              />
            ) : (
              <div className="h-full w-full">
                <SubBranchView
                  key={creationContext?.parentBlockId || `view-${deepestBranch.branch_id}`}
                  chatId={chatData.chat_id}
                  mainBranch={branchContext || deepestBranch}
                  initialActiveBranchId={!creationContext ? deepestBranch.branch_id : undefined}
                  initialCreationContext={creationContext}
                  reload={handleReload}
                  onCloseAll={handleCloseSubBranch}
                  onBranch={handleSwitchToSub}
                  scrollRequest={scrollRequest || undefined}
                />
              </div>
            )
          )}

          {chatData && !mainBranch && (
            <p className="text-sm text-muted-foreground">
              メインブランチが見つかりませんでした。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
