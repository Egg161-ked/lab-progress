<template>

<view class="page">

	<view class="card">

		<view class="field">
			<text class="label">项目名称 *</text>
			<input
				class="input"
				v-model="form.name"
				placeholder="如：智能车项目"
				maxlength="30"
			/>
		</view>

		<view class="field">
			<text class="label">项目描述</text>
			<textarea
				class="textarea"
				v-model="form.description"
				placeholder="简单描述项目目标"
				maxlength="200"
			/>
		</view>

		<view class="field">
			<text class="label">状态</text>
			<picker :range="statusList" :value="statusIndex" @change="changeStatus">
				<view class="picker">{{ form.status }}</view>
			</picker>
		</view>

		<view class="field">
			<text class="label">进度：{{ form.progress }}%</text>
			<slider
				:min="0"
				:max="100"
				:value="form.progress"
				show-value
				@change="changeProgress"
			/>
		</view>

		<!-- ==================== 项目组 ==================== -->
		<view class="field">
			<text class="label">项目组成员（{{ memberCount }} 人）</text>

			<view v-if="canEditGroup" class="mem-list">
				<view
					class="mem"
					v-for="m in memList"
					:key="m.openid"
					@click="toggleMember(m)"
				>
					<view class="mem-main">
						<text class="mem-name">{{ m.name }}</text>
						<text class="mem-role">{{ m.roleText }}</text>
						<text v-if="m.isLeader" class="mem-tag">负责人</text>
					</view>
					<view v-if="m.selected" class="mem-check mem-check-on">
						<text class="mem-tick">✓</text>
					</view>
					<view v-else class="mem-check"></view>
				</view>

				<view v-if="memberCount === 0" class="hint">没有可选的成员</view>
			</view>

			<view v-else class="picker picker-disabled">{{ groupText }}</view>

			<text class="hint">
				点成员即可加入 / 移出项目组；任务只能指派给项目组成员。
			</text>
		</view>

		<!-- 负责人：必须是项目组成员 -->
		<view class="field" v-if="canEditGroup">
			<text class="label">项目负责人</text>
			<picker
				:range="leaderNames"
				:value="leaderIndex"
				@change="changeLeader"
			>
				<view class="picker">{{ leaderName }}</view>
			</picker>
			<text class="hint">负责人必须从已选成员里挑一个</text>
		</view>

		<view class="field" v-else>
			<text class="label">项目负责人</text>
			<view class="picker picker-disabled">{{ leaderName }}</view>
		</view>

		<button type="primary" :disabled="saving" @click="submit">
			{{ submitText }}
		</button>

	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm, currentOpenid, roleText as roleTextOf } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

const STATUS_LIST = ['未开始', '进行中', '已完成', '已暂停']

