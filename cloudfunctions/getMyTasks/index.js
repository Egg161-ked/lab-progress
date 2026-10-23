// 云函数：我的任务（当前登录用户被指派的所有任务，跨项目）
// 返回时补上项目名称，便于列表直接展示
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
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

  try {
    // 调用者必须已建号
    const meRes = await db.collection('users').where({ _openid: openid }).get()
    if (meRes.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    const me = meRes.data[0]
    const __gate = notApproved(me)
    if (__gate) return __gate

    // 我负责的任务
    const res = await db.collection('tasks')
      .where({ assignUser: openid })
      .limit(200)
      .get()

    const tasks = res.data

    // 补项目名
    const projectIds = [...new Set(tasks.map((t) => t.projectId).filter(Boolean))]
    const pmap = {}
    if (projectIds.length > 0) {
      const ps = await db.collection('projects')
        .where({ _id: _.in(projectIds) })
        .limit(100)
        .get()
      ps.data.forEach((p) => {
        pmap[p._id] = { name: p.name || '未命名项目', status: p.status || '' }
      })
    }

    const enriched = tasks.map((t) => ({
      ...t,
      projectName: (pmap[t.projectId] && pmap[t.projectId].name) || '未知项目',
      projectStatus: (pmap[t.projectId] && pmap[t.projectId].status) || '',
      assignUserName: me.nickName || '微信用户'
    }))

    // 按截止日期排序（无截止的排最后）
    enriched.sort((a, b) => {
      const da = a.deadline || '9999-99-99'
      const db_ = b.deadline || '9999-99-99'
      return da < db_ ? -1 : (da > db_ ? 1 : 0)
    })

    // ---------- 我负责的项目（作为项目负责人被指派的大任务） ----------
    // 说明：项目负责人（leaderId = 我）也是"指派给我的活儿"，
    //       之前只返回了任务，导致被指派项目的人在小程序里看不到它。
    const myProjectRes = await db.collection('projects')
      .where({ leaderId: openid })
      .limit(50)
      .get()

    let myProjects = []
    if (myProjectRes.data.length > 0) {
      const pids = myProjectRes.data.map((p) => p._id)
      const allTasksRes = await db.collection('tasks')
        .where({ projectId: _.in(pids) })
        .limit(500)
        .get()
      const allTasks = allTasksRes.data

      myProjects = myProjectRes.data.map((p) => {
        const list = allTasks.filter((t) => t.projectId === p._id)
        return {
          _id: p._id,
          name: p.name || '未命名项目',
          description: p.description || '',
          status: p.status || '',
          progress: Number(p.progress) || 0,
          taskCount: list.length,
          doneCount: list.filter((t) => t.status === '已完成').length,
          overdueCount: list.filter(
            (t) => t.deadline && t.status !== '已完成' && t.deadline < todayStr()
          ).length
        }
      })
    }

    return {
      success: true,
      tasks: enriched,
      total: enriched.length,
      myProjects,
      myProjectCount: myProjects.length,
      myName: me.nickName || '微信用户',
      myRole: me.role || 'member'
    }
  } catch (err) {
    console.error('[getMyTasks] 失败:', err)
    return { success: false, message: '获取我的任务失败：' + (err.errMsg || err.message || err) }
  }
}
