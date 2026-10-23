<template>

<view class="page">

	<!-- 顶部说明 -->
	<view class="hero">
		<text class="hero-hi">{{ heroTitle }}</text>
		<text class="hero-role">{{ heroSub }}</text>
	</view>

	<view v-if="loading" class="loading-text">加载中…</view>

	<!-- ============ 待审核（已提交，等审核）============ -->
	<view v-else-if="status === 'pending'" class="card">
		<view class="st-row">
			<view class="st-dot st-dot-pending"></view>
			<text class="t-title">申请已提交，等待审核</text>
		</view>
		<text class="t-sub t-mt12">
			导员或管理员通过后你就能进入系统。审核通常在 1~2 天内完成，可以点下面「刷新状态」随时查看。
		</text>

		<view class="info-box">
			<view class="info-row"><text class="t-weak">姓名</text><text class="t-body">{{ apply.realName }}</text></view>
			<view class="info-row"><text class="t-weak">学号</text><text class="t-body">{{ apply.studentId || '未填' }}</text></view>
			<view class="info-row"><text class="t-weak">提交时间</text><text class="t-body">{{ apply.time }}</text></view>
			<text class="t-sub t-mt12">{{ apply.reason }}</text>
		</view>

		<button class="btn-block" :disabled="refreshing" @click="refresh">
			{{ refreshing ? '检查中…' : '刷新状态' }}
		</button>
		<button class="btn btn-plain btn-block-plain" size="mini" @click="editApply">修改申请内容</button>
	</view>

	<!-- ============ 被拒绝（可重新提交）============ -->
	<view v-else-if="status === 'rejected'" class="card">
		<view class="st-row">
			<view class="st-dot st-dot-rejected"></view>
			<text class="t-title">申请未通过</text>
		</view>
		<text class="t-sub t-mt12">原因：{{ rejectReason || '未说明' }}</text>
		<text class="t-sub t-mt6">你可以修改申请内容后重新提交。</text>
		<button class="btn-block t-mt12" @click="editApply">重新提交申请</button>
	</view>

	<!-- ============ 被禁用 ============ -->
	<view v-else-if="status === 'blocked'" class="card">
		<view class="st-row">
			<view class="st-dot st-dot-blocked"></view>
			<text class="t-title">账号已被禁用</text>
		</view>
		<text class="t-sub t-mt12">{{ blockReason || '请联系实验室管理员了解原因。' }}</text>
		<text class="t-weak t-mt12">如需恢复，请联系实验室管理员在后台处理。</text>
	</view>

	<!-- ============ 填申请表 ============ -->
	<view v-else>
		<view class="card">
			<text class="t-title">申请加入</text>
			<text class="t-sub t-mt6">这是实验室内部使用的系统，需要导员或管理员审核通过后才能查看项目与任务。</text>

			<view class="field t-mt12">
				<text class="label">真实姓名 *</text>
				<input class="input" v-model="form.realName" placeholder="方便导员核对，如：张三" maxlength="20" />
			</view>

			<view class="field">
				<text class="label">学号</text>
				<input class="input" v-model="form.studentId" placeholder="如：2023xxxxxx（可不填）" maxlength="30" />
			</view>

			<view class="field">
				<text class="label">申请说明 *</text>
				<textarea
					class="textarea"
					v-model="form.reason"
					placeholder="简单说明你的身份与来意，如：我是 2023 级电气专业，想加入视觉识别组"
					maxlength="200"
				/>
			</view>

			<button class="btn-block" :disabled="submitting" @click="submit">
				{{ submitting ? '提交中…' : '提交申请' }}
			</button>

			<text class="hint">提交后请等待导员或管理员审核；通过后重新进入即可使用。</text>
		</view>
	</view>

</view>

</template>

<script>

import { ensureLogin, loadPerm } from '@/utils/perm.js'
import { api } from '@/utils/api.js'

