import { NextRequest, NextResponse } from "next/server";

let currentNumber = 0;

export async function GET() {
  return NextResponse.json({ value: currentNumber });
}

export async function POST(request: NextRequest) {
  try {
    const { value } = await request.json();
    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    currentNumber = parsed;
    return NextResponse.json({ value: currentNumber });
  } catch {
    return NextResponse.json({ error: "Erro ao processar" }, { status: 500 });
  }
}
