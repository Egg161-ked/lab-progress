// 云函数：成员列表（支持按昵称搜索、按角色筛选）
// 权限：所有已建号用户可查看（只读）
//
// 头像说明：云存储默认「仅创建者可读写」，前端 <image src="cloud://..."> 渲染
//   别人的头像会失败。这里在服务端批量换成一个临时的 https 链接
//   （avatarTempUrl），前端优先用它，取不到时再退回 fileID。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const users = db.collection('users')

/** 批量把头像 fileID 换成临时链接：{ fileID: url } */
async function avatarUrlMap(list) {
  const ids = list.map((u) => u.avatarUrl).filter((x) => x && String(x).startsWith('cloud://'))
  if (ids.length === 0) return {}
  try {
    const r = await cloud.getTempFileURL({ fileList: Array.from(new Set(ids)) })
    const map = {}
    ;(r.fileList || []).forEach((f) => {
      if (f.tempFileURL) map[f.fileID] = f.tempFileURL
    })
    return map
  } catch (e) {
    console.warn('[getMembers] 取头像临时链接失败:', e)
    return {}
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  try {
    // 调用者必须已建号
    const me = await db.collection('users').where({ _openid: openid }).get()
    if (me.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }
    // 管理员、导师、组长都能看到成员 openid（用于指定项目/任务负责人）
    const callerRole = me.data[0].role || 'member'
    const canSeeOpenid = ['admin', 'mentor', 'leader'].includes(callerRole)

    const keyword = ((event && event.keyword) || '').trim()
    const role = ((event && event.role) || '').trim()
    const memberId = (event && event.memberId) || ''
    const limit = Math.min(Number((event && event.limit) || 100) || 100, 100)

    // 查单个成员（详情页用）
    if (memberId) {
      try {
        const one = await db.collection('users').doc(memberId).get()
        const u = one.data
        const amap = await avatarUrlMap([u])
        return {
          success: true,
          member: {
            _id: u._id,
            nickName: u.nickName || '微信用户',
            avatarUrl: u.avatarUrl || '',
            avatarTempUrl: amap[u.avatarUrl] || '',
            role: u.role || 'member',
            direction: u.direction || '',
            intro: u.intro || '',
            groupId: u.groupId || '',
            isMe: u._openid === openid,
            archived: !!u.archived,
            archivedTime: u.archivedTime || '',
            createTime: u.createTime || null
          }
        }
      } catch (e) {
        return { success: false, message: '成员不存在' }
      }
    }

    const where = {}
    if (keyword) {
      where.nickName = db.RegExp({ regexp: keyword, options: 'i' })
    }
    if (role) {
      where.role = role
    }

    // 归档成员默认不返回（毕业的人不该再出现在成员列表、指派下拉、统计里）
    //   memberStatus: 'active'（默认）| 'archived' | 'all'
    const memberStatus = ((event && event.memberStatus) || 'active').trim()
    if (memberStatus === 'archived') {
      where.archived = true
    } else if (memberStatus !== 'all') {
      where.archived = db.command.neq(true)
    }

    let query = db.collection('users')
    if (Object.keys(where).length > 0) {
      query = query.where(where)
    }

    const res = await query.limit(limit).get()

    const amap = await avatarUrlMap(res.data)

    const members = res.data.map((u) => ({
      _id: u._id,
      nickName: u.nickName || '微信用户',
      avatarUrl: u.avatarUrl || '',
      avatarTempUrl: amap[u.avatarUrl] || '',
      role: u.role || 'member',
      direction: u.direction || '',
      intro: u.intro || '',
      groupId: u.groupId || '',
      isMe: u._openid === openid,
      archived: !!u.archived,
      archivedTime: u.archivedTime || '',
      openid: canSeeOpenid ? (u._openid || '') : undefined,
      openidMasked: u._openid ? String(u._openid).slice(0, 6) + '...' : '',
      createTime: u.createTime || null
    }))

    return {
      success: true,
      members,
      total: members.length
    }
  } catch (err) {
    console.error('[getMembers] 失败:', err)
    return { success: false, message: '获取成员失败：' + (err.errMsg || err.message || err) }
  }
}
