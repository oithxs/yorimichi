"use client";


import { lazy, memo, Suspense, useCallback, useState, useEffect, useRef } from "react";
import { Bot, Copy, MessageCircleQuestionMark, Check, ChevronDown, ChevronUp, Pencil, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const CodeHighlighter = lazy(() => import("./code-highlighter"));

export type ConnectorConfig = {
    style: "straight" | "branched";
    type: "continue" | "split";
    options?: {
        showReturn?: boolean;
        showBranch?: boolean;
    };
};

type BlockViewModel = {
    block_id: string;
    user_content: string;
    ai_content: string;
    is_stopped?: boolean;
    created_at: string;
};

interface MessageBlockProps {
    block: BlockViewModel;
    connector: ConnectorConfig;
    onBranch?: (blockId: string) => void;
    onMerge?: (blockId: string) => void;
    onEdit?: (params: { blockId: string; message: string }) => Promise<void>;
    isStreaming?: boolean;
    isCompact?: boolean;
    isLast?: boolean;
}

interface AiMarkdownContentProps {
    aiContent: string;
    showThinking: boolean;
    copiedTarget: string | null;
    onCopy: (text: string, target: string) => Promise<void>;
}

interface CopyButtonProps {
    isCopied: boolean;
    onCopy: () => void;
    className?: string;
    iconClassName?: string;
    ariaLabel?: string;
    size?: any;
}

const CopyButton = memo(function CopyButton({
    isCopied,
    onCopy,
    className = "",
    iconClassName = "h-4 w-4",
    ariaLabel = "Copy text",
    size = "icon",
}: CopyButtonProps) {
    return (
        <Button
            variant="ghost"
            size={size}
            type="button"
            aria-label={ariaLabel}
            className={`flex items-center justify-center rounded-full p-0 transition-colors ${isCopied
                ? "bg-transparent hover:bg-transparent" // チェック時はホバーで暗くならない
                : "text-muted-foreground hover:bg-muted hover:text-foreground" // コピーアイコン時はホバーで暗くなる
                } ${className}`}
            onClick={onCopy}
        >
            {isCopied ? (
                <Check className={`${iconClassName} text-green-500`} />
            ) : (
                <Copy className={iconClassName} />
            )}
        </Button>
    );
});

const AiMarkdownContent = memo(function AiMarkdownContent({
    aiContent,
    showThinking,
    copiedTarget,
    onCopy,
}: AiMarkdownContentProps) {
    return (
        <div className="mb-2 w-full min-w-0 rounded-2xl rounded-tl-sm bg-white px-1 py-2 text-foreground/90">
            <div className={`prose prose-sm max-w-none break-words md:prose-base 
                            prose-code:before:content-none prose-code:after:content-none 
                            ${showThinking ? "text-muted-foreground" : "text-foreground"}`}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        pre({ children }) {
                            return <>{children}</>;
                        },
                        code({ className, children, node, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const codeText = String(children).replace(/\n$/, "");
                            const isInline = !match;

                            const language = (match?.[1] ?? "text").toLowerCase();
                            const targetId = `code-${language}-${node?.position?.start?.offset ?? codeText.length}`;

                            if (isInline) {
                                return (
                                    <code
                                        className="mx-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-sm font-medium"
                                        {...props}
                                    >
                                        {codeText}
                                    </code>
                                );
                            }

                            return (
                                <div className="my-4 flex w-full flex-col overflow-hidden rounded-xl border border-gray-700 bg-[#282C34]">
                                    <div className="flex items-center justify-between border-b border-gray-700 bg-[#21252B] px-4 py-2">
                                        <span className="font-mono text-xs lowercase text-gray-300">
                                            {language}
                                        </span>
                                        <CopyButton
                                            isCopied={copiedTarget === targetId}
                                            onCopy={() => void onCopy(codeText, targetId)}
                                            size="icon"
                                            ariaLabel="Copy code"
                                            className="h-9 w-9"
                                            iconClassName="h-3.5 w-3.5"
                                        />
                                    </div>

                                    <div className="w-full overflow-x-auto text-sm">
                                        <Suspense
                                            fallback={
                                                <pre className="m-0 overflow-x-auto rounded-lg p-4 font-mono text-[0.95rem] leading-[1.6] text-gray-200">
                                                    <code>{codeText}</code>
                                                </pre>
                                            }
                                        >
                                            <CodeHighlighter language={language} codeText={codeText} />
                                        </Suspense>
                                    </div>
                                </div>
                            );
                        },
                    }}
                >
                    {aiContent}
                </ReactMarkdown>
            </div>
        </div>
    );
});

