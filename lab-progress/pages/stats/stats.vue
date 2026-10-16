<template>

<view class="page">

	<!-- 滚动后出现的吸顶毛玻璃标题 -->
	<view class="nav-blur" v-if="navShow">
		<text class="nav-blur-title">{{ navTitle }}</text>
	</view>

	<view class="hero">
		<text class="hero-hi">进度统计</text>
		<text class="hero-role">统计日期：{{ today }}</text>
	</view>

	<!-- 总览：四个指标 -->
	<view class="overview">
		<view class="ov-item" v-for="k in overview" :key="k.label">
			<text class="ov-num" :class="k.tone">{{ k.value }}</text>
			<text class="ov-label">{{ k.label }}</text>
		</view>
	</view>

	<!-- 状态分布 -->
	<view class="card">
		<view class="dist-row">
			<view class="dist-item" v-for="d in dist" :key="d.label">
				<text class="badge" :class="'badge-' + d.key">{{ d.value }}</text>
				<text class="dist-label">{{ d.label }}</text>
			</view>
		</view>
		<view class="pg">
			<view class="pg-bar">
				<view class="pg-fill" :class="doneRate >= 100 ? 'pg-fill-done' : ''" :style="{ width: doneRate + '%' }"></view>
			</view>
			<text class="pg-text">{{ doneRate }}%</text>
		</view>
		<text class="t-weak t-mt12">整体完成率 {{ doneRate }}% ｜ 任务平均进度 {{ avgProgress }}%</text>
	</view>

	<view class="sec">
		<text class="sec-title">各项目进度</text>
	</view>

	<view class="card" v-for="p in projRows" :key="p.id">
		<view class="t-row">
			<text class="t-title t-ellipsis t-flex1">{{ p.name }}</text>
			<text class="t-sub">{{ p.doneCount }}/{{ p.taskCount }} 完成</text>
		</view>

		<view class="pg">
			<view class="pg-bar">
				<view class="pg-fill" :class="p.progress >= 100 ? 'pg-fill-done' : ''" :style="{ width: p.progress + '%' }"></view>
			</view>
			<text class="pg-text">{{ p.progress }}%</text>
		</view>

		<view class="card-meta">
			<text class="t-weak">任务平均 {{ p.avgProgress }}%</text>
			<text class="t-weak" :class="p.overdueCount > 0 ? 't-danger' : ''">
				{{ p.overdueCount > 0 ? '逾期 ' + p.overdueCount : '无逾期' }}
			</text>
		</view>
	</view>

	<view class="sec">
		<text class="sec-title">成员任务分布</text>
	</view>

	<view class="card" v-for="m in memberRows" :key="m.id">
		<view class="t-row">
			<view class="t-row-left">
				<view class="avatar-sm">
					<text class="avatar-sm-text">{{ m.initial }}</text>
				</view>
				<text class="t-title">{{ m.name }}</text>
			</view>
			<text class="badge" :class="'role-' + m.roleKey">{{ m.roleName }}</text>
		</view>
		<text class="t-weak t-mt6">
			共 {{ m.total }} 项 ｜ 已完成 {{ m.done }} ｜ 进行中 {{ m.doing }}{{ m.overdue > 0 ? ' ｜ 逾期 ' + m.overdue : '' }}
		</text>
	</view>

	<view v-if="loading" class="loading-text">加载中…</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, roleText } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			navShow: false,
			navTitle: '',
			loading: true,
			today: '',
			totals: {
				projects: 0, tasks: 0, done: 0, doing: 0, todo: 0,
				paused: 0, overdue: 0, doneRate: 0, avgProgress: 0
			},
			projects: [],
			members: [],
			// 哑数据
			overview: [],
			dist: [],
			projRows: [],
			memberRows: [],
			doneRate: 0,
			avgProgress: 0
		}
	},

	async onLoad() {
		try {
			await ensureLogin()
		} catch (e) {}
		await loadPerm()
		await this.load()
	},

	// 返回本页时静默刷新统计（任务进度可能已被改动）
	onShow() {
		if (this._firstShowDone) {
			this.load(true)
		} else {
			this._firstShowDone = true
		}
	},

	async onPullDownRefresh() {
		await this.load()
		uni.stopPullDownRefresh()
	},

	// 滚动超过 80px 显示吸顶毛玻璃标题（iOS 大标题收起的效果）
	onPageScroll(e) {
		const show = (e && e.scrollTop ? e.scrollTop : 0) > 80
		if (show) {
			const t = '进度统计'
			if (t !== this.navTitle) this.navTitle = t
		}
		if (show !== this.navShow) this.navShow = show
	},

	methods: {

		refreshRows() {
			const t = this.totals || {}
			this.doneRate = Number(t.doneRate) || 0
			this.avgProgress = Number(t.avgProgress) || 0

			this.overview = [
				{ label: '项目数', value: t.projects || 0, tone: 'ov-blue' },
				{ label: '任务数', value: t.tasks || 0, tone: 'ov-blue' },
				{ label: '完成率', value: (t.doneRate || 0) + '%', tone: 'ov-green' },
				{ label: '逾期', value: t.overdue || 0, tone: (t.overdue || 0) > 0 ? 'ov-red' : 'ov-gray' }
			]

			this.dist = [
				{ key: 'todo', label: '未开始', value: t.todo || 0 },
				{ key: 'doing', label: '进行中', value: t.doing || 0 },
				{ key: 'done', label: '已完成', value: t.done || 0 },
				{ key: 'paused', label: '已暂停', value: t.paused || 0 }
			]

			this.projRows = this.projects.map((p) => ({
				id: p._id,
				name: p.name || '未命名项目',
				progress: Number(p.progress) || 0,
				avgProgress: Number(p.avgProgress) || 0,
				taskCount: p.taskCount || 0,
				doneCount: p.doneCount || 0,
				overdueCount: p.overdueCount || 0
			}))

			this.memberRows = this.members.map((m) => {
				const name = m.nickName || '成员'
				return {
					id: m._id,
					name,
					initial: name.slice(0, 1),
					roleKey: m.role || 'member',
					roleName: roleText(m.role),
					total: m.total || 0,
					done: m.done || 0,
					doing: m.doing || 0,
					overdue: m.overdue || 0
				}
			})
		},

		async load(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.getTaskStats(silent)
				this.today = res.today || ''
				this.totals = res.totals || this.totals
				this.projects = res.projects || []
				this.members = res.members || []
			} catch (e) {
				console.error('[stats] 加载失败:', e)
			} finally {
				this.loading = false
			}
			this.refreshRows()
		}

	}

}

