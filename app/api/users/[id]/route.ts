import bcrypt from 'bcryptjs'
import { body, HttpError, invalidateUserCache, route } from '@/lib/server/api'
import { prisma } from '@/lib/server/db'
import { userUpdateSchema } from '@/lib/server/schemas'

export const PATCH = route(['ADMIN'], async (req, { params, user }) => {
  const { password, ...data } = await body(req, userUpdateSchema)
  if (params.id === user.id && (data.active === false || data.role === 'CASHIER')) throw new HttpError(400, 'You cannot deactivate or demote your own account')
  if (data.active === false || data.role === 'CASHIER') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: params.id } } })
    if (admins === 0) throw new HttpError(400, 'At least one active admin is required')
  }
  invalidateUserCache(params.id)
  return prisma.user.update({
    where: { id: params.id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: { id: true, name: true, email: true, role: true, active: true, lastActiveAt: true },
  })
})
