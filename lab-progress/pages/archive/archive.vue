<template>

<view class="page">

	<!-- 成员信息 -->
	<view class="card">
		<view class="t-row">
			<text class="t-xl t-flex1 t-ellipsis">{{ memberName }}</text>
			<text class="badge badge-plain">{{ memberRole }}</text>
		</view>
		<text class="t-sub t-mt6">归档后他会从成员列表、指派下拉和统计里消失；历史数据仍保留他的名字。</text>
	</view>

	<view v-if="loading" class="loading-text">正在检查他手上的活…</view>

	<view v-else-if="blockReason" class="card">
		<text class="t-title">不能归档</text>
		<text class="t-sub t-mt6">{{ blockReason }}</text>
	</view>

	<view v-else>

		<!-- ① 他负责的项目：必须指定新负责人 -->
		<view v-if="projCount > 0">
			<view class="sec">
				<text class="sec-title">他负责的项目（{{ projCount }}）</text>
				<text class="sec-extra">必须指定新负责人</text>
			</view>
			<view class="card" v-for="p in projRows" :key="p.id">
				<text class="t-title t-ellipsis">{{ p.name }}</text>
				<text class="label t-mt12">新负责人</text>
				<picker
					:range="p.options"
					:value="p.index"
					@change="pickProject($event, p)"
				>
					<view class="picker" :class="p.index < 0 ? 'picker-off' : ''">{{ p.chosenName }}</view>
				</picker>
			</view>
		</view>

		<!-- ② 未完成且指派给他的任务：必须改派或置空 -->
		<view v-if="taskCount > 0">
			<view class="sec">
				<text class="sec-title">未完成且指派给他的任务（{{ taskCount }}）</text>
				<text class="sec-extra">必须改派或置为未指派</text>
			</view>
			<view class="card" v-for="t in taskRows" :key="t.id">
				<text class="t-title t-ellipsis">{{ t.title }}</text>
				<text class="t-weak t-mt6">{{ t.projectName }} · {{ t.status }}</text>
				<text class="label t-mt12">改派给</text>
				<picker
					:range="t.options"
					:value="t.index"
					@change="pickTask($event, t)"
				>
					<view class="picker" :class="t.index < 0 ? 'picker-off' : ''">{{ t.chosenName }}</view>
				</picker>
			</view>
		</view>

		<!-- ③ 他参与的项目组：自动移除 -->
		<view v-if="memberProjCount > 0" class="card">
			<text class="t-title">他会从这些项目组里移除（{{ memberProjCount }}）</text>
			<text class="t-sub t-mt6">{{ memberProjNames }}</text>
		</view>

		<view v-if="projCount === 0 && taskCount === 0 && memberProjCount === 0" class="card">
			<text class="t-title">他没有未完成的活</text>
			<text class="t-sub t-mt6">可以直接归档。</text>
		</view>

		<!-- 提交 -->
		<button class="btn-block" :disabled="!ready || saving" @click="submit">
			{{ saving ? '归档中…' : (ready ? '确认归档' : '请先处理上面的项目与任务') }}
		</button>

		<text class="hint">归档是可恢复的：在成员页切到「已归档」，点进去可以「恢复成员」。但已移交的项目与任务不会自动要回来。</text>

	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			memberId: '',
			memberName: '',
			memberRole: '',
			loading: true,
			saving: false,
			blockReason: '',
			ready: false,
			// 哑数据
			userNames: [],
			userIds: [],
			projRows: [],
			projCount: 0,
			taskRows: [],
			taskCount: 0,
			memberProjNames: '',
			memberProjCount: 0
		}
	},

	async onLoad(options) {
		this.memberId = (options && options.id) || ''
		try {
			await ensureLogin()
		} catch (e) {}
		await loadPerm(true)
		await this.loadPreview()
	},

	methods: {

		async loadPreview() {
			this.loading = true
			try {
				const res = await api.archivePreview(this.memberId)
				const m = res.member || {}
				this.memberName = m.nickName || '该成员'
				this.memberRole = this.roleName(m.role)

				if (res.isSelf) this.blockReason = '不能归档自己'
				else if (res.isLastAdmin) this.blockReason = '这是最后一个管理员，请先指定新的管理员再归档'
				else if (!res.canArchive) this.blockReason = res.message || '当前不可归档'

				// 候选人（在职成员，排除他自己）
				const users = res.activeUsers || []
				this.userNames = ['（请选择）'].concat(users.map((u) => u.nickName))
				this.userIds = [''].concat(users.map((u) => u.openid))

				this.projRows = (res.ledProjects || []).map((p) => ({
					id: p._id,
					name: p.name,
					options: this.userNames,
					index: -1,
					chosenName: '（请选择新负责人）'
				}))
				this.projCount = this.projRows.length

				this.taskRows = (res.openTasks || []).map((t) => ({
					id: t._id,
					title: t.title,
					status: t.status,
					projectName: t.projectName || '',
					options: ['（未指派）'].concat(users.map((u) => u.nickName)),
					index: -1,
					chosenName: '（请选择或置为未指派）'
				}))
				this.taskCount = this.taskRows.length

				this.memberProjNames = (res.memberProjects || []).map((p) => p.name).join('、')
				this.memberProjCount = (res.memberProjects || []).length

				this.refreshReady()
			} catch (e) {
				this.blockReason = '检查失败，请返回重试'
			} finally {
				this.loading = false
			}
		},

		roleName(r) {
			if (r === 'admin') return '超级管理员'
			if (r === 'mentor') return '导师'
			if (r === 'leader') return '组长'
			return '普通成员'
		},

		refreshReady() {
			const projOk = this.projRows.every((p) => p.index > 0)
			const taskOk = this.taskRows.every((t) => t.index >= 0)
			this.ready = !this.blockReason && projOk && taskOk
		},

		pickProject(e, row) {
			const i = Number(e.detail.value)
			row.index = i
			row.chosenName = row.options[i]
			// 数组元素是对象引用，改完手动刷新计数依赖
			this.projRows = this.projRows.slice()
			this.refreshReady()
		},

		pickTask(e, row) {
			const i = Number(e.detail.value)
			row.index = i
			row.chosenName = row.options[i]
			this.taskRows = this.taskRows.slice()
			this.refreshReady()
		},

		async submit() {
			if (!this.ready || this.saving) return
			this.saving = true
			try {
				const projectHandovers = this.projRows.map((p) => ({
					projectId: p.id,
					newLeaderId: this.userIds[p.index]
				}))
				const taskHandovers = this.taskRows.map((t) => ({
					taskId: t.id,
					// 第 0 项是"（未指派）"
					newAssigneeId: t.index === 0 ? '' : this.userIds[t.index]
				}))

				await api.archiveMember({
					memberId: this.memberId,
					projectHandovers,
					taskHandovers
				})
				setTimeout(() => uni.navigateBack(), 1500)
			} catch (e) {
				console.error('[archive] 归档失败:', e)
			} finally {
				this.saving = false
			}
		}

	}

}

</script>

<style>

.hint{
	display:block;
	font-size:22rpx;
	color:#8E8E93;
	margin-top:24rpx;
	line-height:1.6;
}

</style>
