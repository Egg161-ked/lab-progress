<template>

<view class="page">

	<view class="card" v-if="member">

		<view class="head">
			<image
				v-if="member.avatarTempUrl || member.avatarUrl"
				:src="member.avatarTempUrl || member.avatarUrl"
				class="avatar"
				mode="aspectFill"
			></image>
			<view v-else class="avatar avatar-empty">
				<text class="avatar-empty-text">无</text>
			</view>

			<view class="head-info">
				<text class="nickname">{{ member.nickName }}</text>
				<text class="badge" :class="'badge-' + member.role">{{ roleName(member.role) }}</text>
				<text v-if="member.isMe" class="me">（我）</text>
			</view>
		</view>

		<text class="perm-tip" :class="{ 'perm-tip-warn': !canEditProfile }">
			{{ permTip }}
		</text>

		<view class="field">
			<text class="label">角色</text>
			<picker
				:range="roleLabels"
				:value="roleIndex"
				:disabled="roleDisabled"
				@change="changeRole"
			>
				<view class="picker" :class="{ 'picker-disabled': roleDisabled }">
					{{ roleName(form.role) }}
				</view>
			</picker>
			<text v-if="roleHint" class="field-hint">{{ roleHint }}</text>
		</view>

		<view class="field">
			<text class="label">研究方向</text>
			<input
				class="input"
				:disabled="!canEditProfile"
				v-model="form.direction"
				placeholder="如：控制算法 / 嵌入式开发"
			/>
		</view>

		<view class="field">
			<text class="label">个人简介</text>
			<textarea
				class="textarea"
				:disabled="!canEditProfile"
				v-model="form.intro"
				placeholder="简单介绍一下自己"
				maxlength="200"
			/>
		</view>

		<button
			v-if="canEditProfile || canManageRole"
			type="primary"
			:disabled="saving"
			@click="save"
		>
			{{ saving ? '保存中…' : '保存' }}
		</button>

		<view v-else class="readonly-box">
			你只能查看该成员资料
		</view>

	</view>

	<view v-else class="empty">加载中…</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, roleText } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			memberId: '',
			member: null,
			saving: false,
			canManageMember: false,   // 可改资料（admin/mentor）
			canManageRole: false,     // 可改角色（admin/mentor）
			isMe: false,
			form: {
				role: 'member',
				direction: '',
				intro: ''
			}
		}
	},

	computed: {
		// 可任命的角色（由服务端权限矩阵给出：admin=全部，mentor=组长/普通成员）
		roleValues() {
			const list = perm().assignableRoles || []
			if (list.length > 0) return list
			return [this.form.role]   // 无任命权限时只用于展示
		},
		roleLabels() {
			return this.roleValues.map((r) => roleText(r))
		},
		roleIndex() {
			const i = this.roleValues.indexOf(this.form.role)
			return i >= 0 ? i : 0
		},
		// 不能改自己的角色；无任命权限也不能改
		roleDisabled() {
			if (!this.canManageRole) return true
			return !!(this.member && this.member.isMe)
		},
		roleHint() {
			if (this.member && this.member.isMe) {
				return '不能修改自己的角色（请让另一位管理员/导师操作）'
			}
			if (!this.canManageRole) return ''
			const list = this.roleValues.map((r) => roleText(r)).join(' / ')
			return '可任命为：' + list
		},
		canEditProfile() {
			return this.canManageMember || this.isMe
		},
		permTip() {
			const r = roleText(perm().role)
			if (this.canManageRole) return `当前角色：${r}，可修改该成员的角色与资料`
			if (this.canManageMember) return `当前角色：${r}，可修改该成员资料`
			if (this.isMe) return `当前角色：${r}，可修改自己的方向与简介`
			return `当前角色：${r}，只读`
		}
	},

	async onLoad(options) {
		this.memberId = options.id
		try {
			await ensureLogin()
		} catch (e) {}
		const p = await loadPerm(true)
		this.canManageMember = !!p.canManageMember
		this.canManageRole = !!p.canManageRole
		await this.getMember()
	},

	// 从其他页返回时静默刷新
	onShow() {
		if (this._firstShowDone) {
			this.getMember(true)
		} else {
			this._firstShowDone = true
		}
	},

	methods: {

		roleName(r) {
			return roleText(r)
		},

		/**
		 * 读取成员
		 * @param {boolean} silent 静默模式：不显示 loading
		 *   —— 保存成功后的刷新必须静默，否则 loading 会把"保存成功"提示顶掉
		 */
		async getMember(silent) {
			try {
				const res = await api.getMember(this.memberId, silent)
				const m = res.member
				if (!m) {
					uni.showToast({ title: '成员不存在', icon: 'none' })
					return
				}
				this.member = m
				this.isMe = !!m.isMe
				this.form.role = m.role || 'member'
				this.form.direction = m.direction || ''
				this.form.intro = m.intro || ''
			} catch (e) {
				console.error('[memberDetail] 加载失败:', e)
			}
		},

		changeRole(e) {
			const idx = Number(e.detail.value)
			const r = this.roleValues[idx]
			if (r) this.form.role = r
		},

		async save() {
			if (this.saving) return
			this.saving = true

			try {
				const payload = {
					memberId: this.memberId,
					direction: this.form.direction,
					intro: this.form.intro
				}

				// 只有可任命角色、且不是自己、且角色确实变了，才提交角色
				if (this.canManageRole && !this.roleDisabled && this.form.role !== this.member.role) {
					payload.role = this.form.role
				}

				const res = await api.updateMember(payload)
				// 成功提示由 api 层统一弹出（延迟 150ms，避免被 loading 吞掉）

				if (res && res.updated) {
					console.log('[memberDetail] 已更新字段:', res.updated)
				}

				// 静默刷新，避免 loading 顶掉刚弹出的成功提示
				await this.getMember(true)
			} catch (e) {
				console.error('[memberDetail] 保存失败:', e)
			} finally {
				this.saving = false
			}
		}

	}

}