export default {

	data() {
		return {
			isEdit: false,
			projectId: '',
			saving: false,
			canEditGroup: false,      // 能否调整项目组（admin / 导师 / 该项目负责人）
			statusList: STATUS_LIST,
			members: [],              // 系统里的全部成员（含 openid）
			// ↓ 给模板用的"哑数据"：模板只绑一层字段。
			//   不要在模板里写 (x || []).length / 方法调用 / 索引比较，
			//   否则会与编译产物槽位错配（交接文档第十一章有记录）
			memList: [],              // [{ openid, name, roleText, selected, isLeader }]
			memberCount: 0,
			// picker 的 range 必须是【字符串数组】（给对象数组会渲染成 [object Object]），
			// 所以姓名与 openid 用两个平行数组，按下标对应
			leaderNames: [],
			leaderIds: [],
			leaderIndex: 0,
			leaderName: '（未指定）',
			groupText: '（无）',
			submitText: '创建项目',
			form: {
				name: '',
				description: '',
				status: '未开始',
				progress: 0,
				leaderId: '',
				memberIds: [],
				memberNames: []
			}
		}
	},

	computed: {
		statusIndex() {
			const i = STATUS_LIST.indexOf(this.form.status)
			return i >= 0 ? i : 0
		}
	},

	async onLoad(options) {
		this.projectId = (options && options.id) || ''
		this.isEdit = !!this.projectId
		this.submitText = this.isEdit ? '保存修改' : '创建项目'

		try {
			await ensureLogin()
		} catch (e) {}
		await loadPerm(true)

		if (this.isEdit) {
			await this.loadProject()
			this.computeGroupPerm()
			if (this.canEditGroup) await this.loadMembers()
		} else {
			// 新建：默认「我自己一人成组」，负责人也是我
			const me = currentOpenid() || ''
			this.canEditGroup = true
			this.form.leaderId = me
			this.form.memberIds = me ? [me] : []
			await this.loadMembers()
		}

		this.refreshMemList()
		this.refreshLeader()
	},

	methods: {

		/** 组编辑权限：admin / 导师可改任意项目；项目负责人（项目级身份）可改自己的项目 */
		computeGroupPerm() {
			const role = perm().role
			const isProjectLeader = !!this.form.leaderId && this.form.leaderId === currentOpenid()
			this.canEditGroup = role === 'admin' || role === 'mentor' || isProjectLeader
		},

		async loadMembers() {
			try {
				const res = await api.getMembers({})
				// 只有管理员/导师/组长能拿到 openid（getMembers 按角色控制）
				this.members = (res.members || []).filter((m) => m.openid)
			} catch (e) {
				this.members = []
			}
			// 勾选状态以项目里的成员名单为准；负责人若不在名单里则补上
			const ids = (this.form.memberIds || []).slice()
			if (this.form.leaderId && ids.indexOf(this.form.leaderId) < 0) ids.push(this.form.leaderId)
			this.form.memberIds = ids
		},

		async loadProject() {
			try {
				const res = await api.getProject(this.projectId)
				const pj = res.project
				if (!pj) {
					uni.showToast({ title: '项目不存在', icon: 'none' })
					return
				}
				this.form.name = pj.name || ''
				this.form.description = pj.description || ''
				this.form.status = pj.status || '未开始'
				this.form.progress = Number(pj.progress) || 0
				this.form.leaderId = pj.leaderId || ''
				this.form.memberIds = Array.isArray(pj.memberIds) ? pj.memberIds.slice() : []
				this.form.memberNames = Array.isArray(pj.memberNames) ? pj.memberNames.slice() : []
				this.groupText = this.form.memberNames.length ? this.form.memberNames.join('、') : '（无）'
			} catch (e) {
				console.error('[projectEdit] 加载项目失败:', e)
			}
		},

		/** 重算成员勾选列表 + 人数 */
		refreshMemList() {
			const ids = this.form.memberIds || []
			this.memList = this.members.map((m) => ({
				openid: m.openid,
				name: m.nickName || '微信用户',
				roleText: roleTextOf(m.role),
				selected: ids.indexOf(m.openid) >= 0,
				isLeader: m.openid === this.form.leaderId
			}))
			this.memberCount = this.memList.length
		},

		/** 重算负责人下拉（只能是已勾选的成员） */
		refreshLeader() {
			const ids = this.form.memberIds || []
			const picked = this.memList.filter((m) => ids.indexOf(m.openid) >= 0)
			this.leaderNames = picked.map((m) => m.name)
			this.leaderIds = picked.map((m) => m.openid)

			let idx = this.leaderIds.indexOf(this.form.leaderId)
			this.leaderIndex = idx >= 0 ? idx : 0

			if (idx >= 0) {
				this.leaderName = this.leaderNames[idx]
			} else if (this.form.leaderId) {
				// 没有编辑权限时 members 为空，用项目里带回来的名单兜底
				const i2 = ids.indexOf(this.form.leaderId)
				this.leaderName = (i2 >= 0 && this.form.memberNames[i2]) ? this.form.memberNames[i2] : '（负责人）'
			} else {
				this.leaderName = '（未指定）'
			}
			if (this.leaderNames.length === 0) this.leaderName = this.leaderName || '（未指定）'
		},

		changeStatus(e) {
			this.form.status = STATUS_LIST[Number(e.detail.value)] || '未开始'
		},

		changeProgress(e) {
			this.form.progress = e.detail.value
		},

		toggleMember(m) {
			const ids = (this.form.memberIds || []).slice()
			const i = ids.indexOf(m.openid)

			if (i >= 0) {
				// 负责人不能被移出项目组（服务端也会拦，这里提前说清楚）
				if (m.openid === this.form.leaderId) {
					uni.showToast({ title: '他是项目负责人，请先更换负责人', icon: 'none' })
					return
				}
				if (ids.length <= 1) {
					uni.showToast({ title: '项目组至少要留一个成员', icon: 'none' })
					return
				}
				ids.splice(i, 1)
			} else {
				ids.push(m.openid)
			}

			this.form.memberIds = ids
			if (ids.indexOf(this.form.leaderId) < 0) {
				this.form.leaderId = ids.length ? ids[0] : ''
			}
			this.refreshMemList()
			this.refreshLeader()
		},

		changeLeader(e) {
			const idx = Number(e.detail.value)
			const id = this.leaderIds[idx]
			if (id) this.form.leaderId = id
			this.refreshMemList()
			this.refreshLeader()
		},

		async submit() {
			if (this.saving) return

			const name = (this.form.name || '').trim()
			if (!name) {
				uni.showToast({ title: '请填写项目名称', icon: 'none' })
				return
			}
			if (this.canEditGroup && this.form.memberIds.length === 0) {
				uni.showToast({ title: '项目组至少要有一个成员', icon: 'none' })
				return
			}
			if (this.canEditGroup && this.form.leaderId && this.form.memberIds.indexOf(this.form.leaderId) < 0) {
				uni.showToast({ title: '负责人必须在项目组里', icon: 'none' })
				return
			}

			this.saving = true
			try {
				const payload = {
					name,
					description: this.form.description,
					status: this.form.status,
					progress: this.form.progress
				}
				if (this.canEditGroup) {
					payload.memberIds = this.form.memberIds
					payload.leaderId = this.form.leaderId
				}

				if (this.isEdit) {
					await api.updateProject({ projectId: this.projectId, ...payload })
				} else {
					await api.createProject(payload)
				}

				// 成功提示由 api 层统一弹出，停留足够久再返回，避免提示被顶掉
				setTimeout(() => uni.navigateBack(), 1500)
			} catch (e) {
				console.error('[projectEdit] 提交失败:', e)
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

.field{
	margin-bottom:32rpx;
}

.label{
	display:block;
	font-size:26rpx;
	color:#6C6C70;
	margin-bottom:12rpx;
}

.hint{
	display:block;
	font-size:22rpx;
	color:#8E8E93;
	margin-top:12rpx;
	line-height:1.5;
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

.picker{
	background:rgba(120,120,128,0.10);
	padding:18rpx;
	border-radius:10rpx;
	font-size:28rpx;
}

.picker-disabled{
	color:#C7C7CC;
}

/* ---------- 项目组成员勾选 ---------- */
.mem-list{
	background:rgba(120,120,128,0.06);
	border-radius:12rpx;
	padding:6rpx 20rpx;
}

.mem{
	display:flex;
	align-items:center;
	justify-content:space-between;
	padding:20rpx 0;
	border-bottom:1rpx solid rgba(60,60,67,0.12);
}

.mem-main{
	display:flex;
	align-items:center;
	flex:1;
	overflow:hidden;
}

.mem-name{
	font-size:28rpx;
	color:#1C1C1E;
}

.mem-role{
	font-size:22rpx;
	color:#8E8E93;
	margin-left:14rpx;
}

.mem-tag{
	font-size:20rpx;
	color:#007AFF;
	background:rgba(0,122,255,0.12);
	border-radius:6rpx;
	padding:2rpx 10rpx;
	margin-left:12rpx;
}

.mem-check{
	width:44rpx;
	height:44rpx;
	border-radius:50%;
	border:2rpx solid #d0d0d0;
	display:flex;
	align-items:center;
	justify-content:center;
	flex-shrink:0;
}

.mem-check-on{
	background:#007AFF;
	border-color:#007AFF;
}

.mem-tick{
	color:#fff;
	font-size:26rpx;
	line-height:1;
}

button{
	margin-top:20rpx;
}

</style>
