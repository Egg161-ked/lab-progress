<template>

<view class="page">

	<view class="hero">
		<text class="hero-hi">注册审核</text>
		<text class="hero-role">待审核 {{ pendingCount }} 人 · 只有导员和管理员能看这一页</text>
	</view>

	<!-- 筛选 -->
	<view class="chips">
		<text
			v-for="f in filters"
			:key="f.value"
			class="chip"
			:class="filter === f.value ? 'chip-on' : ''"
			@click="setFilter(f.value)"
		>
			{{ f.label }}
		</text>
	</view>

	<view v-if="loading" class="loading-text">加载中…</view>

	<view v-else-if="count === 0" class="empty-state">
		<view class="empty-art">
			<view class="empty-doc">
				<view class="empty-doc-line"></view>
				<view class="empty-doc-line empty-doc-line-short"></view>
			</view>
		</view>
		<text class="empty-title">{{ filter === 'pending' ? '没有待审核的申请' : '这里还没有记录' }}</text>
		<text class="empty-tip">有新同学扫码申请后会出现在这里</text>
	</view>

	<!-- 申请卡片 -->
	<view class="card" v-for="m in list" :key="m.id">
		<view class="t-row">
			<view class="t-row-left">
				<view class="avatar-text">{{ m.initial }}</view>
				<view class="name-box">
					<text class="t-title t-ellipsis">{{ m.realName || m.nickName }}</text>
					<text class="t-weak">微信昵称：{{ m.nickName }}</text>
				</view>
			</view>
			<text class="badge" :class="'st-' + m.status">{{ m.statusText }}</text>
		</view>

		<view class="info-box">
			<view class="info-row" v-if="m.studentId">
				<text class="t-weak">学号</text>
				<text class="t-body">{{ m.studentId }}</text>
			</view>
			<view class="info-row" v-if="m.applyTime">
				<text class="t-weak">申请时间</text>
				<text class="t-body">{{ m.applyTime }}</text>
			</view>
			<text class="t-sub t-mt6">{{ m.reason || '（没有填写申请说明）' }}</text>
			<view class="info-row t-mt6" v-if="m.status === 'rejected' && m.rejectReason">
				<text class="t-weak">拒绝原因</text>
				<text class="t-body t-danger">{{ m.rejectReason }}</text>
			</view>
		</view>

		<!-- 待审核：通过 / 拒绝 -->
		<view class="btn-row" v-if="m.status === 'pending'">
			<button class="btn btn-primary" size="mini" @click="approve(m)">通过</button>
			<button class="btn" size="mini" @click="reject(m)">拒绝</button>
			<button class="btn btn-danger" size="mini" @click="block(m)">禁用</button>
		</view>

		<!-- 已拒绝 / 已禁用：放回待审核 or 禁用 -->
		<view class="btn-row" v-else>
			<button class="btn btn-primary" size="mini" @click="approve(m)">直接通过</button>
			<button class="btn" size="mini" @click="restore(m)">放回待审核</button>
			<button v-if="m.status !== 'blocked'" class="btn btn-danger" size="mini" @click="block(m)">禁用</button>
		</view>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm, perm } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			loading: true,
			filter: 'pending',
			list: [],
			count: 0,
			pendingCount: 0,
			filters: [
				{ label: '待审核', value: 'pending' },
				{ label: '已拒绝', value: 'rejected' },
				{ label: '已禁用', value: 'blocked' },
				{ label: '全部', value: 'all' }
			]
		}
	},

	async onLoad() {
		try {
			await ensureLogin()
		} catch (e) {}
		const p = await loadPerm(true)
		if (!p.role || (p.role !== 'admin' && p.role !== 'mentor')) {
			uni.showToast({ title: '只有管理员或导师可以审核', icon: 'none' })
			setTimeout(() => uni.navigateBack(), 1200)
			return
		}
		await this.load()
	},

	// 从别处返回时刷新
	onShow() {
		if (this._loaded) this.load(true)
	},

	methods: {

		setFilter(v) {
			this.filter = v
			this.load()
		},

		async load(silent) {
			if (!silent) this.loading = true
			try {
				const res = await api.reviewList(this.filter)
				this.pendingCount = res.pendingCount || 0
				this.list = (res.list || []).map((m) => {
					const name = m.realName || m.nickName || '未命名'
					return {
						id: m._id,
						nickName: m.nickName || '微信用户',
						realName: m.realName || '',
						initial: name.slice(0, 1),
						studentId: m.studentId || '',
						reason: m.reason || '',
						applyTime: m.applyTime || '',
						status: m.status || 'pending',
						statusText: m.statusText || '',
						rejectReason: m.rejectReason || ''
					}
				})
				this.count = this.list.length
				this._loaded = true
			} catch (e) {
				this.list = []
				this.count = 0
			} finally {
				this.loading = false
			}
		},

		/** 通过（可选角色：默认普通成员） */
		approve(m) {
			const myRole = perm().role
			// 导师只能给组长/普通成员；管理员可以给全部
			const roles = myRole === 'admin'
				? [{ l: '普通成员', v: 'member' }, { l: '组长', v: 'leader' }, { l: '导师', v: 'mentor' }, { l: '管理员', v: 'admin' }]
				: [{ l: '普通成员', v: 'member' }, { l: '组长', v: 'leader' }]

			uni.showActionSheet({
				itemList: roles.map((r) => '通过并设为' + r.l),
				success: async (res) => {
					const role = roles[res.tapIndex].v
					try {
						await api.reviewApprove(m.id, role)
						await this.load(true)
					} catch (e) {
						console.error('[review] 通过失败:', e)
					}
				}
			})
		},

		reject(m) {
			uni.showModal({
				title: '拒绝申请',
				editable: true,
				placeholderText: '填写原因（他会看到，可以修改后重新申请）',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.reviewReject(m.id, res.content || '')
						await this.load(true)
					} catch (e) {
						console.error('[review] 拒绝失败:', e)
					}
				}
			})
		},

		block(m) {
			uni.showModal({
				title: '禁用该账号',
				content: '禁用后他不能再提交申请，历史数据保留。确定禁用？',
				editable: true,
				placeholderText: '可填原因（仅管理员可见）',
				confirmColor: '#FF3B30',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.reviewBlock(m.id, res.content || '')
						await this.load(true)
					} catch (e) {
						console.error('[review] 禁用失败:', e)
					}
				}
			})
		},

		restore(m) {
			uni.showModal({
				title: '放回待审核',
				content: '他需要重新提交申请吗？放回后状态变回「待审核」。',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await api.reviewRestore(m.id)
						await this.load(true)
					} catch (e) {
						console.error('[review] 恢复失败:', e)
					}
				}
			})
		}

	}

}

</script>

<style>

.name-box{
	flex:1;
	overflow:hidden;
	margin-left:20rpx;
}

.info-box{
	background:rgba(120,120,128,0.08);
	border-radius:16rpx;
	padding:22rpx;
	margin-top:20rpx;
}

.info-row{
	display:flex;
	justify-content:space-between;
	padding:6rpx 0;
}

/* 状态徽章（tinted） */
.st-pending{ color:#C93400; background:rgba(255,149,0,0.16); }
.st-rejected{ color:#D70015; background:rgba(255,59,48,0.14); }
.st-blocked{ color:#6C6C70; background:rgba(120,120,128,0.12); }
.st-active{ color:#248A3D; background:rgba(52,199,89,0.16); }

</style>