interface UserMessageDisplayProps {
    userContent: string;
    isLongMessage: boolean;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    copiedTarget: string | null;
    onCopyUser: () => void;
    isStreaming: boolean;
    isLast: boolean;
    isSubmittingEdit: boolean;
    onStartEdit: () => void;
}

const UserMessageDisplay = memo(function UserMessageDisplay({
    userContent,
    isLongMessage,
    isExpanded,
    onToggleExpanded,
    copiedTarget,
    onCopyUser,
    isStreaming,
    isLast,
    isSubmittingEdit,
    onStartEdit,
}: UserMessageDisplayProps) {
    return (
        <div className="group flex items-start justify-end gap-3">
            <div className="flex translate-x-1 items-center gap-0.5 opacity-100 transition-opacity">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex">
                                <CopyButton
                                    isCopied={copiedTarget === "user"}
                                    onCopy={onCopyUser}
                                    size="icon-lg"
                                    ariaLabel="Copy user message"
                                    className="h-10 w-10"
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-transparent">
                            <p>コピーする</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                {!isStreaming && isLast && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-lg"
                                    onClick={onStartEdit}
                                    disabled={isSubmittingEdit}
                                    aria-label="Edit message"
                                    className="h-10 w-10 rounded-full p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-transparent">
                                <p>編集する</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            <div className={`w-fit overflow-hidden rounded-4xl rounded-tr-sm bg-[#E6F0FF] pl-6 ${isLongMessage ? "pr-3" : "pr-6"} py-4 text-foreground/90 transition-all duration-200`}>
                <div className="flex items-start gap-2">
                    <p className={`whitespace-pre-wrap break-all text-sm leading-relaxed md:text-base ${!isExpanded && isLongMessage ? "line-clamp-2" : ""}`}>
                        {userContent}
                    </p>
                    {isLongMessage && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleExpanded}
                            className="-mt-1 h-10 w-10 shrink-0 rounded-full text-slate-500 hover:text-slate-900 toggle-ripple"
                            data-expanded={isExpanded}
                            aria-label={isExpanded ? "折りたたむ" : "もっと見る"}
                        >
                            {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : (
                                <ChevronDown className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
});

interface UserMessageEditorProps {
    editText: string;
    isSubmittingEdit: boolean;
    isSubmitDisabled: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    textareaRef: { current: HTMLTextAreaElement | null };
}

const UserMessageEditor = memo(function UserMessageEditor({
    editText,
    isSubmittingEdit,
    isSubmitDisabled,
    onChange,
    onSubmit,
    onCancel,
    textareaRef,
}: UserMessageEditorProps) {
    return (
        <div className="flex w-full justify-end">
            <div className="w-full max-w-[calc(100%-80px)] rounded-[24px] rounded-tr-sm bg-[#E6F0FF] px-4 py-4 text-foreground/90">
                <div className="flex flex-col gap-3">
                    <textarea
                        ref={textareaRef}
                        value={editText}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={isSubmittingEdit}
                        className="w-full resize-none overflow-hidden rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-base"
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                onCancel();
                            }
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (!isSubmitDisabled) {
                                    onSubmit();
                                }
                            }
                        }}
                    />
                    <div className="flex justify-end gap-6">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            disabled={isSubmittingEdit}
                            aria-label="Cancel edit"
                            className="h-9 rounded-full bg-transparent px-4 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        >
                            キャンセル
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onSubmit}
                            disabled={isSubmitDisabled}
                            aria-label="Submit edit"
                            className={cn(
                                "h-9 rounded-full px-6 text-sm font-medium disabled:opacity-100",
                                isSubmitDisabled
                                    ? "bg-gray-300 text-gray-400 cursor-not-allowed"
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                            )}
                        >
                            更新
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export function MessageBlock({ block, connector, onBranch, onMerge, onEdit, isStreaming = false, isCompact = false, isLast = false }: MessageBlockProps) {
    const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
    const [hoveredConnectorAction, setHoveredConnectorAction] = useState<"return" | "branch" | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const isLongMessage = block.user_content.split("\n").length > 2;
    const { style, type, options } = connector;
    const isSplit = type === "split";
    const isBranched = style === "branched";

    const INTER_HEIGHT = 80;
    const INTER_DOT_Y = 45;
    const LAST_HEIGHT = 140;
    const SPLIT_START_Y = 20;
    const MAIN_NODE_Y = 110;

    const BTN_CY = 60;
    const LEFT_BTN_CX = 40;
    const RIGHT_BTN_CX = 160;

    const LINE_COLOR = "text-gray-300";
    const LINE_WIDTH = "2";

    const hasAiContent = block.ai_content.trim().length > 0;
    const showThinking = isStreaming && !hasAiContent;
    const aiContent = showThinking ? "Thinking..." : block.ai_content;

    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(block.user_content);
    const [originalText, setOriginalText] = useState(block.user_content);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const isSubmitDisabled =
        isSubmittingEdit || editText.trim().length === 0 || editText.trim() === originalText.trim();

    useEffect(() => {
        setEditText(block.user_content);
        setOriginalText(block.user_content);
    }, [block.user_content]);

    useEffect(() => {
        if (!isEditing || !editTextareaRef.current) return;
        editTextareaRef.current.style.height = "0px";
        editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
    }, [editText, isEditing]);

    const handleSubmit = async () => {
        const nextText = editText.trim();
        if (!nextText || !onEdit) {
            setIsEditing(false);
            return;
        }

        if (nextText === originalText.trim()) {
            setIsEditing(false);
            return;
        }

        setIsSubmittingEdit(true);
        try {
            await onEdit({ blockId: block.block_id, message: nextText });
            setIsEditing(false);
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : "メッセージの再生成に失敗しました。";
            toast.error(message);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const handleCancelEdit = () => {
        setEditText(originalText);
        setIsEditing(false);
    };

    const handleRegenerate = async () => {
        const message = block.user_content.trim();
        if (!message || !onEdit) return;

        setIsSubmittingEdit(true);
        try {
            await onEdit({ blockId: block.block_id, message });
        } catch (error) {
            const messageText =
                error instanceof Error && error.message
                    ? error.message
                    : "再生成に失敗しました。";
            toast.error(messageText);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const copyToClipboard = useCallback(async (text: string, target: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedTarget(target);
            toast.success("クリップボードにコピーしました");
            setTimeout(() => {
                setCopiedTarget((current) => (current === target ? null : current));
            }, 500);
        } catch (error) {
            console.error("Failed to copy text:", error);
            toast.error("コピーに失敗しました");
        }
    }, []);

    const BranchNode = ({ cy, className }: { cy: number; className?: string }) => {
        const spikes = 10;
        const outerRadius = 12;
        const innerRadius = 7;

        let points = "";
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (Math.PI / spikes) * i - Math.PI / 2;
            const x = 100 + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            points += `${x},${y} `;
        }

        return (
            <g>
                <circle cx="100" cy={cy} r={outerRadius} fill="#fafafa" />
                <polygon points={points} fill="currentColor" className={className || LINE_COLOR} />
                <circle cx="100" cy={cy} r={5} fill="#fafafa" />
            </g>
        );
    };

    return (
        <div data-message-block="true" data-block-id={block.block_id} className="flex w-full flex-col items-center scroll-mt-24">
            <div className={cn(
                "relative z-10 w-full rounded-[24px] border border-gray-100 bg-white shadow-sm transition-all",
                isCompact ? "max-w-full" : "max-w-3xl"
            )}>
                {/* Sticky user prompt — liquid glass */}
                <>
                    <div className={cn(
                        "sticky -top-2 z-20 ml-auto mr-2 rounded-[24px] bg-white/60 pl-2 pr-4 pt-4 pb-4 backdrop-blur-xl",
                        isEditing ? "w-full max-w-none" : "w-fit max-w-[75%]"
                    )}>
                        {isEditing ? (
                            <UserMessageEditor
                                editText={editText}
                                isSubmittingEdit={isSubmittingEdit}
                                isSubmitDisabled={isSubmitDisabled}
                                onChange={setEditText}
                                onSubmit={() => void handleSubmit()}
                                onCancel={handleCancelEdit}
                                textareaRef={editTextareaRef}
                            />
                        ) : (
                            <UserMessageDisplay
                                userContent={block.user_content}
                                isLongMessage={isLongMessage}
                                isExpanded={isExpanded}
                                onToggleExpanded={() => setIsExpanded(!isExpanded)}
                                copiedTarget={copiedTarget}
                                onCopyUser={() => void copyToClipboard(block.user_content, "user")}
                                isStreaming={isStreaming}
                                isLast={isLast}
                                isSubmittingEdit={isSubmittingEdit}
                                onStartEdit={() => setIsEditing(true)}
                            />
                        )}
                    </div>

                    {/* AI response */}
                    <div className="px-6 pb-6 pt-4">
                        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 md:flex-row md:items-start md:gap-4">
                            <div className="shrink-0 self-start pt-0 md:pt-1">
                                <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm">
                                    {isStreaming && (
                                        <span className="pointer-events-none absolute -inset-1.5">
                                            <svg className="bot-circular-loader h-full w-full" viewBox="25 25 50 50">
                                                <circle
                                                    className="bot-loader-path"
                                                    cx="50"
                                                    cy="50"
                                                    r="20"
                                                    fill="none"
                                                    strokeWidth="2"
                                                    strokeMiterlimit="10"
                                                />
                                            </svg>
                                        </span>
                                    )}
                                    <Bot className="h-5 w-5 text-foreground" />
                                </div>
                            </div>

                            <div className="flex w-full min-w-0 flex-1 flex-col">
                                <AiMarkdownContent
                                    aiContent={aiContent}
                                    showThinking={showThinking}
                                    copiedTarget={copiedTarget}
                                    onCopy={copyToClipboard}
                                />
                                {block.is_stopped && !isStreaming && (
                                    <div className="mb-2 italic text-muted-foreground/80">
                                        この回答を停止しました
                                    </div>
                                )}
                                {!isStreaming && (
                                    <div className="flex gap-0.5">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="inline-flex">
                                                        <CopyButton
                                                            isCopied={copiedTarget === "ai"}
                                                            onCopy={() => void copyToClipboard(block.ai_content, "ai")}
                                                            size="icon-lg"
                                                            ariaLabel="Copy AI message"
                                                            className="h-10 w-10"
                                                        />
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent className="bg-black text-white border-transparent">
                                                    <p>コピーする</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                        {!isEditing && isLast && onEdit && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-lg"
                                                            type="button"
                                                            aria-label="Regenerate message"
                                                            className="h-10 w-10 rounded-full p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                            onClick={() => void handleRegenerate()}
                                                            disabled={isSubmittingEdit}
                                                        >
                                                            <RotateCcw className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="bg-black text-white border-transparent">
                                                        <p>やりなおす</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            </div>

            {/* 下部のコネクタ（分岐線）描画 */}
            {!isStreaming && (
                <div
                    className="relative -mt-2 z-0 w-[200px]"
                    style={{ height: isSplit ? LAST_HEIGHT : INTER_HEIGHT }}
                >
                    <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible">
                        <line
                            x1="100"
                            y1="0"
                            x2="100"
                            y2={isSplit ? MAIN_NODE_Y : INTER_HEIGHT}
                            stroke="currentColor"
                            strokeWidth={LINE_WIDTH}
                            className={LINE_COLOR}
                        />

                        {!isSplit ? (
                            isBranched ? (
                                <BranchNode cy={INTER_DOT_Y} />
                            ) : (
                                <circle cx="100" cy={INTER_DOT_Y} r="4" fill="currentColor" className={LINE_COLOR} />
                            )
                        ) : (
                            <>
                                {isBranched ? (
                                    <BranchNode cy={MAIN_NODE_Y} />
                                ) : (
                                    <circle cx="100" cy={MAIN_NODE_Y} r="5" fill="currentColor" className="text-gray-400" />
                                )}

                                {options?.showReturn && (
                                    <path
                                        d={`M 100 ${SPLIT_START_Y} C 100 ${BTN_CY} 80 ${BTN_CY} ${LEFT_BTN_CX + 20} ${BTN_CY}`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={LINE_WIDTH}
                                        className={LINE_COLOR}
                                    />
                                )}

                                {options?.showBranch && (
                                    <path
                                        d={`M 100 ${SPLIT_START_Y} C 100 35 ${RIGHT_BTN_CX} 25 ${RIGHT_BTN_CX} ${BTN_CY - 20}`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={LINE_WIDTH}
                                        className={LINE_COLOR}
                                    />
                                )}

                                {hoveredConnectorAction && (
                                    <>
                                        <line
                                            x1="100"
                                            y1="0"
                                            x2="100"
                                            y2={SPLIT_START_Y}
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-400/40 connector-comet-tail connector-comet-shared"
                                        />
                                        <line
                                            x1="100"
                                            y1="0"
                                            x2="100"
                                            y2={SPLIT_START_Y}
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-500/80 connector-comet-head connector-comet-shared"
                                        />
                                    </>
                                )}

                                {hoveredConnectorAction === "return" && options?.showReturn && (
                                    <>
                                        <path
                                            d={`M 100 ${SPLIT_START_Y} C 100 ${BTN_CY} 80 ${BTN_CY} ${LEFT_BTN_CX + 20} ${BTN_CY}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-400/40 connector-comet-tail connector-comet-branch"
                                        />
                                        <path
                                            d={`M 100 ${SPLIT_START_Y} C 100 ${BTN_CY} 80 ${BTN_CY} ${LEFT_BTN_CX + 20} ${BTN_CY}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-500/80 connector-comet-head connector-comet-branch"
                                        />
                                    </>
                                )}

                                {hoveredConnectorAction === "branch" && options?.showBranch && (
                                    <>
                                        <path
                                            d={`M 100 ${SPLIT_START_Y} C 100 35 ${RIGHT_BTN_CX} 25 ${RIGHT_BTN_CX} ${BTN_CY - 20}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-400/40 connector-comet-tail connector-comet-branch"
                                        />
                                        <path
                                            d={`M 100 ${SPLIT_START_Y} C 100 35 ${RIGHT_BTN_CX} 25 ${RIGHT_BTN_CX} ${BTN_CY - 20}`}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={LINE_WIDTH}
                                            className="text-gray-500/80 connector-comet-head connector-comet-branch"
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </svg>

                    {/* 操作ボタン */}
                    {isSplit && (
                        <>
                            {options?.showReturn && (
                                <div
                                    className="absolute -translate-x-1/2 -translate-y-1/2"
                                    style={{ left: LEFT_BTN_CX, top: BTN_CY }}
                                >
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="icon-lg"
                                                    type="button"
                                                    onClick={() => onMerge?.(block.block_id)}
                                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm transition-all hover:border-gray-300 hover:bg-[#F9FAFB]"
                                                    onMouseEnter={() => setHoveredConnectorAction("return")}
                                                    onMouseLeave={() => setHoveredConnectorAction(null)}
                                                >
                                                    <Check className="h-5 w-5 text-black" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" className="bg-black text-white border-transparent">
                                                <p>本筋に合流する</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}

                            {options?.showBranch && (
                                <div
                                    className="absolute -translate-x-1/2 -translate-y-1/2"
                                    style={{ left: RIGHT_BTN_CX, top: BTN_CY }}
                                >
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="icon-lg"
                                                    type="button"
                                                    onClick={() => onBranch?.(block.block_id)}
                                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm transition-all hover:border-gray-300 hover:bg-[#F9FAFB]"
                                                    onMouseEnter={() => setHoveredConnectorAction("branch")}
                                                    onMouseLeave={() => setHoveredConnectorAction(null)}
                                                >
                                                    <MessageCircleQuestionMark
                                                        className="h-5 w-5 text-black"
                                                    />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" className="bg-black text-white border-transparent">
                                                <p>ヨリミチする</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}