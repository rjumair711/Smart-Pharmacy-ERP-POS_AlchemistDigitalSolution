import { body, HttpError, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { categorySchema } from '@/lib/server/schemas'

export const PATCH = route(['ADMIN'], async (req, { params }) => {
  const data = await body(req, categorySchema.partial())
  return prisma.category.update({ where: { id: params.id }, data })
})

export const DELETE = route(['ADMIN'], async (_req, { params }) => {
  const count = await prisma.medicine.count({ where: { categoryId: params.id } })
  if (count > 0) throw new HttpError(409, `This category has ${count} medicine(s). Move them to another category before deleting.`)
  await prisma.category.delete({ where: { id: params.id } })
  return { ok: true }
})
