import { type NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  return NextResponse.json({ success: true, status: 'ok' });
}
