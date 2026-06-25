import { NextResponse } from "next/server";
import { sharedExampleStore } from "@/lib/example-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { bookId?: string; customerName?: string };
    const order = sharedExampleStore().createOrder(body.bookId, body.customerName);
    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