</script>

<style>

/* ---------- 总览四指标 ---------- */
.overview{
	display:flex;
	background:#fff;
	border-radius:20rpx;
	padding:30rpx 0;
	box-shadow:0 4rpx 16rpx rgba(0,0,0,0.06);
	margin-bottom:20rpx;
}

.ov-item{
	flex:1;
	text-align:center;
}

.ov-num{
	display:block;
	font-size:40rpx;
	font-weight:600;
	letter-spacing:-0.6rpx;
	line-height:1.2;
	font-feature-settings:"tnum";
}

.ov-blue{ color:#007AFF; }
.ov-green{ color:#34C759; }
.ov-red{ color:#FF3B30; }
.ov-gray{ color:#8E8E93; }

.ov-label{
	display:block;
	font-size:22rpx;
	color:#8E8E93;
	margin-top:6rpx;
}

/* ---------- 状态分布 ---------- */
.dist-row{
	display:flex;
	justify-content:space-between;
	margin-bottom:8rpx;
}

.dist-item{
	display:flex;
	align-items:center;
}

.dist-label{
	font-size:22rpx;
	color:#6C6C70;
	margin-left:8rpx;
}

/* ---------- 成员行 ---------- */
.avatar-sm{
	width:52rpx;
	height:52rpx;
	border-radius:50%;
	background:rgba(0,122,255,0.12);
	display:flex;
	align-items:center;
	justify-content:center;
	margin-right:16rpx;
	flex-shrink:0;
}

.avatar-sm-text{
	font-size:26rpx;
	color:#007AFF;
	line-height:1;
}

/* 角色徽章（与任务状态徽章不是一套，单独用 role-*） */
/* 角色徽章（浅底 + 同色深字，与状态徽章同一套观感） */
.role-admin{ color:#FF3B30; background:rgba(255,59,48,0.14); }
.role-mentor{ color:#AF52DE; background:rgba(175,82,222,0.14); }
.role-leader{ color:#007AFF; background:rgba(0,122,255,0.12); }
.role-member{ color:#6C6C70; background:rgba(120,120,128,0.12); }

.card-meta{
	display:flex;
	justify-content:space-between;
	margin-top:14rpx;
}

</style>
