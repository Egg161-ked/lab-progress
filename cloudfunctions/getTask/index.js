// 云函数：查询单个任务详情（含负责人姓名）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
    const meRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    if (meRes.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    const __gate = notApproved(meRes.data[0])
    if (__gate) return __gate

    let task
    try {
      const tr = await db.collection('tasks').doc(taskId).get()
      task = tr.data
    } catch (e) {
      return { success: false, message: '任务不存在或已被删除' }
    }

    // 补负责人姓名
    let assignUserName = '未指派'
    if (task.assignUser) {
      const us = await db.collection('users').where({ _openid: task.assignUser }).limit(1).get()
      assignUserName = us.data.length > 0 ? (us.data[0].nickName || '微信用户') : '未知成员'
    }

    // 补所属项目的名称与负责人
    // why 前端需要 projectLeaderId：页面上的「上传成果 / 保存修改」按钮必须按【本项目】
    //     判定权限。只看全局权限位（canEditTask）的话，组长会在别人负责的项目里
    //     看到一堆用不了的按钮（服务端仍会拒绝，界面在骗人）。
    let projectName = ''
    let projectLeaderId = ''
    let projectMemberIds = []
    if (task.projectId) {
      try {
        const pr = await db.collection('projects').doc(task.projectId).get()
        const pj = pr.data || {}
        projectName = pj.name || ''
        projectLeaderId = pj.leaderId || ''
        projectMemberIds = (Array.isArray(pj.memberIds) && pj.memberIds.length > 0)
          ? pj.memberIds.slice()
          : (pj.leaderId ? [pj.leaderId] : [])
      } catch (e) {
        // 项目可能已被删除，忽略
      }
    }

    return {
      success: true,
      task: { ...task, assignUserName, projectName, projectLeaderId, projectMemberIds }
    }
  } catch (err) {
    console.error('[getTask] 失败:', err)
    return { success: false, message: '获取任务失败：' + (err.errMsg || err.message || err) }
  }
}
