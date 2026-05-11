import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const localExportDirectoryName = '.decision-cockpit'

function localWorkspaceBridge() {
  return {
    name: 'local-workspace-bridge',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: IncomingMessage,
            res: ServerResponse,
            next: () => void,
          ) => void | Promise<void>,
        ) => void
      }
    }) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/local/')) {
          next()
          return
        }

        if (req.method === 'GET' && req.url === '/api/local/status') {
          const exportDirectory = getLocalExportDirectory()
          sendJson(res, 200, {
            available: true,
            platform: process.platform,
            workspaceRoot: process.cwd(),
            exportDirectory,
            macOpenSupported: process.platform === 'darwin',
          })
          return
        }

        if (req.method === 'POST' && req.url === '/api/local/export') {
          const body = await readJsonBody(req)
          const safeFileName = sanitizeFileName(String(body.fileName || 'decision-cockpit.json'))
          const targetDirectory = getLocalExportDirectory()
          const targetPath = path.join(targetDirectory, safeFileName)
          await mkdir(targetDirectory, { recursive: true })
          await writeFile(targetPath, JSON.stringify(body.payload ?? {}, null, 2), 'utf8')
          sendJson(res, 200, { ok: true, filePath: targetPath })
          return
        }

        if (req.method === 'POST' && req.url === '/api/local/open') {
          const body = await readJsonBody(req)
          const filePath = resolveWorkspaceExportFilePath(String(body.filePath || ''))
          const mode = body.mode === 'inspect' ? 'inspect' : 'reveal'

          if (!filePath) {
            sendJson(res, 400, { ok: false, error: 'Refusing to open a path outside the workspace export directory.' })
            return
          }

          if (process.platform !== 'darwin') {
            sendJson(res, 501, { ok: false, error: 'Direct local open is only enabled for macOS runners.' })
            return
          }

          const child =
            mode === 'inspect'
              ? spawn('qlmanage', ['-p', filePath], {
                  detached: true,
                  stdio: 'ignore',
                })
              : spawn('open', ['-R', filePath], {
                  detached: true,
                  stdio: 'ignore',
                })
          child.unref()
          sendJson(res, 200, { ok: true })
          return
        }

        sendJson(res, 404, { ok: false, error: 'Unknown local bridge route.' })
      })
    },
  }
}

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, '-')
  return baseName.endsWith('.json') ? baseName : `${baseName}.json`
}

function getLocalExportDirectory() {
  return path.resolve(process.cwd(), localExportDirectoryName)
}

function resolveWorkspaceExportFilePath(filePath: string) {
  if (!filePath) {
    return null
  }

  const exportDirectory = getLocalExportDirectory()
  const candidatePath = path.resolve(filePath)
  const relativePath = path.relative(exportDirectory, candidatePath)

  if (
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath) ||
    relativePath === ''
  ) {
    return null
  }

  return candidatePath
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')),
    )
    req.on('end', () => resolve())
    req.on('error', reject)
  })

  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localWorkspaceBridge()],
})
