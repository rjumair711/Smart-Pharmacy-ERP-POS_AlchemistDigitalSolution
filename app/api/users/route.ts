import bcrypt from 'bcryptjs'
import { body, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { userCreateSchema } from '@/lib/server/schemas'

const select = { id: true, name: true, email: true, role: true, active: true, lastActiveAt: true, createdAt: true }

export const GET = route(['ADMIN'], async () => prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }], select }))

export const POST = route(['ADMIN'], async req => {
  const { password, ...data } = await body(req, userCreateSchema)
  return prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) }, select })
})