export default {

	data() {
		return {
			loading: true,
			refreshing: false,
			submitting: false,
			status: 'pending',
			role: 'member',
			nickName: '',
			apply: { realName: '', studentId: '', reason: '', time: '' },
			rejectReason: '',
			blockReason: '',
			form: { realName: '', studentId: '', reason: '' }
		}
	},

	computed: {
		heroTitle() {
			if (this.status === 'active') return '已通过审核'
			if (this.status === 'pending') return '等待审核'
			if (this.status === 'rejected') return '申请未通过'
			if (this.status === 'blocked') return '账号已禁用'
			return '申请加入'
		},
		heroSub() {
			if (this.status === 'active') return '正在进入系统…'
			return '实验室项目进度管理系统 · 内部使用，需审核'
		}
	},

	async onShow() {
		await this.load()
	},

	methods: {

		async load() {
			this.loading = true
			try {
				await ensureLogin()
			} catch (e) {}
			try {
				const res = await api.applyStatus()
				this.status = res.status || 'pending'
				this.role = res.role || 'member'
				this.nickName = res.nickName || ''
				this.apply = res.apply || { realName: '', studentId: '', reason: '', time: '' }
				this.rejectReason = res.rejectReason || ''
				this.blockReason = res.blockReason || ''

				// 已通过 → 预填表单并自动进系统
				if (this.status === 'active') {
					uni.showToast({ title: '审核已通过', icon: 'success' })
					setTimeout(() => uni.reLaunch({ url: '/pages/home/home' }), 800)
					return
				}
				// 被拒绝/待审核 → 表单预填已有内容，方便修改重提
				this.form.realName = this.apply.realName || this.nickName || ''
				this.form.studentId = this.apply.studentId || ''
				this.form.reason = this.apply.reason || ''
			} catch (e) {
				console.error('[pending] 加载状态失败:', e)
			} finally {
				this.loading = false
			}
		},

		async refresh() {
			if (this.refreshing) return
			this.refreshing = true
			// 清权限缓存，强制重新拉状态
			await loadPerm(true)
			await this.load()
			this.refreshing = false
			if (this.status !== 'active') uni.showToast({ title: '还在审核中', icon: 'none' })
		},

		editApply() {
			this.status = 'form'
		},

		async submit() {
			if (this.submitting) return
			const realName = (this.form.realName || '').trim()
			const reason = (this.form.reason || '').trim()
			if (!realName) { uni.showToast({ title: '请填写真实姓名', icon: 'none' }); return }
			if (!reason) { uni.showToast({ title: '请填写申请说明', icon: 'none' }); return }

			this.submitting = true
			try {
				const res = await api.applySubmit({
					realName,
					studentId: (this.form.studentId || '').trim(),
					reason
				})
				this.status = res.status || 'pending'
				await this.load()
			} catch (e) {
				console.error('[pending] 提交申请失败:', e)
			} finally {
				this.submitting = false
			}
		}

	}

}

</script>

<style>

/* 状态点 */
.st-row{
	display:flex;
	align-items:center;
}

.st-dot{
	width:16rpx;
	height:16rpx;
	border-radius:50%;
	margin-right:16rpx;
	flex-shrink:0;
}

.st-dot-pending{ background:#FF9500; }
.st-dot-rejected{ background:#FF3B30; }
.st-dot-blocked{ background:#8E8E93; }

/* 申请信息小卡片 */
.info-box{
	background:rgba(120,120,128,0.08);
	border-radius:16rpx;
	padding:24rpx;
	margin-top:24rpx;
}

.info-row{
	display:flex;
	justify-content:space-between;
	padding:8rpx 0;
}

/* 次按钮 */
.btn-plain{
	background:rgba(120,120,128,0.12);
	color:#007AFF;
}

.btn-block-plain{
	display:block;
	width:100%;
	margin:20rpx 0 0;
	border-radius:20rpx;
	font-size:28rpx;
	line-height:2.6;
	border:none;
}

.btn-block-plain::after{ border:none; }

</style>
