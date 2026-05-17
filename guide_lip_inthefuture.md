# ComfyUI Lip Sync Implementation Guide

## Overview

This document tracks the ComfyUI integration for lip sync functionality, including implementation details, bugs fixed, and instructions for enabling real lip sync models.

---

## What Was Implemented

### 1. ComfyUI Lip Sync Provider (`comfyui-lipsync.ts`)

**Location**: `src/lib/lipsync/providers/comfyui-lipsync.ts`

Currently implemented as a **fake/passthrough** provider:
- Downloads the input video from `videoUrl`
- Re-uploads to storage under `lipsync/comfyui/${timestamp}.mp4`
- Returns the re-uploaded URL as `videoUrl`
- No actual lip sync processing is performed

**Key properties in response**:
```typescript
{
  requestId: `COMFYUI-LIPSYNC-FAKE-${Date.now()}`,
  videoUrl: getSignedUrl(storageKey, 7200),  // re-uploaded video URL
  externalId: '',      // empty = no polling needed
  async: false,        // sync result (immediate)
}
```

### 2. Integration Points

- **`src/lib/lipsync/index.ts`**: Routes `comfyui` provider key to `submitComfyUILipSync()`
- **`src/lib/lipsync/preprocess.ts`**: Added `comfyui` to `LipSyncProviderKey` type
- **`src/lib/workers/utils.ts`**: `resolveLipSyncVideoSource()` handles both sync and async lip sync results
- **`src/lib/async-poll.ts`**: Added COMFYUI parsing + `pollComfyUITask()` stub

---

## Bugs Fixed

### Bug 1: Crash with `async: false` Lip Sync Results

**Problem**:
- Original code assumed all lip sync results have `externalId` for polling
- `submitComfyUILipSync()` returned `async: false` with real `videoUrl`
- `resolveLipSyncVideoSource()` in `utils.ts` always called `waitExternalResult()` with `externalId`
- `waitExternalResult()` calls `pollAsyncTask()` which throws on unknown `externalId` format
- Result: `TypeError` crash when ComfyUI lip sync returned sync result

**Root Cause Flow**:
```
submitComfyUILipSync (async: false)
  → generateLipSync → result { async: false, videoUrl, externalId: '' }
  → resolveLipSyncVideoSource → expects externalId
  → waitExternalResult('') → pollAsyncTask('') → throws "无法识别的 externalId"
```

**Fix**:
1. `comfyui-lipsync.ts`: Return `externalId: ''` (empty string, not missing)
2. `utils.ts` line 589-594: Check `result.requestId && result.videoUrl && !result.async` → return `videoUrl` directly
3. `utils.ts` line 597-604: If `externalId` is empty but `videoUrl` exists → return `videoUrl` directly (no polling)
4. `async-poll.ts`: Added COMFYUI parser for completeness (returns failed if ever called)

**Code in `utils.ts`**:
```typescript
// Check for sync result first
if (result.requestId && result.videoUrl && !result.async) {
  logger.info({ message: 'lip sync generation completed (sync)', durationMs: Date.now() - startedAt })
  return result.videoUrl
}

// Handle empty externalId with videoUrl
const externalId = typeof result.externalId === 'string' ? result.externalId.trim() : ''
if (!externalId) {
  if (!result.videoUrl) {
    throw new Error('Lip sync: no videoUrl and no externalId')
  }
  logger.info({ message: 'lip sync generation completed (sync/no-poll)', durationMs: Date.now() - startedAt })
  return result.videoUrl
}

// Only poll if externalId is present
const polled = await waitExternalResult(job, externalId, params.userId, { ... })
return polled.url
```

---

## Enabling Real ComfyUI Lip Sync

When you find a suitable ComfyUI workflow/model for lip sync (e.g., Sad Talker, Wav2Lip, etc.), follow these steps to enable real processing.

### Step 1: Find/Create ComfyUI Workflow

Find a ComfyUI workflow for lip sync (Sad Talker, Wav2Lip, etc.). The workflow should:
- Accept: video/image input + audio input
- Output: processed video with synced lips
- Use `$` placeholders for all configurable parameters

Example workflow node structure:
- **Input nodes**: `$video`, `$audio`
- **Processing nodes**: Sad Talker / Wav2Lip
- **Output nodes**: Save video

### Step 2: Create Workflow JSON

Create `src/lib/voice/comfyui_lipsync_workflow.json`:

```json
{
  "nodes": [
    { "id": 1, "type": "LoadVideo", "widgets": ["$video_url"] },
    { "id": 2, "type": "LoadAudio", "widgets": ["$audio_url"] },
    { "id": 3, "type": "SadTalker", "widgets": ["$style", "$size"] },
    { "id": 4, "type": "SaveVideo", "widgets": ["$output_path"] }
  ],
  "connections": [[1, 3], [2, 3], [3, 4]]
}
```

### Step 3: Update `comfyui-lipsync.ts`

