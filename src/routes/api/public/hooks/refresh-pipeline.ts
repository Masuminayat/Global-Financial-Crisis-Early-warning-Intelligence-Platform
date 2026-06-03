import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/hooks/refresh-pipeline')({
  server: {
    handlers: {
      POST: async () => Response.json({ ok: true }),
    },
  },
})