</script>

<style>

.page{
	padding:24rpx;
}

.card{
	background:#fff;
	padding:36rpx;
	border-radius:20rpx;
	box-shadow:0 5rpx 20rpx rgba(0,0,0,0.08);
}

.head{
	display:flex;
	align-items:center;
	margin-bottom:20rpx;
}

.avatar{
	width:120rpx;
	height:120rpx;
	border-radius:50%;
	background:rgba(120,120,128,0.10);
	margin-right:24rpx;
}

.avatar-empty{
	display:flex;
	align-items:center;
	justify-content:center;
}

.avatar-empty-text{
	font-size:22rpx;
	color:#C7C7CC;
}

.head-info{
	flex:1;
}

.nickname{
	font-size:34rpx;
	font-weight:bold;
	display:block;
	margin-bottom:10rpx;
}

.badge{
	font-size:20rpx;
	color:#fff;
	padding:4rpx 14rpx;
	border-radius:20rpx;
}

.badge-admin{ background:#FF3B30; }
.badge-leader{ background:#007AFF; }
.badge-mentor{ background:#AF52DE; }
.badge-member{ background:#8E8E93; }

.me{
	font-size:22rpx;
	color:#34C759;
	margin-left:10rpx;
}

.perm-tip{
	display:block;
	font-size:24rpx;
	color:#007AFF;
	background:rgba(0,122,255,0.08);
	padding:12rpx 16rpx;
	border-radius:10rpx;
	margin-bottom:20rpx;
}

.perm-tip-warn{
	color:#C93400;
	background:rgba(255,149,0,0.12);
}

.field{
	margin-bottom:30rpx;
}

.label{
	display:block;
	font-size:26rpx;
	color:#6C6C70;
	margin-bottom:12rpx;
}

.picker{
	background:rgba(120,120,128,0.10);
	padding:18rpx;
	border-radius:10rpx;
	font-size:28rpx;
}

.picker-disabled{
	color:#C7C7CC;
}

.field-hint{
	display:block;
	font-size:22rpx;
	color:#C7C7CC;
	margin-top:10rpx;
}

.input{
	background:rgba(120,120,128,0.10);
	padding:18rpx;
	border-radius:10rpx;
	font-size:28rpx;
}

.textarea{
	background:rgba(120,120,128,0.10);
	padding:18rpx;
	border-radius:10rpx;
	font-size:28rpx;
	width:100%;
	height:160rpx;
	box-sizing:border-box;
}

.readonly-box{
	text-align:center;
	color:#8E8E93;
	font-size:26rpx;
	padding:20rpx 0;
}

.empty{
	text-align:center;
	color:#8E8E93;
	margin-top:120rpx;
}

button{
	margin-top:10rpx;
}

</style>
