"use client";

import { useState, Fragment, useEffect, useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useChatStore, getHistoryFromChatData } from "@/store/chat-store";
import { useModelStore } from "@/store/model-store";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatComposer } from "@/components/chat/chat-composer";
import { MessageBlock, type ConnectorConfig } from "@/components/chat/message-block";
import { toast } from "sonner";
import { sendMessageWithStreaming, type StreamingBlock } from "@/lib/chat-send";
import { DeleteBranchButton } from "@/components/chat/delete-branch-button";
import { AddBranchButton } from "@/components/chat/add-branch-button";
import { BranchTree } from "@/components/branch_view/parent_track";
import { type ChatDetailResponse } from "@/store/chat-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface ChatUIContainerProps {
  chatId: string;
  mainBranchId: string;
  initialActiveBranchId?: string;
  initialCreationContext?: { parentBlockId: string };
  reload: () => Promise<void>;
  onCloseAll: () => void;
  onBranch: (blockId: string) => void;
  chatData: ChatDetailResponse | null;
  isLoading: boolean;
  scrollRequest?: { blockId: string; t: number };
}

type PaneConfig = {
  id: string;
  branchId?: string;
  creationContext?: { parentBlockId: string };
  initialMessage?: string; // ブランチ作成直後に送信するメッセージ
};

interface CreationPaneProps {
  chatId: string;
  parentBlockId: string;
  reload: () => Promise<void>;
  onCreated: (newBranchId: string, message?: string) => void;
}

