import { NextResponse } from 'next/server';
import { LocalServicesManager } from '@/lib/local-services/manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [metrics, comfyui, omnivoice] = await Promise.all([
      LocalServicesManager.getSystemMetrics(),
      LocalServicesManager.getServiceStatus('comfyui'),
      LocalServicesManager.getServiceStatus('omnivoice')
    ]);

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        services: [comfyui, omnivoice]
      }
    });
  } catch (error: any) {
    console.error('Error fetching local services status:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
