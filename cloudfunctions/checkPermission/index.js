// 云函数：查询当前用户的角色与权限矩阵
// 前端用它统一控制按钮显隐；云函数侧仍会独立校验（不信任前端）
//
// 角色定义（2026-10 调整：导师权限扩展）
//   admin  超级管理员：项目/任务/成员全部权限
//   mentor 导师：可新建/修改项目、新建/修改/删除任务、指派任务负责人；
//                可任命组长或普通成员（不能授予超管）
//   leader 组长：管理自己负责项目下的任务
//   member 普通成员：只读；可更新自己任务的进度与状态
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '获取用户身份失败' }
  }

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()

    if (userRes.data.length === 0) {
      return { success: false, message: '用户不存在，请先进入小程序完成登录' }
    }

    const user = userRes.data[0]
    const role = user.role || 'member'
    // 账号状态：pending 待审核 / active 已通过 / rejected 已拒绝 / blocked 已禁用
    // 这里不拦（前端要拿它决定跳哪个页面），业务云函数里才强制拦
    const status = user.status || 'active'

    const isAdmin = role === 'admin'
    const isMentor = role === 'mentor'
    const isLeader = role === 'leader'

    // 可任命的角色清单：导师只能任命组长 / 普通成员
    let assignableRoles = []
    if (isAdmin) assignableRoles = ['admin', 'mentor', 'leader', 'member']
    else if (isMentor) assignableRoles = ['leader', 'member']

    return {
      success: true,
      role,
      status,
      canReview: isAdmin || isMentor,
      userInfo: {
        _id: user._id,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        role,
        status
      },
      permission: {
        // ---------- 项目（导师也能建/改项目） ----------
        canCreateProject: isAdmin || isMentor || isLeader,
        canEditProject: isAdmin || isMentor || isLeader,   // leader 仅限自己负责的项目（云函数再校验）
        canDeleteProject: isAdmin,
        canChooseLeader: isAdmin || isMentor,              // 建/改项目时能否指定负责人

        // ---------- 任务（导师也可建/改/删任务） ----------
        canCreateTask: isAdmin || isMentor || isLeader,
        canEditTask: isAdmin || isMentor || isLeader,
        canDeleteTask: isAdmin || isMentor || isLeader,
        canAssignTask: isAdmin || isMentor || isLeader,

        // 成员可更新"自己名下任务"的进度/状态
        canUpdateOwnTask: true,

        // ---------- 成员管理 ----------
        canManageMember: isAdmin || isMentor,     // 导师可修改成员资料
        canManageRole: isAdmin || isMentor,       // 导师可任命组长/降回普通成员
        canAssignAdmin: isAdmin,                  // 只有超管能授予超管
        assignableRoles,                          // 前端角色下拉的可选项

        isReadOnly: false
      }
    }
  } catch (err) {
    console.error('[checkPermission] 失败:', err)
    return { success: false, message: '权限查询失败：' + (err.errMsg || err.message || err) }
  }
}
