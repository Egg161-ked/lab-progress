// 云函数：新建任务（布置任务）
// 权限：admin 任意项目；leader 仅自己负责的项目
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const VALID_STATUS = ['未开始', '进行中', '已完成', '已暂停']

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

    // ---------- 项目与权限 ----------
    let project
    try {
      const pr = await db.collection('projects').doc(projectId).get()
      project = pr.data
    } catch (e) {
      return { success: false, message: '项目不存在或已被删除' }
    }

    // 项目负责人是【项目级身份】：只要项目是他负责的就能建任务，
    // 不要求全局角色是「组长」（交接文档：负责人与全局角色解耦）
    const isLeaderOfProject = !!project.leaderId && project.leaderId === openid
    if (!isAdmin && !isMentor && !isLeaderOfProject) {
      return { success: false, message: '只有管理员、导师或该项目负责人可以创建任务' }
    }

    // ---------- 参数校验 ----------
    const title = String((event && event.title) || '').trim()
    if (!title) return { success: false, message: '任务标题不能为空' }
    if (title.length > 50) return { success: false, message: '任务标题不超过 50 字' }

    const description = String((event && event.description) || '').trim()
    if (description.length > 300) return { success: false, message: '任务描述不超过 300 字' }

    const status = VALID_STATUS.includes(event && event.status) ? event.status : '未开始'

    let progress = Number((event && event.progress) || 0)
    if (Number.isNaN(progress)) progress = 0
    progress = Math.max(0, Math.min(100, Math.round(progress)))

    // 负责人（可空 = 未指派）：按项目组规则，只能指派给【本项目组成员】
    let assignUser = ''
    if (event && event.assignUser) {
      const memberIds = Array.isArray(project.memberIds) && project.memberIds.length > 0
        ? project.memberIds
        : (project.leaderId ? [project.leaderId] : [])
      if (!memberIds.includes(event.assignUser)) {
        return { success: false, message: '只能把任务指派给项目组成员，请先把他加入项目组' }
      }
      assignUser = event.assignUser
    }

    const deadline = String((event && event.deadline) || '')

    const res = await db.collection('tasks').add({
      data: {
        title,
        description,
        projectId,
        assignUser,
        deadline,
        status,
        progress,
        creatorId: openid,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return { success: true, message: '任务创建成功', taskId: res._id }
  } catch (err) {
    console.error('[createTask] 失败:', err)
    return { success: false, message: '创建失败：' + (err.errMsg || err.message || err) }
  }
}
