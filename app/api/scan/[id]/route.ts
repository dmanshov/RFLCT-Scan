import { NextRequest, NextResponse } from 'next/server';
import { getScan } from '@/lib/store';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const scan = getScan(params.id);
  if (!scan) {
    return NextResponse.json({ error: 'Scan niet gevonden.' }, { status: 404 });
  }
  // Don't expose email/phone in the polling response
  const { email: _e, phone: _p, ...safe } = scan;
  return NextResponse.json(safe);
}
