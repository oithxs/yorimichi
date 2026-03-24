"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { BlockList } from "@/components/chat/block-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat-store";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StreamingBlock = {
    block_id: string;
    user_content: string;
    ai_content: string;
    created_at: string;
};

type ChatWindowProps = {
    branchId: string;
    streamingBlock?: StreamingBlock | null;
    onBranch?: (blockId: string) => void;
    onMerge?: (blockId: string) => void;
    onEdit?: (params: { blockId: string; message: string }) => Promise<void>;
    onSend: (message: string) => Promise<void>;
    onStop?: () => void;
    inputPlaceholder?: string;
    inputAlwaysBorder?: boolean;
    disabled?: boolean;
    disclaimerText?: string;
    fixedInput?: boolean;
    fixedOffsetClassName?: string;
    showComposer?: boolean;
    flexLayout?: boolean;
    scrollRequest?: { blockId: string; t: number };
    className?: string;
};

export function ChatWindow({
    branchId,
    streamingBlock,
    onBranch,
    onMerge,
    onEdit,
    onSend,
    onStop,
    inputPlaceholder = "会話してみましょう",
    inputAlwaysBorder = true,
    disabled = false,
    disclaimerText,
    fixedInput = false,
    fixedOffsetClassName = "left-0 right-0 md:left-[72px]",
    showComposer = true,
    flexLayout = false,
    scrollRequest,
    className,
}: ChatWindowProps) {
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isStreamingAutoFollow, setIsStreamingAutoFollow] = useState(false);
    const [errorOpen, setErrorOpen] = useState(false);
    const [errorCode, setErrorCode] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const blockListRef = useRef<HTMLDivElement | null>(null);
    const latestBottomRef = useRef<HTMLDivElement | null>(null);
    const initialFocusedBranchRef = useRef<string | null>(null);
    const lastFocusedBlockCountRef = useRef<number>(0);
    const focusOnNextSentBlockRef = useRef(false);
    const streamingSessionBlockIdRef = useRef<string | null>(null);
    const isAutoFollowUnlockedRef = useRef(false);
    const [lastScrollTimestamp, setLastScrollTimestamp] = useState<number>(0);
    const blocks = useChatStore((state) => state.chatData?.blocks ?? {});

    useEffect(() => {
        setLastScrollTimestamp(0);
    }, [branchId]);

    const branchBlockCount = useMemo(
        () => Object.values(blocks).filter((block) => block.branch_id === branchId).length,
        [blocks, branchId]
    );

    useEffect(() => {
        const isSameBranch = initialFocusedBranchRef.current === branchId;
        const blockCountIncreased = branchBlockCount > lastFocusedBlockCountRef.current;

        // Skip if same branch and block count hasn't increased
        // (Re-scroll when block count increases, e.g. after merge copies blocks)
        if (isSameBranch && !blockCountIncreased) return;

        // Skip if targeting a block that hasn't been scrolled to yet
        if (scrollRequest && scrollRequest.t > lastScrollTimestamp) {
            initialFocusedBranchRef.current = branchId;
            lastFocusedBlockCountRef.current = branchBlockCount;
            return;
        }

        const container = blockListRef.current;
        if (!container) return;

        if (branchBlockCount === 0) return;

        const blockElements = container.querySelectorAll<HTMLElement>("[data-message-block='true']");
        const latestBlock = blockElements[blockElements.length - 1];
        if (!latestBlock) return;

        latestBlock.scrollIntoView({ behavior: "auto", block: "start" });
        initialFocusedBranchRef.current = branchId;
        lastFocusedBlockCountRef.current = branchBlockCount;
    }, [branchId, branchBlockCount, scrollRequest, lastScrollTimestamp]);

    useEffect(() => {
        if (!scrollRequest || scrollRequest.t <= lastScrollTimestamp) return;

        const container = blockListRef.current;
        if (!container) return;

        const targetBlock = container.querySelector<HTMLElement>(`[data-block-id="${scrollRequest.blockId}"]`);
        if (targetBlock) {
            requestAnimationFrame(() => {
                targetBlock.scrollIntoView({ behavior: "auto", block: "start" });
                setLastScrollTimestamp(scrollRequest.t);
            });
        }
    }, [scrollRequest, branchBlockCount, lastScrollTimestamp]);

    useEffect(() => {
        if (!streamingBlock) {
            streamingSessionBlockIdRef.current = null;
            isAutoFollowUnlockedRef.current = false;
            setIsStreamingAutoFollow(false);
            return;
        }

        if (streamingSessionBlockIdRef.current !== streamingBlock.block_id) {
            streamingSessionBlockIdRef.current = streamingBlock.block_id;
            isAutoFollowUnlockedRef.current = false;
            setIsStreamingAutoFollow(false);
            return;
        }

        if (!isAutoFollowUnlockedRef.current && streamingBlock.ai_content.trim().length > 0) {
            setIsStreamingAutoFollow(true);
        }
    }, [streamingBlock?.block_id, streamingBlock?.ai_content, streamingBlock]);

    useEffect(() => {
        if (!focusOnNextSentBlockRef.current) return;

        const container = blockListRef.current;
        if (!container) return;

        const blockElements = container.querySelectorAll<HTMLElement>("[data-message-block='true']");
        const latestBlock = blockElements[blockElements.length - 1];
        if (!latestBlock) return;

        latestBlock.scrollIntoView({ behavior: "auto", block: "start" });
        focusOnNextSentBlockRef.current = false;
    }, [branchBlockCount, streamingBlock?.block_id]);

    useEffect(() => {
        if (!streamingBlock || !isStreamingAutoFollow) return;

        latestBottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }, [streamingBlock?.block_id, streamingBlock?.ai_content, isStreamingAutoFollow]);

    useEffect(() => {
        if (!streamingBlock || !isStreamingAutoFollow) return;

        const stopAutoFollow = () => {
            isAutoFollowUnlockedRef.current = true;
            setIsStreamingAutoFollow(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            const unlockKeys = new Set([
                "ArrowUp",
                "ArrowDown",
                "PageUp",
                "PageDown",
                "Home",
                "End",
                " ",
            ]);
            if (unlockKeys.has(event.key)) {
                stopAutoFollow();
            }
        };

        window.addEventListener("wheel", stopAutoFollow, { passive: true });
        window.addEventListener("touchmove", stopAutoFollow, { passive: true });
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("wheel", stopAutoFollow);
            window.removeEventListener("touchmove", stopAutoFollow);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [streamingBlock, isStreamingAutoFollow]);

    const send = async () => {
        const message = input.trim();
        if (!message || isSending || disabled) return;

        focusOnNextSentBlockRef.current = true;
        setIsSending(true);
        setInput("");
        try {
            await onSend(message);
        } catch (error) {
            console.error(error);
            const fallbackMessage = "送信中にエラーが発生しました。";

            let parsedCode: number | null = null;
            let parsedMessage = fallbackMessage;

            if (error instanceof Error && error.message) {
                const match = error.message.match(/^\[(\d+)\]\s*(.*)$/);
                if (match) {
                    parsedCode = Number(match[1]);
                    parsedMessage = match[2] || fallbackMessage;
                } else {
                    parsedMessage = error.message;
                }
            }

            setInput(message);
            setErrorCode(parsedCode);
            setErrorMessage(parsedMessage);
            setErrorOpen(true);
        } finally {
            setIsSending(false);
        }
    };

    const retryMessage = "しばらく時間をおいて再度お試しください。";
    const shouldShowRetryMessage = !errorMessage.includes(retryMessage);
    const showRefocusButton = !!streamingBlock && !isStreamingAutoFollow;

    const refocusStreamingResponse = () => {
        if (!streamingBlock) return;
        isAutoFollowUnlockedRef.current = false;
        setIsStreamingAutoFollow(true);
        latestBottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    };

    return (
        <>
            <AlertDialog open={errorOpen} onOpenChange={setErrorOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            エラーが発生しました{errorCode ? ` (${errorCode})` : ""}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {errorMessage}
                            {shouldShowRetryMessage && (
                                <>
                                    <br />
                                    {retryMessage}
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction>閉じる</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <section className={cn(
                "relative",
                flexLayout ? "flex flex-1 flex-col min-h-0 h-full overflow-hidden" : "space-y-4",
                (fixedInput && showComposer && !flexLayout) ? "pb-64" : "",
                className
            )}>
                <div
                    ref={blockListRef}
                    className={cn(
                        "min-w-0 w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                        flexLayout ? "flex-1 overflow-y-auto p-4" : ""
                    )}
                >
                    <BlockList
                        branchId={branchId}
                        streamingBlock={streamingBlock}
                        onBranch={onBranch}
                        onMerge={onMerge}
                        onEdit={onEdit}
                    />
                    <div
                        ref={latestBottomRef}
                        aria-hidden="true"
                        className={fixedInput ? "scroll-mb-80" : "scroll-mb-6"}
                    />
                </div>

                {showComposer && (
                    fixedInput ? (
                        <div className={cn(
                            "pointer-events-none z-20 bg-[#fafafa] pb-[env(safe-area-inset-bottom)]",
                            flexLayout ? "absolute bottom-0 left-0 right-0" : "fixed bottom-0",
                            fixedOffsetClassName
                        )}>
                            <div className="absolute -top-7 left-0 right-0 z-0 h-8 bg-gradient-to-b from-transparent to-[#fafafa]" />
                            <div className="relative z-10 mx-auto w-full max-w-4xl px-6 pt-0 pb-6">
                                {showRefocusButton && (
                                    <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2">
                                        <Button
                                            type="button"
                                            size="icon"
                                            onClick={refocusStreamingResponse}
                                            className={cn(
                                                "pointer-events-auto h-11 w-11 rounded-full",
                                                // 背景：極薄の白（または黒）で、透明度を高く設定
                                                "bg-gray-400/30 dark:bg-slate-800/40",
                                                // ガラス効果：背後をぼかす（これがLiquid Glassの肝）
                                                "backdrop-blur-md",
                                                // 境界線：光が当たっているような細く明るい線
                                                "border border-white/40 dark:border-slate-700/50",
                                                // テキスト色
                                                "text-slate-700 dark:text-slate-200",
                                                // 影：ぼんやりと広がる柔らかい影
                                                "shadow-lg",
                                                // アニメーション：ホバーで下に沈む
                                                "transition-all duration-300 hover:translate-y-0.5 hover:bg-gray-400/80 dark:hover:bg-slate-800/60"
                                            )}
                                            aria-label="最新のAI応答に戻る"
                                        >
                                            <ArrowDown className="h-5 w-5 text-gray-400" />
                                        </Button>
                                    </div>
                                )}
                                <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                                    <ChatComposer
                                        value={input}
                                        onChange={setInput}
                                        onSubmit={send}
                                        onStop={onStop}
                                        placeholder={inputPlaceholder}
                                        disabled={disabled}
                                        isSending={isSending || !!streamingBlock}
                                        alwaysBorder={inputAlwaysBorder}
                                    />
                                </div>
                                {disclaimerText && (
                                    <p className="mt-3 text-center text-xs text-muted-foreground">{disclaimerText}</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {showRefocusButton && (
                                <div className="pointer-events-none absolute bottom-30 left-1/2 z-10 -translate-x-1/2">
                                    <Button
                                        type="button"
                                        size="icon"
                                        onClick={refocusStreamingResponse}
                                        className="pointer-events-auto h-10 w-10 rounded-full bg-gray-300 text-foreground shadow-md border border-border hover:bg-muted"
                                        aria-label="最新のAI応答に戻る"
                                    >
                                        <ArrowDown className="h-5 w-5" />
                                    </Button>
                                </div>
                            )}
                            <div className="mx-auto w-full max-w-3xl">
                                <ChatComposer
                                    value={input}
                                    onChange={setInput}
                                    onSubmit={send}
                                    onStop={onStop}
                                    placeholder={inputPlaceholder}
                                    disabled={disabled}
                                    isSending={isSending || !!streamingBlock}
                                    alwaysBorder={inputAlwaysBorder}
                                />
                            </div>

                            {disclaimerText && (
                                <p className="text-center text-xs text-muted-foreground">{disclaimerText}</p>
                            )}
                        </>
                    )
                )}
            </section>
        </>
    );
}
