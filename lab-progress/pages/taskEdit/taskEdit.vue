<template>

<view class="page">

	<view class="card">

		<view class="field">
			<text class="label">任务标题 *</text>
			<input
				class="input"
				v-model="form.title"
				placeholder="如：完成 PID 调参"
				maxlength="50"
			/>
		</view>

		<view class="field">
			<text class="label">任务描述</text>
			<textarea
				class="textarea"
				v-model="form.description"
				placeholder="说明任务要求"
				maxlength="300"
			/>
		</view>

		<!-- 指派负责人：只能从项目组成员里选 -->
		<view class="field">
			<text class="label">指派给（项目组成员）</text>
			<picker
				:range="assigneeOptions"
				:value="assigneeIndex"
				@change="changeAssignee"
			>
				<view class="picker">{{ assigneeName }}</view>
			</picker>
			<text class="hint">{{ groupHint }}</text>
		</view>

		<view class="field">
			<text class="label">截止日期</text>
			<picker mode="date" :value="form.deadline" @change="changeDeadline">
				<view class="picker">{{ form.deadline || '请选择日期' }}</view>
			</picker>
		</view>

		<view class="field">
			<text class="label">状态</text>
			<picker :range="statusList" :value="statusIndex" @change="changeStatus">
				<view class="picker">{{ form.status }}</view>
			</picker>
		</view>

		<view class="field">
			<text class="label">进度：{{ form.progress }}%</text>
			<slider :min="0" :max="100" :value="form.progress" show-value @change="changeProgress" />
		</view>

		<button type="primary" :disabled="saving" @click="submit">
			{{ saving ? '提交中…' : (isEdit ? '保存修改' : '创建任务') }}
		</button>

		<button
			v-if="isEdit && canDelete"
			class="del-btn"
			type="warn"
			:disabled="saving"
			@click="removeTask"
		>
			删除任务
		</button>

	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

const STATUS_LIST = ['未开始', '进行中', '已完成', '已暂停']

