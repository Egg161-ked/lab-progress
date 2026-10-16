// 云函数：查询项目
//   - 不传参数：返回全部项目列表
//   - 传 projectId：返回单个项目（编辑页/详情页用）
//
// 项目组说明：
//   projects.memberIds = [openid, ...]  项目组成员（包含负责人）
//   projects.leaderId  = openid         项目负责人（必须是成员之一）
//   老数据没有 memberIds 时，这里按「负责人一人成组」兜底，
//   避免历史项目直接不可用（迁移脚本会补上该字段）。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/** 取项目组成员：没有 memberIds 的老数据按负责人一人成组 */
function memberIdsOf(p) {
  if (Array.isArray(p.memberIds) && p.memberIds.length > 0) return p.memberIds.slice()
  return p.leaderId ? [p.leaderId] : []
}

/** 给项目补上成员姓名 / 负责人姓名 / 我在项目里的身份 */
async function enrich(list, meOpenid) {
  const ids = new Set()
  list.forEach((p) => {
    memberIdsOf(p).forEach((id) => ids.add(id))
    if (p.leaderId) ids.add(p.leaderId)
  })

  const nameMap = {}
  const arr = Array.from(ids).filter(Boolean)
  if (arr.length > 0) {
    // in 查询单次上限 100，够用
    const r = await db.collection('users')
      .where({ _openid: _.in(arr.slice(0, 100)) })
      .limit(100)
      .get()
    r.data.forEach((u) => { nameMap[u._openid] = u.nickName || '微信用户' })
  }

  return list.map((p) => {
    const memberIds = memberIdsOf(p)
    return {
      ...p,
      memberIds,
      memberNames: memberIds.map((id) => nameMap[id] || '未知成员'),
      leaderName: p.leaderId ? (nameMap[p.leaderId] || '未知成员') : '',
      myProjectRole: p.leaderId === meOpenid
        ? 'leader'
        : (memberIds.includes(meOpenid) ? 'member' : '')
    }
  })
}

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000) // 按北京时间算"今天"
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/**
 * 统计每个项目的任务数 / 已完成数 / 逾期数
 * why 首页项目卡要显示"3 个任务 · 已完成 1"，以前只能再拉一次任务列表。
 *     任务量不大，直接一次查出来在内存里分组即可（比聚合管道好维护）。
 */
async function taskStatsByProject() {
  const today = todayStr()
  const map = {}
  try {
    const r = await db.collection('tasks')
      .field({ projectId: true, status: true, deadline: true })
      .limit(1000)
      .get()
    r.data.forEach((t) => {
      const pid = t.projectId || ''
      if (!pid) return
      const item = map[pid] || (map[pid] = { taskCount: 0, doneCount: 0, overdueCount: 0 })
      item.taskCount++
      if (t.status === '已完成') item.doneCount++
      else if (t.deadline && t.deadline < today) item.overdueCount++
    })
  } catch (e) {
    console.warn('[getProjects] 统计任务数失败:', e)
  }
  return map
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  try {
    // 调用者必须已建号
    const me = await db.collection('users').where({ _openid: openid }).count()
    if (me.total === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }

    // ---------- 单个项目 ----------
    const projectId = event && event.projectId
    if (projectId) {
      try {
        const one = await db.collection('projects').doc(projectId).get()
        const [project] = await enrich([one.data], openid)
        const stat = (await taskStatsByProject())[projectId] || {}
        return {
          success: true,
          project: {
            ...project,
            taskCount: stat.taskCount || 0,
            doneCount: stat.doneCount || 0,
            overdueCount: stat.overdueCount || 0
          }
        }
      } catch (e) {
        return { success: false, message: '项目不存在或已被删除' }
      }
    }

    // ---------- 项目列表 ----------
    const res = await db.collection('projects').limit(100).get()
    const [projects, statMap] = await Promise.all([
      enrich(res.data, openid),
      taskStatsByProject()
    ])

    return {
      success: true,
      projects: projects.map((p) => {
        const s = statMap[p._id] || {}
        return {
          ...p,
          taskCount: s.taskCount || 0,
          doneCount: s.doneCount || 0,
          overdueCount: s.overdueCount || 0
        }
      })
    }
  } catch (err) {
    console.error('[getProjects] 失败:', err)
    return { success: false, message: '获取项目失败：' + (err.errMsg || err.message || err) }
  }
}