```typescript
import { buildComfyUIWorkflow, uploadToComfyUI, waitComfyUICompletion } from '@/lib/comfyui/client'

export async function submitComfyUILipSync(
  params: LipSyncParams,
  context: LipSyncSubmitContext,
): Promise<LipSyncResult> {
  const { baseUrl } = await getProviderConfig(context.userId, context.providerId)
  const comfyUrl = baseUrl || 'http://localhost:8188'

  const { videoUrl, audioUrl } = params

  // Step 1: Download input files to local temp paths
  const normalizedVideo = await normalizeToOriginalMediaUrl(videoUrl)
  const normalizedAudio = await normalizeToOriginalMediaUrl(audioUrl)

  const videoPath = await downloadToTemp(normalizedVideo, 'video', 'mp4')
  const audioPath = await downloadToTemp(normalizedAudio, 'audio', 'wav')

  // Step 2: Build workflow with local file paths
  const workflow = await buildComfyUIWorkflow(
    loadWorkflowJson('comfyui_lipsync_workflow.json'),
    {
      '$video_url': videoPath,
      '$audio_url': audioPath,
    }
  )

  // Step 3: Submit to ComfyUI
  const { requestId, externalId } = await uploadToComfyUI(workflow, comfyUrl, context.userId)

  // Step 4: Return result for polling
  return {
    requestId,
    videoUrl: '',  // empty = will be retrieved via polling
    externalId,   // e.g., "COMFYUI:RESULT:{encoded_url}:{timestamp}"
    async: true,   // requires polling
  }
}
```

### Step 4: Implement Polling Handler

Add to `src/lib/async-poll.ts`:

```typescript
async function pollComfyUITask(encodedUrl: string, timestamp: string): Promise<PollResult> {
  // Decode the result URL from externalId
  const resultUrl = Buffer.from(encodedUrl, 'base64url').toString('utf8')

  // Check if URL is accessible
  try {
    const response = await fetch(resultUrl, { method: 'HEAD' })
    if (response.ok) {
      return {
        status: 'completed',
        videoUrl: resultUrl,
        resultUrl: resultUrl,
      }
    }
  } catch {
    // URL not ready yet
  }

  return { status: 'pending' }
}
```

### Step 5: Update `externalId` Format

When ComfyUI completes, it can store result URL in DB with externalId format:
```
COMFYUI:RESULT:{base64_encoded_url}:{timestamp}
```

Parse in `parseExternalId()`:
```typescript
if (externalId.startsWith('COMFYUI:')) {
  const parts = externalId.split(':')
  const resultType = parts[1]  // 'RESULT'
  const encodedUrl = parts[2]  // base64 encoded result URL
  const timestamp = parts[3]    // completion timestamp
  return { provider: 'COMFYUI', type: 'VIDEO', requestId: timestamp, encodedUrl }
}
```

---

## Testing the Integration

### Manual Test

```bash
# Start ComfyUI locally
# Upload workflow via ComfyUI UI

# Test via API
curl -X POST http://localhost:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": {...}}'
```

### Automated Test

```typescript
// src/__tests__/comfyui-lipsync.test.ts
describe('ComfyUI Lip Sync', () => {
  it('should return videoUrl for sync result', async () => {
    const result = await submitComfyUILipSync(
      { videoUrl: 'https://...', audioUrl: 'https://...' },
      context
    )
    expect(result.videoUrl).toBeTruthy()
    expect(result.async).toBe(false)
    expect(result.externalId).toBe('')
  })
})
```

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/lipsync/providers/comfyui-lipsync.ts` | Lip sync provider implementation |
| `src/lib/lipsync/index.ts` | Provider routing |
| `src/lib/lipsync/preprocess.ts` | Type definitions |
| `src/lib/lipsync/types.ts` | `LipSyncResult`, `LipSyncParams` interfaces |
| `src/lib/workers/utils.ts` | Worker utilities (line 536-618) |
| `src/lib/async-poll.ts` | Poll handler for COMFYUI (line 199-210, 250) |

---

## Key Interfaces

### `LipSyncResult`
```typescript
interface LipSyncResult {
  requestId: string       // Internal tracking ID
  videoUrl?: string       // Result URL (sync) or empty (async)
  externalId?: string     // Polling ID (empty = no polling)
  async: boolean          // true = requires polling, false = immediate
}
```

### `LipSyncParams`
```typescript
interface LipSyncParams {
  videoUrl: string        // Source video URL
  audioUrl: string        // TTS audio URL
  audioDurationMs?: number
  videoDurationMs?: number
}
```

---

## Notes

- ComfyUI TTS (VieNeu) is separate from ComfyUI lip sync - they are two different providers
- The fake lip sync is intentional for development - allows UI/flow testing without real model
- Real lip sync will require a ComfyUI server running (can be local or remote)
- Poll timeout is configurable via `WORKER_EXTERNAL_TIMEOUT_MS` env (default 20 min)