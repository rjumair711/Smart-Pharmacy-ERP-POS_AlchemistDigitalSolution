import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { settingsSchema } from '@/lib/server/schemas'
import { getSettings, invalidateSettings } from '@/lib/server/util'

export const GET = route(null, async () => getSettings(prisma))

export const PATCH = route(['ADMIN'], async req => {
  const data = await body(req, settingsSchema)
  await getSettings(prisma)
  const updated = await prisma.setting.update({ where: { id: 1 }, data })
  invalidateSettings()
  return updated
})
