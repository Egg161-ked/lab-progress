/**
 * 登录态 + 权限缓存（全局单例）
 *
 * 用法：
 *   import { ensureLogin, loadPerm, perm, isMyTask } from '@/utils/perm.js'
 *   await ensureLogin()      // 静默登录（自动建号）
 *   await loadPerm()         // 拉取权限（带缓存）
 *   const p = perm()         // 读权限：p.canEditTask / p.canUpdateOwnTask ...
 *
 * 说明：前端权限只用于「控制按钮显隐、避免误操作」，
 *       真正的拦截在云函数侧（updateTask 等会独立校验）。
 */
import { api } from './api.js'

const state = {
	user: null,
	openid: '',
	perm: null
}

export const ROLE_TEXT = {
	admin: '超级管理员',
	mentor: '导师',
	leader: '组长',
	member: '普通成员'
}

/** 角色中文名 */
export function roleText(role) {
	return ROLE_TEXT[role] || '普通成员'
}

/** 静默登录（传 profile 则同时更新头像昵称） */
export async function ensureLogin(profile) {
	const res = await api.login(profile)
	state.user = res.userInfo || null
	state.openid = res.openid || ''
	return state.user
}

/** 读取当前登录用户 */
export function user() {
	return state.user
}

/** 读取 openid */
export function currentOpenid() {
	return state.openid
}

/**
 * 缓存是否有效
 * 作用：云端权限矩阵字段一旦升级（例如旧版返回 canEdit，新版返回 canEditTask），
 *       旧结构缓存必须作废并重新拉取，否则页面会拿到一堆 undefined，
 *       表现为"明明是管理员却显示只读"。
 */
function isValidPerm(p) {
	if (!p || typeof p !== 'object') return false
	return typeof p.canEditTask === 'boolean' &&
		typeof p.canManageMember === 'boolean' &&
		typeof p.canUpdateOwnTask === 'boolean'
}

/** 加载权限矩阵（默认走缓存，force=true 强制刷新） */
export async function loadPerm(force = false) {
	if (!force && isValidPerm(state.perm)) return state.perm

	try {
		const res = await api.checkPermission()
		state.perm = { role: res.role || 'member', ...(res.permission || {}) }
	} catch (e) {
		// 查不到权限时按最小权限处理（安全默认）
		state.perm = {
			role: 'member',
			canCreateProject: false,
			canEditProject: false,
			canDeleteProject: false,
			canChooseLeader: false,
			canCreateTask: false,
			canEditTask: false,
			canDeleteTask: false,
			canAssignTask: false,
			canUpdateOwnTask: true,
			canManageMember: false,
			canManageRole: false,
			canAssignAdmin: false,
			assignableRoles: [],
			isReadOnly: false
		}
	}
	return state.perm
}

/** 读权限（未加载或结构失效时返回最小权限） */
export function perm() {
	if (!isValidPerm(state.perm)) {
		return {
			role: (state.perm && state.perm.role) || 'member',
			canCreateProject: false,
			canEditProject: false,
			canDeleteProject: false,
			canChooseLeader: false,
			canCreateTask: false,
			canEditTask: false,
			canDeleteTask: false,
			canAssignTask: false,
			canUpdateOwnTask: false,
			canManageMember: false,
			canManageRole: false,
			canAssignAdmin: false,
			assignableRoles: [],
			isReadOnly: false,
			__invalid: true
		}
	}
	return state.perm
}

/** 该任务是否分配给当前用户 */
export function isMyTask(task) {
	return !!(task && task.assignUser && state.openid && task.assignUser === state.openid)
}

/** 清空缓存（退出登录时用） */
export function clearState() {
	state.user = null
	state.openid = ''
	state.perm = null
}

export default { ensureLogin, loadPerm, perm, user, currentOpenid, isMyTask, roleText, clearState }
