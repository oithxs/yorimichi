
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthUserId } from '@/lib/auth-utils';

export async function GET(req: Request) {
    try {
        const userId = await getAuthUserId(req);
        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (!query) {
            return NextResponse.json([]);
        }

        // 検索ロジック
        // 1. user_content を対象に検索
        // 2. status != 'dropped' のものを取得
        // 3. chat_id でグループ化または一意にする
        
        const blocks = await prisma.block.findMany({
            where: {
                user_content: {
                    contains: query,
                    mode: 'insensitive',
                },
                branch: {
                    chat: {
                        user_id: userId,
                    },
                    status: {
                        not: 'dropped',
                    },
                },
            },
            include: {
                branch: {
                    include: {
                        chat: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
            take: 50, // 制限
        });

        // 重複排除とチャット情報の抽出
        // 同じチャットで複数のブロックがヒットする場合があるため、Mapを使ってチャットごとに最新のヒットを保持
        // また、mergedブランチのヒットであっても、そのチャット自体を返す
        const chatMap = new Map();

        for (const block of blocks) {
            const chat = block.branch.chat;
            if (!chatMap.has(chat.chat_id)) {
                chatMap.set(chat.chat_id, {
                    chat_id: chat.chat_id,
                    chat_title: chat.chat_title,
                    is_pinned: chat.is_pinned,
                    created_at: chat.created_at,
                    update_at: chat.update_at,
                    snippet: block.user_content, // ヒットした内容の一部
                });
            }
        }

        const results = Array.from(chatMap.values());

        return NextResponse.json(results);

    } catch (error) {
        console.error("[CHAT_SEARCH]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