export default {

	data() {
		return {
			isEdit: false,
			taskId: '',
			projectId: '',
			saving: false,
			canDelete: false,
			statusList: STATUS_LIST,
			members: [],          // 系统全部成员（用于把 openid 换成姓名）
			groupMembers: [],     // 本项目组成员（可指派范围）
			// ↓ 给模板用的"哑数据"：模板只绑一层字段
			assigneeOptions: ['未指派'],
			assigneeIndex: 0,
			assigneeName: '未指派',
			groupCount: 0,
			groupHint: '正在加载项目组…',
			form: {
				title: '',
				description: '',
				assignUser: '',
				deadline: '',
				status: '未开始',
				progress: 0
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
		this.taskId = (options && options.id) || ''
		this.projectId = (options && options.projectId) || ''
		this.isEdit = !!this.taskId

		try {
			await ensureLogin()
		} catch (e) {}
		const p = await loadPerm(true)
		this.canDelete = !!p.canDeleteTask

		await this.loadMembers()

		if (this.isEdit) {
			await this.loadTask()
		}
		// 任务里的 projectId 才是最准的，拿到后再拉项目组
		await this.loadGroup()
		this.refreshAssignees()
	},

	methods: {

		async loadMembers() {
			try {
				const res = await api.getMembers({})
				this.members = (res.members || []).filter((m) => m.openid)
			} catch (e) {
				this.members = []
			}
		},

		/** 拉项目组成员：指派范围只能是他们 */
		async loadGroup() {
			if (!this.projectId) {
				this.groupLoaded = true
				return
			}
			try {
				const res = await api.getProject(this.projectId, true)
				const pj = res.project || {}
				const ids = Array.isArray(pj.memberIds) && pj.memberIds.length
					? pj.memberIds
					: (pj.leaderId ? [pj.leaderId] : [])
				const nameMap = {}
				;(pj.memberIds || []).forEach((id, i) => {
					nameMap[id] = (pj.memberNames || [])[i] || ''
				})
				this.groupMembers = ids.map((id) => {
					const m = this.members.find((x) => x.openid === id)
					return { openid: id, nickName: (m && m.nickName) || nameMap[id] || '成员' }
				})
			} catch (e) {
				console.error('[taskEdit] 加载项目组失败:', e)
				this.groupMembers = []
			}
			this.groupLoaded = true
		},

		async loadTask() {
			try {
				const res = await api.getTask(this.taskId)
				const t = res.task
				if (!t) {
					uni.showToast({ title: '任务不存在', icon: 'none' })
					return
				}
				this.projectId = t.projectId || this.projectId
				this.form.title = t.title || ''
				this.form.description = t.description || ''
				this.form.assignUser = t.assignUser || ''
				this.form.deadline = t.deadline || ''
				this.form.status = t.status || '未开始'
				this.form.progress = Number(t.progress) || 0
			} catch (e) {
				console.error('[taskEdit] 加载任务失败:', e)
			}
		},

		/** 重算指派下拉（只能是项目组成员）+ 提示文案 */
		refreshAssignees() {
			const opts = [{ openid: '', name: '未指派' }]
			this.groupMembers.forEach((m) => opts.push({ openid: m.openid, name: m.nickName }))
			this.assigneeOptions = opts.map((o) => o.name)
			this.groupCount = this.groupMembers.length

			let idx = 0
			for (let i = 0; i < opts.length; i++) {
				if (opts[i].openid && opts[i].openid === this.form.assignUser) { idx = i; break }
			}
			this.assigneeIndex = idx
			this.assigneeName = opts[idx].name

			// 当前负责人不在项目组里（历史数据）时说清楚
			if (this.form.assignUser && idx === 0) {
				const any = this.members.find((x) => x.openid === this.form.assignUser)
				this.assigneeName = any ? any.nickName + '（不在项目组）' : '（已失效）'
			}

			this.groupHint = `只能指派给项目组成员（当前 ${this.groupCount} 人）`
		},

		changeAssignee(e) {
			const idx = Number(e.detail.value)
			this.assigneeIndex = idx
			this.form.assignUser = idx === 0 ? '' : (this.groupMembers[idx - 1].openid || '')
			this.refreshAssignees()
		},

		changeDeadline(e) {
			this.form.deadline = e.detail.value
		},

		changeStatus(e) {
			this.form.status = STATUS_LIST[Number(e.detail.value)] || '未开始'
		},

		changeProgress(e) {
			this.form.progress = e.detail.value
		},

		async submit() {
			if (this.saving) return

			const title = (this.form.title || '').trim()
			if (!title) {
				uni.showToast({ title: '请填写任务标题', icon: 'none' })
				return
			}
			if (!this.isEdit && !this.projectId) {
				uni.showToast({ title: '缺少项目信息', icon: 'none' })
				return
			}

			this.saving = true
			try {
				if (this.isEdit) {
					await api.updateTask({
						taskId: this.taskId,
						title,
						description: this.form.description,
						assignUser: this.form.assignUser,
						deadline: this.form.deadline,
						status: this.form.status,
						progress: this.form.progress
					})
				} else {
					await api.createTask({
						projectId: this.projectId,
						title,
						description: this.form.description,
						assignUser: this.form.assignUser,
						deadline: this.form.deadline,
						status: this.form.status,
						progress: this.form.progress
					})
				}

				// 成功提示由 api 层统一弹出，停留足够久再返回
				setTimeout(() => uni.navigateBack(), 1500)
			} catch (e) {
				console.error('[taskEdit] 提交失败:', e)
			} finally {
				this.saving = false
			}
		},

		removeTask() {
			uni.showModal({
				title: '确认删除',
				content: '删除后不可恢复，确定删除该任务？',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.deleteTask(this.taskId)
						setTimeout(() => uni.navigateBack(), 1500)
					} catch (e) {
						console.error('[taskEdit] 删除失败:', e)
					}
				}
			})
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

.del-btn{
	margin-top:20rpx;
	background:#FF3B30;
}

</style>
