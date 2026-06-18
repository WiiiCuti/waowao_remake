import { NextResponse } from 'next/server';
import { LocalServicesManager } from '@/lib/local-services/manager';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');

    if (!serviceId || !['comfyui', 'omnivoice'].includes(serviceId)) {
      return NextResponse.json({ success: false, error: 'Invalid serviceId' }, { status: 400 });
    }

    const logs = await LocalServicesManager.getServiceLogs(serviceId, 100);

    return new NextResponse(logs, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  } catch (error: any) {
    console.error('Error fetching local services logs:', error);
    return new NextResponse(`Error fetching logs: ${error.message}`, { status: 500 });
  }
}
