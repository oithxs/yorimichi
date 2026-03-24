"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { useUser, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EllipsisVertical, Pencil, Pin, Search, Trash2, X } from "lucide-react";
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
import { Chatlist } from "@/generated/prisma"; // 型だけインポート
import { cn } from "@/lib/utils";

type SerializedChatlist = Omit<Chatlist, "created_at" | "update_at"> & {
  created_at: string;
  update_at: string;
};

const fetcher = async (url: string): Promise<SerializedChatlist[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

export function ChatHistory({ onClickItem }: { onClickItem?: () => void }) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { openSignIn } = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [editingChat, setEditingChat] = useState<{
    chatId: string;
    initialTitle: string;
  } | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const previousPathname = useRef(pathname);
  const { cache } = useSWRConfig();
  const key = isUserLoaded && user ? "/api/internal/chat/list" : null;
  const hasCachedChats = key ? cache.get(key) !== undefined : false;

  const { data: chats = [], mutate } = useSWR(key, fetcher, {
    revalidateOnMount: !hasCachedChats && !!key,
    revalidateIfStale: false,
  });

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim()) {
        setIsSearching(true);
        try {
          const res = await fetch(`/api/internal/chat/search?q=${encodeURIComponent(searchQuery)}`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data);
          }
        } catch (error) {
          console.error("Search failed:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      void mutate();
    }
  }, [pathname, mutate]);

  const togglePin = async (chatId: string, isPinned: boolean) => {
    try {
      const res = await fetch(`/api/internal/chat/${chatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_pinned: isPinned }),
      });

      if (!res.ok) throw new Error("Failed to update pin status");
      await mutate();
    } catch (error) {
      console.error(error);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      const isCurrentChatPage = pathname === `/chat/${chatId}`;
      const res = await fetch(`/api/internal/chat/${chatId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) throw new Error("Failed to delete chat");
      setDeletingChatId(null);
      if (isCurrentChatPage) {
        router.replace("/");
        onClickItem?.();
      }
      await mutate();
    } catch (error) {
      console.error(error);
      setDeletingChatId(null);
    }
  };

  const updateChatTitle = async () => {
    if (!editingChat) return;

    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle || trimmedTitle === editingChat.initialTitle) return;

    try {
      setIsUpdatingTitle(true);
      const res = await fetch(`/api/internal/chat/${editingChat.chatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_title: trimmedTitle }),
      });

      if (!res.ok) throw new Error("Failed to update chat title");
      setEditingChat(null);
      setEditingTitle("");
      await mutate();
    } catch (error) {
      console.error(error);
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const canSubmitTitleUpdate =
    !!editingChat &&
    editingTitle.trim().length > 0 &&
    editingTitle.trim() !== editingChat.initialTitle &&
    !isUpdatingTitle;

  return (
    <div className="relative h-full w-full min-w-0">
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-8 bg-gradient-to-b from-[#E9EEF6] to-transparent" />

      <div className="h-full w-full min-w-0 box-border overflow-y-auto overscroll-contain hide-scrollbar px-4 pt-6 pb-4">
        <div className="px-2 mb-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              type="text"
              placeholder="チャットを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-full bg-white/50 pl-9 pr-9 text-sm border-transparent transition-all focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted text-muted-foreground transition-colors"
                title="検索をクリア"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>{searchQuery ? "検索結果" : "チャット履歴"}</span>
          {isSearching && <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1">
          {user ? (
            (searchQuery ? searchResults : chats).map((chat) => (
              <div
                key={chat.chat_id}
                className={cn(
                  "grid h-auto min-h-[2.5rem] w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center rounded-2xl hover:bg-[#DDE3EA] group transition-colors px-1 py-1",
                  pathname === `/chat/${chat.chat_id}` && "bg-[#DDE3EA]",
                )}
              >
                <Link
                  href={`/chat/${chat.chat_id}`}
                  onClick={onClickItem}
                  className="flex h-full min-w-0 max-w-full items-center pl-3 pr-1 overflow-hidden"
                >
                  <div className="flex min-w-0 max-w-full flex-col items-start overflow-hidden w-full pr-2 py-1">
                    {searchQuery && chat.snippet ? (
                      <>
                        <span className="truncate w-full text-left text-sm font-medium">
                          {chat.snippet}
                        </span>
                        <span className="truncate w-full text-left text-xs text-muted-foreground mt-0.5">
                          {chat.chat_title}
                        </span>
                      </>
                    ) : (
                      <span className="truncate w-full text-left text-sm font-medium">
                        {chat.chat_title}
                      </span>
                    )}
                  </div>
                </Link>
                <DropdownMenu
                  open={openMenuChatId === chat.chat_id}
                  onOpenChange={(open) => {
                    setOpenMenuChatId(open ? chat.chat_id : null);
                  }}
                >
                  <div className="relative mr-2 h-8 w-8 shrink-0">
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 flex items-center justify-center text-primary transition-opacity",
                        chat.is_pinned && openMenuChatId !== chat.chat_id
                          ? "opacity-100 group-hover:opacity-0"
                          : "opacity-0",
                      )}
                    >
                      <Pin className="h-4 w-4 fill-current" />
                    </div>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Chat actions"
                        className={cn(
                          "absolute inset-0 flex items-center justify-center rounded-full p-1 text-muted-foreground transition-opacity hover:bg-[#D4DBE3] hover:text-foreground",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                  </div>
                  <DropdownMenuContent
                    align="end"
                    className="w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
                  >
                    <DropdownMenuItem
                      className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-700 focus:bg-gray-50"
                      onSelect={() => {
                        setOpenMenuChatId(null);
                        void togglePin(chat.chat_id, !chat.is_pinned);
                      }}
                    >
                      <Pin
                        className={cn(
                          "h-4 w-4",
                          chat.is_pinned && "fill-current text-primary",
                        )}
                      />
                      <span>
                        {chat.is_pinned ? "ピン留めを解除" : "ピン留めする"}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-700 focus:bg-gray-50"
                      onSelect={() => {
                        setOpenMenuChatId(null);
                        setEditingChat({
                          chatId: chat.chat_id,
                          initialTitle: chat.chat_title,
                        });
                        setEditingTitle(chat.chat_title);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      <span>タイトルを編集</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-700 focus:bg-gray-50"
                      onSelect={() => {
                        setOpenMenuChatId(null);
                        setDeletingChatId(chat.chat_id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>会話を削除する</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-4 bg-[#DDE3EA] rounded-2xl border border-gray-200/50 mx-2 mt-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                ログインすることでチャットの利用と
                <br />
                履歴の保存が可能になります
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-9 rounded-full text-xs bg-white border-gray-200 transition-colors"
                onClick={() =>
                  openSignIn({
                    appearance: {
                      elements: {
                        modalBackdrop: {
                          backgroundColor: "rgba(0, 0, 0, 0.4)",
                        },
                        modalCloseButton: {
                          outline: "none",
                          boxShadow: "none",
                          "&:focus": {
                            outline: "none",
                            boxShadow: "none",
                          },
                        },
                      },
                    },
                  })
                }
              >
                ログイン
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={editingChat !== null}
        onOpenChange={(open) => {
          if (!open && !isUpdatingTitle) {
            setEditingChat(null);
            setEditingTitle("");
          }
        }}
      >
        <AlertDialogContent className="min-w-0 w-[400px] sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>タイトル編集</AlertDialogTitle>
            <AlertDialogDescription>
              会話のタイトルを変更できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={editingTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            placeholder="会話タイトル"
            maxLength={255}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (canSubmitTitleUpdate) {
                  void updateChatTitle();
                }
              }
            }}
          />
          <AlertDialogFooter className="!flex-row justify-end gap-2">
            <AlertDialogCancel
              className="mt-0"
              disabled={isUpdatingTitle}
              onClick={(event) => {
                if (isUpdatingTitle) {
                  event.preventDefault();
                }
              }}
            >
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (canSubmitTitleUpdate) {
                  void updateChatTitle();
                }
              }}
              disabled={!canSubmitTitleUpdate}
            >
              更新
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingChatId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingChatId(null);
        }}
      >
        <AlertDialogContent className="min-w-0 w-[400px] sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>会話削除の確認</AlertDialogTitle>
            <AlertDialogDescription>
              本当にこの会話を削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="!flex-row justify-end gap-2">
            <AlertDialogCancel className="mt-0">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingChatId) {
                  void deleteChat(deletingChatId);
                }
              }}
              variant="destructive"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
