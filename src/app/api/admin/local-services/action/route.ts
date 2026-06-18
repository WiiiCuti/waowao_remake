import { NextResponse } from 'next/server';
import { LocalServicesManager } from '@/lib/local-services/manager';

export async function POST(request: Request) {
  try {
    const { action, serviceId } = await request.json();

    if (!['start', 'stop'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    if (!['comfyui', 'omnivoice'].includes(serviceId)) {
      return NextResponse.json({ success: false, error: 'Invalid serviceId' }, { status: 400 });
    }

    if (action === 'start') {
      await LocalServicesManager.startService(serviceId);
    } else {
      await LocalServicesManager.stopService(serviceId);
    }

    return NextResponse.json({ success: true, message: `Service ${serviceId} ${action}ed successfully.` });
  } catch (error: any) {
    console.error(`Error performing action on local service:`, error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
