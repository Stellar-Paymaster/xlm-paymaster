import { NextRequest, NextResponse } from "next/server";
import {
  listNodes,
  registerNode,
  validateNodeInput,
  seedDemoNodes,
} from "@/lib/node-registry";

// Seed demo nodes on first request so the map is never empty in local dev.
seedDemoNodes();

export async function GET() {
  try {
    const nodes = listNodes();
    return NextResponse.json({ nodes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list nodes" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = validateNodeInput(body);
    const node = registerNode(input);
    return NextResponse.json({ node }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register node";
    const status = message.includes("required") || message.includes("valid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
