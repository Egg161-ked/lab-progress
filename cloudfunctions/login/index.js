// 云函数：登录 / 用户资料
// 职责：
//   1. 静默登录：用 openid 查用户，不存在则自动建号（默认普通成员）
//   2. 更新资料：传入 userInfo（昵称/头像 fileID）时更新昵称与头像
// 返回统一结构：{ success, userInfo, openid, isNewUser }
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const users = db.collection('users')

// 新用户默认字段
const DEFAULT_FIELDS = {
  role: 'member',   // admin 管理员 / mentor 导师 / leader 组长 / member 普通成员
  groupId: '',
  direction: '',
  intro: ''
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || wxContext.FROM_OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败（openid 为空）' }
  }

  const profile = (event && event.userInfo) ? event.userInfo : null

  try {
    const userRes = await users.where({ _openid: openid }).get()

    // ---------- 新用户：自动建号 ----------
    if (userRes.data.length === 0) {
      // 第一个用户自动成为管理员并直接通过审核
      // why：否则部署完没人能进管理功能，而且会被注册审核闸门锁在门外。
      //      判断依据是"现有用户里有没有 admin"，与人数无关。
      //      其余新用户一律 pending（待审核），上线后陌生人进来要先申请。
      let role = DEFAULT_FIELDS.role
      let status = 'pending'
      try {
        const adminCount = await users.where({ role: 'admin' }).count()
        if (adminCount.total === 0) {
          role = 'admin'
          status = 'active'
        }
      } catch (e) {
        console.warn('[login] 检查管理员失败，按普通成员建号:', e)
      }

      const newUser = {
        _openid: openid,
        nickName: (profile && profile.nickName) || '微信用户',
        avatarUrl: (profile && profile.avatarUrl) || '',
        ...DEFAULT_FIELDS,
        role,
        status,
        apply: null,
        createTime: db.serverDate()
      }

      const addRes = await users.add({ data: newUser })

      return {
        success: true,
        userInfo: { ...newUser, _id: addRes._id },
        openid,
        isNewUser: true,
        becameAdmin: role === 'admin',
        needApproval: status !== 'active'
      }
    }

    // ---------- 老用户 ----------
    const user = userRes.data[0]

    // 传了资料就更新（头像/昵称）
    if (profile && (profile.nickName || profile.avatarUrl)) {
      const patch = {}
      if (profile.nickName) patch.nickName = profile.nickName
      if (profile.avatarUrl) patch.avatarUrl = profile.avatarUrl

      if (Object.keys(patch).length > 0) {
        await users.doc(user._id).update({ data: patch })
        Object.assign(user, patch)
      }
    }

    return {
      success: true,
      userInfo: user,
      openid,
      isNewUser: false
    }
  } catch (err) {
    console.error('[login] 执行失败:', err)
    return {
      success: false,
      message: '登录服务异常：' + (err && err.message ? err.message : '未知错误')
    }
  }
}
