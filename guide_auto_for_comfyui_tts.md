# Auto Start/Stop ComfyUI + TTS từ GUI

## Vấn đề

Phải mở terminal riêng, gõ lệnh khởi động ComfyUI, TTS server thủ công mỗi lần dev. Mất thời gian, dễ quên.

## Giải pháp

Thêm tab "Dev Tools" trong GUI, nơi user nhập đường dẫn + port, nhấn nút là spawn process ngầm, nhấn nút khác là kill.

## UI

Tab trong profile/settings:

```
┌─────────────────────────────────┐
│  🔧 Dev Tools                    │
│                                  │
│  ComfyUI                         │
│  Path:   [C:\ComfyUI\main.py  ]  │
│  Args:   [--port 8188 --listen ] │
│  Status: ● Running (PID 1234)     │
│  [▶ Start]  [⏹ Stop]  [⟳ Restart]│
│                                  │
│  TTS Server                      │
│  Cmd:    [python tts_server.py ] │
│  Port:   [8020                 ] │
│  Status: ○ Stopped               │
│  [▶ Start]  [⏹ Stop]            │
│                                  │
│  ⚙️ Tự động                      │
│  ☐ Auto-start on page load      │
│  ☐ Auto-kill on page close      │
└─────────────────────────────────┘
```

## Chỉ hiện trong dev mode

File `.env.local` có flag:

```
DEV_TOOLS_ENABLED=true
```

Production ẩn tab.

## Routes API

| Method | Path | Chức năng |
|--------|------|-----------|
| POST | `/api/dev/process/start` | Nhận `{cmd, args, cwd, port}`, spawn, lưu PID, poll port alive, trả về `{pid, status}` |
| POST | `/api/dev/process/stop` | `taskkill /T /F /PID $pid` (Windows), `kill -- -$pid` (Mac/Linux). Xoá PID khỏi store |
| GET | `/api/dev/process/status` | Trả về danh sách process + trạng thái port |
| POST | `/api/dev/process/restart` | Stop + Start |

## Kill process

```ts
import { execSync } from 'child_process'

function killProcessTree(pid: number) {
  const isWin = process.platform === 'win32'
  if (isWin) {
    execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' })
  } else {
    execSync(`kill -- -${pid}`, { stdio: 'ignore' }) // negative PID = kill group
  }
}
```

Cờ `/T` (Windows) / `-- -pid` (Unix) bắt buộc để kill cả cây process con.

## Store

Dùng file JSON tạm (không cần DB):

```json
// temp/dev-processes.json
{
  "comfyui": { "pid": 1234, "port": 8188, "startedAt": "..." },
  "tts": { "pid": 5678, "port": 8020, "startedAt": "..." }
}
```

Hoặc lưu trong `globalThis` nếu chỉ cần trong session.

## Cleanup khi app restart

Nếu app crash, process con orphan. Fix:

- `process.on('exit', () => killAll())` — cleanup khi graceful shutdown
- `beforeunload` ở client gọi `/api/dev/process/stop` khi đóng tab

## Triển khai

1. Tạo `src/app/api/dev/process/` routes
2. Tạo component `DevTools.tsx` trong profile
3. Import `child_process` — Next.js API route chạy Node, spawn được
4. Test trên Windows (taskkill) + Mac/Linux (kill group)
