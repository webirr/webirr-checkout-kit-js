import { NextResponse } from "next/server";
import { sharedExampleStore } from "@/lib/example-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const merchantReference = url.searchParams.get("merchantReference")?.trim() || "";
  if (!merchantReference) {
    return NextResponse.json({ error: "merchantReference is required." }, { status: 400 });
  }

  try {
    const body = sharedExampleStore().receiptText(merchantReference);
    return new Response(body, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${merchantReference}-receipt.txt"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
