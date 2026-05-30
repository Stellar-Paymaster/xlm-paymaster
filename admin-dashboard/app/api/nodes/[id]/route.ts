import { NextRequest, NextResponse } from "next/server";
import { getNode, pingNode } from "@/lib/node-registry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const node = getNode(id);
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    const result = await pingNode(id);
    return NextResponse.json({ node: getNode(id), ping: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ping failed" },
      { status: 500 },
    );
  }
}
