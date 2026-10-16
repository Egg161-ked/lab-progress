// 云函数：成员归档 / 恢复（毕业交接用）
//
// 背景：毕业生离开实验室后不该继续出现在成员列表、指派下拉和统计里，
//       但直接删用户会让历史数据断链（他负责过的任务、上传的附件、写的评论
//       都会变成"未知成员"）。所以采用【归档】= 软删除：
//
//   users.archived = true / false   （默认从成员列表、指派下拉、统计里隐藏）
//
// 归档前必须把他手上的活交接干净（服务端强校验，前端只是提前展示清单）：
//   1. 他负责的项目（projects.leaderId = 他）→ 必须指定新负责人
//   2. 未完成且指派给他的任务（tasks.assignUser = 他）→ 必须改派给别人或置为未指派
//   3. 他作为成员的项目 → 自动从 projects.memberIds 移除
//   （已完成的任务保留原负责人，历史真实，名字仍能正常显示）
//
// actions：
//   preview  查归档影响清单（他负责的项目 / 未完成任务 / 是否可归档）
//   archive  执行归档（带移交方案）
//   restore  恢复成员（取消归档；已移交的项目任务不会自动要回来）
//   list     已归档成员列表
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

async function getCaller(openid) {
  const r = await db.collection('users').where({ _openid: openid }).get()
  return r.data[0] || null
}

function nowText() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** 取某个成员要交接的项目（他负责的） */
async function findLedProjects(openid) {
  const r = await db.collection('projects').where({ leaderId: openid }).limit(100).get()
  return r.data
}

/** 取某个成员未完成、且指派给他的任务 */
async function findOpenAssignedTasks(openid) {
  const r = await db.collection('tasks')
    .where({ assignUser: openid, status: _.neq('已完成') })
    .limit(200)
    .get()
  return r.data
}

