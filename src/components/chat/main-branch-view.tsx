"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatDetailResponse } from "@/store/chat-store";
import { ChatWindow } from "@/components/chat/chat-window";
import { getHistoryFromChatData, useChatStore } from "@/store/chat-store";
import { sendMessageWithStreaming, type StreamingBlock } from "@/lib/chat-send";
import { useModelStore } from "@/store/model-store";

type BranchItem = ChatDetailResponse["branches"][string];

type MainBranchViewProps = {
    chatId: string;
    branch: BranchItem;
    reload: () => Promise<void>;
    onSwitchToSubBranch: (blockId: string) => void;
    initialMessage?: string | null;
    onInitialMessageHandled?: () => void;
    onInitialSendError?: (error: unknown) => void;
    scrollRequest?: { blockId: string; t: number };
};

export function MainBranchView({
    chatId,
    branch,
    reload,
    onSwitchToSubBranch,
    initialMessage,
    onInitialMessageHandled,
    onInitialSendError,
    scrollRequest,
}: MainBranchViewProps) {
    const [streamingBlock, setStreamingBlock] = useState<StreamingBlock | null>(null);
    const [isInitialSending, setIsInitialSending] = useState(false);
    const autoSentRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const chatData = useChatStore((state) => state.chatData);
    const selectedModel = useModelStore((state) => state.selectedModel);

    const currentBranchBlocks = Object.values(chatData?.blocks ?? {})
        .filter((block) => block.branch_id === branch.branch_id)
        .sort(
            (first, second) =>
                new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
        );

    const handleSend = async (message: string) => {
        const history = currentBranchBlocks.flatMap((block) => [
            { role: "user" as const, content: block.user_content },
            { role: "assistant" as const, content: block.ai_content },
        ]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            await sendMessageWithStreaming({
                chatId,
                branchId: branch.branch_id,
                message,
                model: selectedModel,
                history,
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
        const targetIndex = currentBranchBlocks.findIndex((block) => block.block_id === blockId);
        if (targetIndex === -1) {
            throw new Error("編集対象のメッセージが見つかりませんでした。");
        }

        const previousBlock = targetIndex > 0 ? currentBranchBlocks[targetIndex - 1] : null;
        let history: { role: "user" | "assistant"; content: string }[] = [];

        if (chatData) {
            if (previousBlock) {
                history = getHistoryFromChatData(chatData, previousBlock.block_id);
            } else if (branch.parent_block_id) {
                history = getHistoryFromChatData(chatData, branch.parent_block_id);
            }
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
            branchId: branch.branch_id,
            message,
            model: selectedModel,
            history,
            reload,
            setStreamingBlock,
        });
    };

    const handleBranch = (blockId: string) => {
        onSwitchToSubBranch(blockId);
    };

    useEffect(() => {
        if (!initialMessage || autoSentRef.current) return;

        autoSentRef.current = true;
        onInitialMessageHandled?.();
        setIsInitialSending(true);

        void handleSend(initialMessage)
            .catch((error) => {
                onInitialSendError?.(error);
            })
            .finally(() => {
                setIsInitialSending(false);
            });
    }, [initialMessage]);

    return (
        <section className="space-y-4 relative group">
            {branch.depth > 0 && (
                <div className="flex justify-end pr-2">
                    <button
                        onClick={async () => {
                            if (!confirm("このヨリミチをやめますか？")) return;
                            try {
                                const response = await fetch("/api/internal/branch/trash", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ trash_branch_id: branch.branch_id })
                                });
                                if (!response.ok) throw new Error("Failed to delete branch");
                                useChatStore.getState().removeBranch(branch.branch_id);
                                await reload();
                            } catch (error) {
                                console.error(error);
                            }
                        }}
                        className="p-2 rounded-full hover:bg-destructive/10 text-destructive border shadow-sm transition-opacity opacity-0 group-hover:opacity-100"
                        title="ヨリミチをやめる"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            )}
            <ChatWindow
                branchId={branch.branch_id}
                streamingBlock={streamingBlock}
                onSend={handleSend}
                onEdit={handleEdit}
                onStop={handleStop}
                onBranch={handleBranch}
                disabled={isInitialSending}
                fixedInput
                fixedOffsetClassName="left-0 right-0 md:left-[72px]"
                disclaimerText="AI は間違えることがあります。重要な情報は確認してください。"
                scrollRequest={scrollRequest}
            />
        </section>
    );
}