// --- Creation Pane Component ---
const CreationPane = ({ chatId, parentBlockId, reload, onCreated }: CreationPaneProps) => {
  const chatData = useChatStore((state) => state.chatData);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");

  const parentBlock = chatData?.blocks[parentBlockId];

  const handleCreate = async () => {
    if (!message.trim() || !chatData) return;
    setIsCreating(true);
    const branchId = crypto.randomUUID();

    try {
      const parentBlock = chatData.blocks[parentBlockId];
      if (!parentBlock) throw new Error("Block not found");

      const parentBranch = chatData.branches[parentBlock.branch_id];
      const branchDepth = (parentBranch?.depth ?? 0) + 1;

      const response = await fetch("/api/internal/branch/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          chat_id: chatId,
          parent_branch_id: parentBlock.branch_id,
          parent_block_id: parentBlock.block_id,
          depth: branchDepth,
          title: message.substring(0, 50)
        })
      });

      if (!response.ok) throw new Error("Failed to initialize branch");

      toast.success("ヨリミチしました");
      await reload();
      onCreated(branchId, message);
    } catch (error) {
      console.error(error);
      toast.error("ヨリミチに失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="relative flex flex-1 flex-col min-h-0 h-full overflow-hidden">
      {/* メッセージエリア: ChatWindow と同じ構造 */}
      <div className="min-w-0 w-full flex-1 overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div>
          {parentBlock && (
            <MessageBlock
              block={parentBlock}
              isCompact={typeof window !== 'undefined' && window.innerWidth < 768}
              connector={{
                style: "branched",
                type: "continue"
              }}
            />
          )}
        </div>
      </div>

      {/* 入力エリア: ChatWindow (fixedInput + flexLayout) と同じ構造 */}
      <div className="pointer-events-none z-20 bg-[#fafafa] pb-[env(safe-area-inset-bottom)] relative">
        <div className="absolute -top-7 left-0 right-0 z-0 h-8 bg-gradient-to-b from-transparent to-[#fafafa]" />
        <div className="relative z-10 mx-auto w-full max-w-4xl px-6 pt-0 pb-6">
          <div className="pointer-events-auto mx-auto w-full max-w-3xl">
            <ChatComposer
              value={message}
              onChange={setMessage}
              onSubmit={handleCreate}
              isSending={isCreating}
              placeholder="会話してみましょう"
              alwaysBorder={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Helper Components ---

interface ChatPaneHelperProps {
  pane: PaneConfig;
  onRemove: (id: string) => void;
  chatId: string;
  reload: () => Promise<void>;
  onPaneConfigUpdate: (id: string, config: Partial<PaneConfig>) => void;
  onBranch: (blockId: string) => void;
  onCreated: (newBranchId: string, message?: string) => void;
  mainBranchId: string;
  className?: string;
  scrollRequest?: { blockId: string; t: number };
}

const ChatPaneHelper = ({ pane, onRemove, chatId, reload, onPaneConfigUpdate, onBranch, onCreated, mainBranchId, className, scrollRequest }: ChatPaneHelperProps) => {
  const [streamingBlock, setStreamingBlock] = useState<StreamingBlock | null>(null);
  const chatData = useChatStore((state) => state.chatData);
  const removeBranch = useChatStore((state) => state.removeBranch);
  const mergeBranch = useChatStore((state) => state.mergeBranch);

  const selectedModel = useModelStore((state) => state.selectedModel);
  const autoSentRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSend = async (message: string) => {
    if (!pane.branchId || !chatData) return;

    const blocks = chatData.blocks;
    const branchBlocks = Object.values(blocks)
      .filter(b => b.branch_id === pane.branchId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const lastBlock = branchBlocks[branchBlocks.length - 1];
    let history: { role: "user" | "assistant"; content: string }[] = [];

    if (lastBlock) {
      history = getHistoryFromChatData(chatData, lastBlock.block_id);
    } else {
      const branch = chatData.branches[pane.branchId];
      if (branch?.parent_block_id) {
        history = getHistoryFromChatData(chatData, branch.parent_block_id);
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await sendMessageWithStreaming({
        chatId,
        branchId: pane.branchId,
        message,
        model: selectedModel,
        history: history as any,
        reload,
        setStreamingBlock,
        signal: controller.signal,
      });
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const handleEdit = async ({ blockId, message }: { blockId: string; message: string }) => {
    if (!pane.branchId || !chatData) return;

    const branchBlocks = Object.values(chatData.blocks)
      .filter((block) => block.branch_id === pane.branchId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const targetIndex = branchBlocks.findIndex((block) => block.block_id === blockId);
    if (targetIndex === -1) {
      throw new Error("編集対象のメッセージが見つかりませんでした。");
    }

    const previousBlock = targetIndex > 0 ? branchBlocks[targetIndex - 1] : null;
    const branch = chatData.branches[pane.branchId];

    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (previousBlock) {
      history = getHistoryFromChatData(chatData, previousBlock.block_id);
    } else if (branch?.parent_block_id) {
      history = getHistoryFromChatData(chatData, branch.parent_block_id);
    }

    const revertRes = await fetch("/api/internal/message/revert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_id: blockId }),
    });

    if (!revertRes.ok) {
      const payload = await revertRes.json().catch(() => ({}));
      throw new Error(payload.error || "メッセージの更新に失敗しました。");
    }

    await reload();

    await sendMessageWithStreaming({
      chatId,
      branchId: pane.branchId,
      message,
      model: selectedModel,
      history: history as any,
      reload,
      setStreamingBlock,
    });
  };

  useEffect(() => {
    if (pane.initialMessage && !autoSentRef.current && pane.branchId) {
      autoSentRef.current = true;
      void handleSend(pane.initialMessage);
    }
  }, [pane.initialMessage, pane.branchId]);

  const handleMerge = async (blockId: string) => {
    if (!pane.branchId) return;

    try {
      const response = await fetch("/api/internal/branch/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: pane.branchId,
          copied_block_id: blockId
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to merge branch");
      }

      toast.success("ヨリミチを終了しました");
      mergeBranch(pane.branchId);
      // Reload BEFORE removing the pane so the store has fresh data
      // (including copied blocks) before the view transitions
      await reload();
      onRemove(pane.id);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "ヨリミチを終了できませんでした";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!pane.branchId) {
      onRemove(pane.id);
      return;
    }

    try {
      const response = await fetch("/api/internal/branch/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trash_branch_id: pane.branchId })
      });

      if (!response.ok) {
        throw new Error("Failed to delete branch");
      }

      toast.success("ヨリミチをやめました");
      removeBranch(pane.branchId);
      onRemove(pane.id);
      void reload();
    } catch (error) {
      console.error(error);
      toast.error("ヨリミチをやめることに失敗しました");
    }
  };

  return (
    <div className={cn("h-full w-full bg-[#fafafa] relative group flex flex-col", className)}>
      {/* Header Area using common DeleteBranchButton logic but customized for close behavior */}
      {(pane.branchId || pane.creationContext) && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 rounded-full hover:bg-destructive/10 backdrop-blur-sm border shadow-sm transition-colors z-20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              title="Delete window"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="min-w-0 w-[400px] sm:max-w-[400px]">
            <AlertDialogHeader>
              <AlertDialogTitle>ヨリミチをやめますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {pane.branchId ? "" : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="!flex-row justify-end gap-2">
              <AlertDialogCancel className="mt-0">いいえ</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                variant="destructive"
              >
                はい
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Chat Content */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {pane.branchId ? (
          <div className="h-full flex flex-col min-h-0">
            <ChatWindow
              branchId={pane.branchId}
              fixedInput
              fixedOffsetClassName="relative left-auto right-auto top-auto bottom-auto"
              streamingBlock={streamingBlock}
              onSend={handleSend}
              onEdit={handleEdit}
              onStop={handleStop}
              onBranch={onBranch}
              onMerge={handleMerge}
              flexLayout={true}
              inputAlwaysBorder={false}
              scrollRequest={scrollRequest}
            />
          </div>
        ) : pane.creationContext ? (
          <CreationPane
            chatId={chatId}
            parentBlockId={pane.creationContext.parentBlockId}
            reload={reload}
            onCreated={onCreated}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a branch
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Container (統合版) ---
export function ChatUIContainer({ chatId, mainBranchId, initialActiveBranchId, initialCreationContext, reload, onCloseAll, onBranch, chatData, isLoading, scrollRequest }: ChatUIContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstChatRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // isMobile フック
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mql.matches);
    setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // モバイルでのスクロール位置調整
  useEffect(() => {
    if (isMobile && firstChatRef.current && chatData) {
      // 初期マウント時に最初のチャットが見えるようにスクロール
      firstChatRef.current.scrollIntoView({ behavior: 'auto', inline: 'center' });
      setIsReady(true);
    } else if (!isMobile) {
      setIsReady(true);
    }
  }, [chatData, isMobile]);

  const [activePanes, setActivePanes] = useState<PaneConfig[]>(() => {
    const panes: PaneConfig[] = [];

    if (initialCreationContext && chatData) {
      const parentBlockId = initialCreationContext.parentBlockId;
      const siblings = Object.values(chatData.branches)
        .filter(b => b.parent_block_id === parentBlockId && (b.status === "active" || b.status === "locked"))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 2);

      siblings.reverse().forEach(s => {
        panes.push({ id: `pane-${s.branch_id}`, branchId: s.branch_id });
      });

      panes.push({ id: "pane-create-initial", creationContext: initialCreationContext });
    } else {
      if (initialActiveBranchId && chatData) {
        const currentBranch = chatData.branches[initialActiveBranchId];
        if (currentBranch?.parent_block_id) {
          const siblings = Object.values(chatData.branches)
            .filter(b => b.parent_block_id === currentBranch.parent_block_id && (b.status === "active" || b.status === "locked"))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 3);

          siblings.reverse().forEach(s => {
            panes.push({ id: `pane-${s.branch_id}`, branchId: s.branch_id });
          });
        } else {
          panes.push({ id: "pane-initial", branchId: initialActiveBranchId });
        }
      } else if (initialActiveBranchId) {
        panes.push({ id: "pane-initial", branchId: initialActiveBranchId });
      }

      if (initialCreationContext) {
        panes.push({ id: "pane-create-1", creationContext: initialCreationContext });
      }
    }

    return panes;
  });

  const addPane = () => {
    if (activePanes.length >= 3) return;
    const existingCreation = activePanes.find(p => p.creationContext);
    let context = existingCreation?.creationContext || initialCreationContext;

    if (!context && activePanes.length > 0 && chatData) {
      const lastPane = activePanes[activePanes.length - 1];
      if (lastPane.branchId) {
        const branch = chatData.branches[lastPane.branchId];
        if (branch?.parent_block_id) {
          context = { parentBlockId: branch.parent_block_id };
        }
      }
    }

    if (context) {
      const newId = `pane-add-${Date.now()}`;
      setActivePanes([...activePanes, { id: newId, creationContext: context }]);

      // モバイルの場合、新しいパネル（作成画面）へ自動スクロール
      if (isMobile) {
        setTimeout(() => {
          const newPane = containerRef.current?.querySelector(`[data-pane-id="${newId}"]`);
          if (newPane) {
            newPane.scrollIntoView({ behavior: 'smooth', inline: 'center' });
          }
        }, 100);
      }
    }
  };

  const removePane = (paneId: string) => {
    if (activePanes.length <= 1) {
      onCloseAll();
    }
    setActivePanes(prev => prev.filter(p => p.id !== paneId));
  };

  const handleBranch = (blockId: string) => {
    onBranch(blockId);
  };

  const updatePaneConfig = (id: string, newConfig: Partial<PaneConfig>) => {
    setActivePanes(prev => prev.map(p => p.id === id ? { ...p, ...newConfig } : p));
  };

  const handleCreated = (paneId: string, newBranchId: string, message?: string) => {
    const nextId = `pane-${newBranchId}`;
    // 状態を更新
    updatePaneConfig(paneId, {
      id: nextId,
      branchId: newBranchId,
      creationContext: undefined,
      initialMessage: message
    });

    // モバイルの場合、作成された新しいブランチ画面へ自動スクロール
    if (isMobile) {
      setTimeout(() => {
        const newPane = containerRef.current?.querySelector(`[data-pane-id="${nextId}"]`);
        if (newPane) {
          newPane.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        }
      }, 300);
    }
  };

  return (
    <div className="flex flex-1 h-full w-full overflow-hidden bg-transparent">
      {isMobile ? (
        /* 1. Mobile Layout: BranchTreeスライド + チャットスライド */
        <div
          ref={containerRef}
          className={cn(
            "flex w-full h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory gap-2 p-2 scroll-smooth",
            !isReady ? "opacity-0" : "opacity-100" // invisibleは削除して確実にマウントさせる
          )}
        >
          {/* 先頭にツリー表示を表示 */}
          <div className="min-w-full max-w-full snap-center h-full flex-shrink-0">
            <BranchTree chatId={chatId} chatData={chatData} isLoading={isLoading} />
          </div>

          {activePanes.map((pane, index) => (
            <div
              key={pane.id}
              ref={index === 0 ? firstChatRef : null}
              data-pane-id={pane.id} // 自動スクロール用にIDを付与
              className="min-w-full max-w-full snap-center h-full flex-shrink-0"
            >
              <ChatPaneHelper
                pane={pane}
                onRemove={removePane}
                chatId={chatId}
                reload={reload}
                onPaneConfigUpdate={updatePaneConfig}
                onBranch={handleBranch}
                mainBranchId={mainBranchId}
                onCreated={(newBranchId, message) => handleCreated(pane.id, newBranchId, message)}
                scrollRequest={scrollRequest}
              />
            </div>
          ))}
          {activePanes.length < 3 && (
            <div className="flex flex-col h-full pb-2 snap-center flex-shrink-0">
              <AddBranchButton
                onClick={addPane}
                isFullWidth={false}
                className="w-10 h-full shrink-0 rounded-4xl"
              />
            </div>
          )}
        </div>
      ) : (
        /* 2. Desktop Layout: Resizableパネル */
        <>
          <ResizablePanelGroup orientation="horizontal" className="flex flex-1">
            {activePanes.map((pane, index) => (
              <Fragment key={pane.id}>
                <ResizablePanel defaultSize={100 / activePanes.length} minSize={25}>
                  <ChatPaneHelper
                    pane={pane}
                    onRemove={removePane}
                    chatId={chatId}
                    reload={reload}
                    onPaneConfigUpdate={updatePaneConfig}
                    onBranch={handleBranch}
                    mainBranchId={mainBranchId}
                    onCreated={(newBranchId, message) => handleCreated(pane.id, newBranchId, message)}
                    scrollRequest={scrollRequest}
                  />
                </ResizablePanel>
                {index < activePanes.length - 1 && <ResizableHandle className="bg-transparent w-2 after:w-px! after:bg-border/50!" />}
              </Fragment>
            ))}
          </ResizablePanelGroup>
          {/* 3. Desktop Add Button Area */}
          {activePanes.length < 3 && (
            <div className="flex pr-2 pb-2">
              {activePanes.length > 0 && <div className="w-2 bg-transparent shrink-0" />}
              <AddBranchButton
                onClick={addPane}
                isFullWidth={activePanes.length === 0}
                className={activePanes.length === 0 ? "" : "w-10 shrink-0"}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