/** 他作为成员的项目（用于归档时从项目组移除） */
async function findMemberProjects(openid) {
  const r = await db.collection('projects').where({ memberIds: openid }).limit(100).get()
  return r.data
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = (event && event.action) || ''

  if (!openid) return { success: false, message: '获取用户身份失败' }

  try {
    const caller = await getCaller(openid)
    if (!caller) return { success: false, message: '用户不存在，请先进入小程序完成登录' }

    // ---------- 已归档成员列表（谁都能看，用于"已归档"筛选） ----------
    if (action === 'list') {
      const r = await db.collection('users').where({ archived: true }).limit(200).get()
      return {
        success: true,
        members: r.data.map((u) => ({
          _id: u._id,
          nickName: u.nickName || '微信用户',
          avatarUrl: u.avatarUrl || '',
          role: u.role || 'member',
          direction: u.direction || '',
          archivedTime: u.archivedTime || ''
        }))
      }
    }

    // ---------- 以下动作仅管理员 ----------
    const isAdmin = (caller.role || 'member') === 'admin'
    if (!isAdmin) return { success: false, message: '只有管理员可以归档/恢复成员' }

    const memberId = (event && event.memberId) || ''
    if (!memberId) return { success: false, message: '缺少 memberId' }

    let target
    try {
      const tr = await db.collection('users').doc(memberId).get()
      target = tr.data
    } catch (e) {
      return { success: false, message: '成员不存在' }
    }
    const targetOpenid = target._openid || ''

    // ---------- 归档影响清单 ----------
    if (action === 'preview') {
      const admins = await db.collection('users').where({ role: 'admin' }).count()
      const [ledProjects, openTasks, memberProjects] = await Promise.all([
        findLedProjects(targetOpenid),
        findOpenAssignedTasks(targetOpenid),
        findMemberProjects(targetOpenid)
      ])

      // 任务补上项目名，方便前端展示
      const projIds = Array.from(new Set(openTasks.map((t) => t.projectId).filter(Boolean)))
      const projName = {}
      for (const pid of projIds) {
        try {
          const p = await db.collection('projects').doc(pid).get()
          projName[pid] = (p.data && p.data.name) || ''
        } catch (e) {}
      }

      // 可选的接手人：在职成员（排除他自己）
      const activeUsers = await db.collection('users')
        .where({ archived: _.neq(true), _openid: _.neq(targetOpenid) })
        .limit(200)
        .get()

      return {
        success: true,
        member: {
          _id: target._id,
          nickName: target.nickName || '微信用户',
          role: target.role || 'member',
          archived: !!target.archived
        },
        ledProjects: ledProjects.map((p) => ({ _id: p._id, name: p.name || '未命名项目' })),
        openTasks: openTasks.map((t) => ({
          _id: t._id,
          title: t.title || '未命名任务',
          status: t.status || '',
          projectId: t.projectId || '',
          projectName: projName[t.projectId] || ''
        })),
        memberProjects: memberProjects.map((p) => ({ _id: p._id, name: p.name || '未命名项目' })),
        // 归档前的一致性检查
        canArchive: !!targetOpenid && targetOpenid !== openid &&
          !(target.role === 'admin' && admins.total <= 1),
        isSelf: targetOpenid === openid,
        isLastAdmin: target.role === 'admin' && admins.total <= 1,
        activeUsers: activeUsers.data.map((u) => ({
          openid: u._openid,
          nickName: u.nickName || '微信用户',
          role: u.role || 'member'
        }))
      }
    }

    // ---------- 执行归档 ----------
    if (action === 'archive') {
      if (!targetOpenid) return { success: false, message: '该成员缺少 openid，无法归档' }
      if (targetOpenid === openid) return { success: false, message: '不能归档自己' }
      if (target.archived) return { success: false, message: '该成员已经是归档状态' }

      const admins = await db.collection('users').where({ role: 'admin' }).count()
      if (target.role === 'admin' && admins.total <= 1) {
        return { success: false, message: '这是最后一个管理员，不能归档（请先指定新的管理员）' }
      }

      const ledProjects = await findLedProjects(targetOpenid)
      const openTasks = await findOpenAssignedTasks(targetOpenid)
      const memberProjects = await findMemberProjects(targetOpenid)

      // 移交方案
      const handovers = Array.isArray(event.projectHandovers) ? event.projectHandovers : []
      const taskHandovers = Array.isArray(event.taskHandovers) ? event.taskHandovers : []
      const hvMap = {}
      handovers.forEach((h) => { if (h && h.projectId) hvMap[h.projectId] = h.newLeaderId || '' })
      const tvMap = {}
      taskHandovers.forEach((h) => { if (h && h.taskId) tvMap[h.taskId] = h.newAssigneeId || '' })

      // 1) 他负责的项目必须都有新负责人
      for (const p of ledProjects) {
        const newLeader = hvMap[p._id]
        if (!newLeader) {
          return { success: false, message: `项目「${p.name || ''}」还没指定新负责人，无法归档` }
        }
        // 新负责人必须是在职用户
        const u = await db.collection('users').where({ _openid: newLeader, archived: _.neq(true) }).count()
        if (u.total === 0) {
          return { success: false, message: `项目「${p.name || ''}」指定的新负责人无效或已归档` }
        }
      }

      // 2) 未完成任务必须都有着落（改派或置空）
      const taskPlan = {}
      for (const t of openTasks) {
        if (!(t._id in tvMap)) {
          return { success: false, message: `任务「${t.title || ''}」还没处理（改派或置为未指派）` }
        }
        const next = tvMap[t._id]
        if (next) {
          const u = await db.collection('users').where({ _openid: next, archived: _.neq(true) }).count()
          if (u.total === 0) {
            return { success: false, message: `任务「${t.title || ''}」指定的新负责人无效或已归档` }
          }
        }
        taskPlan[t._id] = next
      }

      // 3) 真正写库
      const done = { projects: [], tasks: [], removedFrom: [] }

      for (const p of ledProjects) {
        const newLeader = hvMap[p._id]
        const memberIds = (Array.isArray(p.memberIds) ? p.memberIds : [])
          .filter((id) => id !== targetOpenid)
        if (memberIds.indexOf(newLeader) < 0) memberIds.push(newLeader)
        await db.collection('projects').doc(p._id).update({
          data: { leaderId: newLeader, memberIds, updateTime: db.serverDate() }
        })
        done.projects.push({ name: p.name, newLeader })
      }

      for (const t of openTasks) {
        await db.collection('tasks').doc(t._id).update({
          data: { assignUser: taskPlan[t._id] || '', updateTime: db.serverDate() }
        })
        done.tasks.push({ title: t.title, newAssignee: taskPlan[t._id] || '(未指派)' })
      }

      // 4) 从其余项目的项目组里移除他
      for (const p of memberProjects) {
        const already = ledProjects.some((x) => x._id === p._id)
        const ids = (Array.isArray(p.memberIds) ? p.memberIds : []).filter((id) => id !== targetOpenid)
        if (ids.length !== (p.memberIds || []).length) {
          if (ids.length === 0) {
            // 项目组不能为空：留一个负责人
            if (p.leaderId && p.leaderId !== targetOpenid) ids.push(p.leaderId)
          }
          if (ids.length > 0 && !already) {
            await db.collection('projects').doc(p._id).update({
              data: { memberIds: ids, updateTime: db.serverDate() }
            })
            done.removedFrom.push(p.name)
          }
        }
      }

      // 5) 标记归档
      await db.collection('users').doc(memberId).update({
        data: { archived: true, archivedTime: nowText(), archivedBy: openid }
      })

      return {
        success: true,
        message: `已归档「${target.nickName || '该成员'}」`,
        done
      }
    }

    // ---------- 恢复成员 ----------
    if (action === 'restore') {
      if (!target.archived) return { success: false, message: '该成员不是归档状态' }
      await db.collection('users').doc(memberId).update({
        data: { archived: false, archivedTime: '', updateTime: db.serverDate() }
      })
      return {
        success: true,
        message: `已恢复「${target.nickName || '该成员'}」（已移交的项目/任务不会自动要回来，需要的话手动调整）`
      }
    }

    return { success: false, message: '未知 action: ' + action }
  } catch (err) {
    console.error('[archiveMember] 失败:', err)
    return { success: false, message: '操作失败：' + (err.errMsg || err.message || err) }
  }
}
