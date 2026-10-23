// 云函数：修改任务（带完整权限校验）
//
// 权限规则（服务端强制，不信任前端）：
//   admin      —— 可改任意任务的全部字段
//   leader     —— 仅可改「自己负责项目」下任务的全部字段
//   mentor     —— 只读，不可修改
//   member     —— 仅可改「分配给自己的任务」的 progress / status
//
// 修复说明：原实现只校验 role 是否 admin/leader，导致任何 leader 都能改任意任务（越权）。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const ADMIN_ONLY_FIELDS = ['assignUser', 'deadline', 'title', 'description', 'projectId']

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
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

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  const taskId = event && event.taskId
  if (!taskId) {
    return { success: false, message: '缺少 taskId' }
  }

  try {
    // ---------- 1. 取调用者与角色 ----------
    const user = await getCaller(openid)
    if (!user) {
      return { success: false, message: '用户不存在，请重新进入小程序' }
    }

    // 账号状态闸门：未通过审核的账号不能访问业务数据
    {
      const __gate = notApproved(user)
      if (__gate) return __gate
    }
    const role = user.role || 'member'

    // ---------- 2. 取任务与所属项目 ----------
    let task
    try {
      const tr = await db.collection('tasks').doc(taskId).get()
      task = tr.data
    } catch (e) {
      return { success: false, message: '任务不存在或已被删除' }
    }

    let project = null
    if (task.projectId) {
      try {
        const pr = await db.collection('projects').doc(task.projectId).get()
        project = pr.data
      } catch (e) {
        project = null
      }
    }

    // ---------- 3. 判定权限 ----------
    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'
    // 项目负责人是【项目级身份】，与全局角色无关（交接文档：解耦决策）
    const isLeaderOfProject = !!project && !!project.leaderId && project.leaderId === openid
    const isAssignee = !!task.assignUser && task.assignUser === openid

    // 完整编辑权：admin、导师，或本项目的 leader
    const canFullEdit = isAdmin || isMentor || isLeaderOfProject

    // 成员自更新：只能动自己的任务，且只能改 progress / status
    const touchedOnlyProgress = ['progress', 'status'].some(
      (k) => event[k] !== undefined
    )
    const touchedAdminFields = ADMIN_ONLY_FIELDS.some((k) => event[k] !== undefined)
    const canSelfUpdate = isAssignee && touchedOnlyProgress && !touchedAdminFields

    if (!canFullEdit && !canSelfUpdate) {
      return {
        success: false,
        message: isAssignee
          ? '只能修改自己任务的进度和状态'
          : '没有修改该任务的权限'
      }
    }

    // ---------- 4. 组装更新字段 ----------
    const patch = {}
    if (event.progress !== undefined) {
      const p = Number(event.progress)
      if (Number.isNaN(p) || p < 0 || p > 100) {
        return { success: false, message: '进度必须是 0~100 的数字' }
      }
      patch.progress = p
    }
    if (event.status !== undefined) {
      patch.status = String(event.status)
    }

    if (canFullEdit) {
      if (event.assignUser !== undefined) {
        // 按项目组规则：只能指派给本项目组成员（空值 = 取消指派）
        if (event.assignUser) {
          const memberIds = (project && Array.isArray(project.memberIds) && project.memberIds.length > 0)
            ? project.memberIds
            : ((project && project.leaderId) ? [project.leaderId] : [])
          if (!memberIds.includes(event.assignUser)) {
            return { success: false, message: '只能把任务指派给项目组成员，请先把他加入项目组' }
          }
        }
        patch.assignUser = event.assignUser
      }
      if (event.deadline !== undefined) patch.deadline = event.deadline
      if (event.title !== undefined) patch.title = event.title
      if (event.description !== undefined) patch.description = event.description
    }

    if (Object.keys(patch).length === 0) {
      return { success: false, message: '没有需要更新的字段' }
    }

    // ---------- 5. 更新 ----------
    await db.collection('tasks').doc(taskId).update({
      data: {
        ...patch,
        updateTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: '修改成功',
      updated: Object.keys(patch),
      by: role
    }
  } catch (err) {
    console.error('[updateTask] 失败:', err)
    return { success: false, message: '修改失败：' + (err.errMsg || err.message || err) }
  }
}
