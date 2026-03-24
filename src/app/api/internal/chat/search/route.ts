import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUserId } from "@/lib/auth-utils";


export async function GET(req: Request) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    // Block.user_content から検索。
    // branch status が 'dropped' のものは除外。
    const blocks = await prisma.block.findMany({
      where: {
        user_content: {
          contains: query,
        },
        branch: {
          status: {
            in: ["active", "locked", "merged"],
          },
          chat: {
            user_id: userId,
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
        created_at: "desc",
      },
      take: 20,
    });

    const results = blocks.map((b) => ({
      block_id: b.block_id,
      chat_id: b.branch.chat_id,
      branch_id: b.branch_id,
      snippet: b.user_content,
      chat_title: b.branch.chat.chat_title,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[SEARCH_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
