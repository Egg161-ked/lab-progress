// 云函数：修改成员资料 / 角色
//
// 权限规则（服务端强制）：
//   admin  —— 可修改任何成员的 role / direction / intro / groupId
//   mentor —— 可修改成员资料；可任命为「组长 / 普通成员」，但不能授予超管或导师，
//             也不能修改「管理员 / 导师」的角色
//   本人   —— 只能修改自己的 direction / intro（不能给自己改角色）
//   其他   —— 拒绝
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const VALID_ROLES = ['admin', 'mentor', 'leader', 'member']
// 导师可任命的角色（只能在这两个之间切换）
const MENTOR_ASSIGNABLE = ['leader', 'member']
// 导师不能修改这些角色的账号
const MENTOR_PROTECTED = ['admin', 'mentor']

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  const memberId = event && event.memberId
  if (!memberId) {
    return { success: false, message: '缺少 memberId' }
  }

  try {
    // ---------- 1. 调用者 ----------
    const caller = await getCaller(openid)
    if (!caller) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    const callerRole = caller.role || 'member'
    const isAdmin = callerRole === 'admin'
    const isMentor = callerRole === 'mentor'
    const canManage = isAdmin || isMentor

    // ---------- 2. 目标成员 ----------
    let target
    try {
      const tr = await db.collection('users').doc(memberId).get()
      target = tr.data
    } catch (e) {
      return { success: false, message: '成员不存在' }
    }

    const isSelf = target._openid === openid

    // 已归档成员（毕业生）不能再改角色：他不在职，改了没有意义还可能造成
    // "已归档却还是组长"这类脏数据。需要恢复的话先在成员页点"恢复成员"。
    if (target.archived && event.role !== undefined) {
      return { success: false, message: '该成员已归档，不能修改角色（请先恢复成员）' }
    }
    const targetRole = target.role || 'member'

    if (!canManage && !isSelf) {
      return { success: false, message: '没有权限修改该成员' }
    }

    // ---------- 3. 组装更新字段 ----------
    const patch = {}

    if (event.role !== undefined) {
      if (!canManage) {
        return { success: false, message: '只有管理员或导师可以修改角色' }
      }
      if (!VALID_ROLES.includes(event.role)) {
        return { success: false, message: '非法角色：' + event.role }
      }

      // 导师的额外限制：只能任命组长/普通成员，且不能动管理员/导师
      if (!isAdmin) {
        if (!MENTOR_ASSIGNABLE.includes(event.role)) {
          return { success: false, message: '导师只能任命为组长或普通成员' }
        }
        if (MENTOR_PROTECTED.includes(targetRole)) {
          return { success: false, message: '不能修改管理员或导师的角色' }
        }
      }

      patch.role = event.role
    }

    if (event.direction !== undefined) patch.direction = String(event.direction)
    if (event.intro !== undefined) patch.intro = String(event.intro)

    if (event.groupId !== undefined) {
      if (!isAdmin) {
        return { success: false, message: '只有管理员可以修改分组' }
      }
      patch.groupId = String(event.groupId)
    }

    if (Object.keys(patch).length === 0) {
      return { success: false, message: '没有需要更新的字段' }
    }

    // 自我保护：不允许修改自己的角色（避免把系统里唯一的超管弄丢）
    if (isSelf && patch.role && patch.role !== targetRole) {
      return { success: false, message: '不能修改自己的角色（请让另一位管理员/导师操作）' }
    }

    // ---------- 4. 更新 ----------
    await db.collection('users').doc(memberId).update({
      data: {
        ...patch,
        updateTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '修改成功',
      updated: Object.keys(patch),
      role: patch.role || target.role
    }
  } catch (err) {
    console.error('[updateMember] 失败:', err)
    return { success: false, message: '修改失败：' + (err.errMsg || err.message || err) }
  }
}
