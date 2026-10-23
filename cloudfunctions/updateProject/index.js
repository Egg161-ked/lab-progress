// 云函数：修改项目
// 权限：admin / mentor 可改任意项目；leader 只能改「自己负责的项目」
//
// 项目组：memberIds（包含负责人）。规则：
//   - 负责人必须在成员名单里
//   - 想移除某个成员时，如果他是负责人 → 先换负责人
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const VALID_STATUS = ['未开始', '进行中', '已完成', '已暂停']

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

/** 老数据兜底：没有 memberIds 时按负责人一人成组 */
function memberIdsOf(p) {
  if (Array.isArray(p.memberIds) && p.memberIds.length > 0) return p.memberIds.slice()
  return p.leaderId ? [p.leaderId] : []
}

/** 校验一批 openid 都是已注册用户 */
async function checkMembers(ids) {
  const arr = Array.from(new Set(ids.filter(Boolean)))
  if (arr.length === 0) return { ok: true, ids: [] }
  if (arr.length > 100) return { ok: false, message: '项目组成员不能超过 100 人' }
  const r = await db.collection('users')
    .where({ _openid: _.in(arr) })
    .limit(100)
    .get()
  if (r.data.length !== arr.length) {
    return { ok: false, message: '有成员不存在，请刷新成员列表后重试' }
  }
  return { ok: true, ids: arr }
}

/**
 * 账号状态闸门（注册审核机制的核心，服务端强制）
 *   status: pending(待审核) / active(已通过) / rejected(已拒绝) / blocked(已禁用)
 *   没有 status 字段的老账号（上线前就在用的）按 active 处理
 */
function notApproved(caller) {
  const st = (caller && caller.status) || 'active'
  if (st === 'active') return null
  if (st === 'pending') return { success: false, code: 'PENDING', message: '账号待审核，请等待导员或管理员审核' }
  if (st === 'rejected') return { success: false, code: 'REJECTED', message: '申请未通过，可在申请页修改后重新提交' }
  return { success: false, code: 'BLOCKED', message: '账号已被禁用，请联系管理员' }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, message: '获取用户身份失败' }

  const projectId = event && event.projectId
  if (!projectId) return { success: false, message: '缺少 projectId' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    const __gate = notApproved(caller)
    if (__gate) return __gate

    const role = caller.role || 'member'
    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'

    // ---------- 取项目 ----------
    let project
    try {
      const pr = await db.collection('projects').doc(projectId).get()
      project = pr.data
    } catch (e) {
      return { success: false, message: '项目不存在或已被删除' }
    }

    // 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
    const isLeaderOfProject = !!project.leaderId && project.leaderId === openid

    // 现有项目组成员（老数据兜底为「负责人一人成组」）
    const memberIds = memberIdsOf(project)

    // admin 与导师可改任意项目；leader 只能改自己负责的
    if (!isAdmin && !isMentor && !isLeaderOfProject) {
      return { success: false, message: '没有修改该项目的权限' }
    }

    // ---------- 组装更新字段 ----------
    const patch = {}

    if (event.name !== undefined) {
      const name = String(event.name).trim()
      if (!name) return { success: false, message: '项目名称不能为空' }
      if (name.length > 30) return { success: false, message: '项目名称不超过 30 字' }
      patch.name = name
    }

    if (event.description !== undefined) {
      const description = String(event.description).trim()
      if (description.length > 200) return { success: false, message: '项目描述不超过 200 字' }
      patch.description = description
    }

    if (event.status !== undefined) {
      if (!VALID_STATUS.includes(event.status)) {
        return { success: false, message: '非法状态：' + event.status }
      }
      patch.status = event.status
    }

    if (event.progress !== undefined) {
      const p = Number(event.progress)
      if (Number.isNaN(p) || p < 0 || p > 100) {
        return { success: false, message: '进度必须是 0~100 的数字' }
      }
      patch.progress = Math.round(p)
    }

    // ---------- 项目组：先算成员名单，再校验负责人（两者可能同一次一起改） ----------
    let nextMembers = memberIds      // 改完之后的成员名单
    let nextLeader = project.leaderId || ''
    let membersChanged = false
    let leaderChanged = false

    const canEditGroup = isAdmin || isMentor || isLeaderOfProject

    // 1) 成员名单
    if (event.memberIds !== undefined) {
      if (!canEditGroup) {
        return { success: false, message: '只有管理员、导师或该项目负责人可以调整项目组' }
      }
      if (!Array.isArray(event.memberIds)) {
        return { success: false, message: 'memberIds 必须是数组' }
      }

      const checked = await checkMembers(event.memberIds)
      if (!checked.ok) return { success: false, message: checked.message }

      if (checked.ids.length === 0) {
        return { success: false, message: '项目组至少要有一个成员' }
      }

      nextMembers = checked.ids
      membersChanged = true
    }

    // 2) 负责人（必须在【改完之后】的成员名单里）
    if (event.leaderId !== undefined) {
      if (!canEditGroup) {
        return { success: false, message: '只有管理员、导师或该项目负责人可以更换项目负责人' }
      }
      if (event.leaderId) {
        const checked = await checkMembers([event.leaderId])
        if (!checked.ok) return { success: false, message: checked.message }
        if (!nextMembers.includes(event.leaderId)) {
          nextMembers = nextMembers.concat([event.leaderId])
          membersChanged = true
        }
      }
      nextLeader = event.leaderId
      leaderChanged = true
    }

    // 3) 老项目（没有 memberIds）即使只换负责人，也要把成员名单落库
    if (!membersChanged && leaderChanged) {
      nextMembers = nextMembers.slice()
      if (nextLeader && !nextMembers.includes(nextLeader)) nextMembers.push(nextLeader)
      membersChanged = true
    }

    // 4) 成员名单里不能没有负责人
    if (membersChanged) {
      if (nextMembers.length === 0) {
        return { success: false, message: '项目组至少要有一个成员' }
      }
      if (nextLeader && !nextMembers.includes(nextLeader)) {
        return { success: false, message: '负责人必须在项目组里：请先更换负责人，或把他保留在成员名单中' }
      }
      patch.memberIds = nextMembers
    }
    if (leaderChanged) patch.leaderId = nextLeader

    if (Object.keys(patch).length === 0) {
      return { success: false, message: '没有需要更新的字段' }
    }

    await db.collection('projects').doc(projectId).update({
      data: { ...patch, updateTime: db.serverDate() }
    })

    return { success: true, message: '修改成功', updated: Object.keys(patch) }
  } catch (err) {
    console.error('[updateProject] 失败:', err)
    return { success: false, message: '修改失败：' + (err.errMsg || err.message || err) }
  }
}
