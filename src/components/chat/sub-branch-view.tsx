"use client";

import { ChatUIContainer } from "@/components/chat/chat-ui-container";
import { BranchTree } from "@/components/branch_view/parent_track";
import type { ChatDetailResponse } from "@/store/chat-store";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";

type BranchItem = ChatDetailResponse["branches"][string];

interface SubBranchViewProps {
    chatId: string;
    mainBranch: BranchItem;
    initialActiveBranchId?: string;
    initialCreationContext?: {
        parentBlockId: string;
    };
    reload: () => Promise<void>;
    onCloseAll: () => void;
    onBranch: (blockId: string) => void;
    scrollRequest?: { blockId: string; t: number };
}

export function SubBranchView({
    chatId,
    mainBranch,
    initialActiveBranchId,
    initialCreationContext,
    reload,
    onCloseAll,
    onBranch,
    scrollRequest
}: SubBranchViewProps) {
    const [panelState, setPanelState] = useState<"hidden-left" | "visible">("hidden-left");

    const chatData = useChatStore((state) => state.chatData);
    const isLoading = useChatStore((state) => state.isLoading);

    return (
        <div className="flex h-full w-full overflow-hidden">
            <div
                className={cn(
                    "hidden md:block h-full bg-background overflow-hidden transition-all duration-300 linear",
                    panelState === "visible"
                        ? "shrink-0 basis-[460px] min-w-[460px]"
                        : "shrink-0 basis-[60px] min-w-[60px]"
                )}
            >
                <BranchTree
                    chatId={chatId}
                    chatData={chatData}
                    isLoading={isLoading}
                    onPanelStateChange={setPanelState}

                />
            </div>

            <div className="flex-1 min-w-0 h-full">
                <ChatUIContainer
                    chatId={chatId}
                    mainBranchId={mainBranch.branch_id}
                    initialActiveBranchId={initialActiveBranchId}
                    initialCreationContext={initialCreationContext}
                    reload={reload}
                    onCloseAll={onCloseAll}
                    onBranch={onBranch}
                    chatData={chatData}
                    isLoading={isLoading}
                    scrollRequest={scrollRequest}
                />
            </div>
        </div>
    );
}
