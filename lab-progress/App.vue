<script>
	import { CLOUD_ENV } from './utils/config.js'

	export default {

		onLaunch: function() {

			console.log('App Launch')

			// 初始化微信云开发
			if (wx.cloud) {

				wx.cloud.init({

					env: CLOUD_ENV,

					traceUser: true

				})

				console.log("云开发初始化成功")

			} else {

				console.log("当前环境不支持 wx.cloud")

			}

		},


		onShow: function() {

			console.log('App Show')

		},


		onHide: function() {

			console.log('App Hide')

		}

	}
</script>


<style>
/* ============================================================
 * 全局样式（C 阶段统一设计层 · Apple / iOS 风格）
 *
 * 质感不是靠加阴影，而是靠这几件事：
 *   1. 淡灰底 + 纯白卡片，**几乎不用阴影**（iOS 分组列表本身没有阴影）
 *   2. 徽章用「浅底 + 同色深字」的 tinted 风格，不用高饱和大色块
 *   3. 大标题 semibold + 负字距，正文层级拉开，留白给足
 *   4. 分隔用极淡 hairline，不画边框
 *   5. 圆角统一偏大：卡片 24rpx / 控件 20rpx / 胶囊 999rpx
 *
 * 色板（iOS 系统色）：
 *   蓝 #007AFF｜绿 #34C759｜橙 #FF9500｜红 #FF3B30｜紫 #AF52DE｜靛 #5856D6
 *   次要文字 #6C6C70｜更弱 #8E8E93｜占位 #C7C7CC
 *   分组底 #F2F2F7｜卡片 #FFFFFF｜控件填充 rgba(120,120,128,0.12)
 *   分隔线 rgba(60,60,67,0.12)
 *
 * 注意：小程序 WXSS 不支持 `*` 选择器，所以全部用 class。
 * ============================================================ */

page {
	background: #F2F2F7;
	color: #1C1C1E;
	font-size: 30rpx;
	line-height: 1.45;
}

/* ---------- 页面容器 ---------- */
.page {
	padding: 24rpx 32rpx 48rpx;
	box-sizing: border-box;
}

/* ---------- 卡片（分组列表观感：无阴影、大圆角） ---------- */
.card {
	background: #fff;
	border-radius: 24rpx;
	padding: 32rpx;
	margin-bottom: 24rpx;
	box-shadow: 0 1rpx 3rpx rgba(0, 0, 0, 0.03);
}

.card-flat {
	background: #fff;
	border-radius: 24rpx;
	padding: 32rpx;
	margin-bottom: 24rpx;
}

/* ---------- 文本层级 ---------- */
.t-xl {
	display: block;
	font-size: 40rpx;
	font-weight: 600;
	letter-spacing: -0.6rpx;
	color: #1C1C1E;
}

.t-title {
	display: block;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: -0.3rpx;
	color: #1C1C1E;
}

.t-body {
	display: block;
	font-size: 30rpx;
	color: #1C1C1E;
}

.t-sub {
	display: block;
	font-size: 26rpx;
	color: #6C6C70;
}

.t-weak {
	display: block;
	font-size: 22rpx;
	color: #8E8E93;
}

.t-danger {
	color: #FF3B30;
}

.t-primary {
	color: #007AFF;
}

.t-bold {
	font-weight: 600;
}

.t-mt6 {
	margin-top: 6rpx;
}

.t-mt12 {
	margin-top: 12rpx;
}

.t-mb12 {
	margin-bottom: 12rpx;
}

.t-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.t-row-left {
	display: flex;
	align-items: center;
	flex: 1;
	overflow: hidden;
}

.t-flex1 {
	flex: 1;
}

.t-ellipsis {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

/* ---------- 大标题区（Apple 式大标题 + 次级说明） ---------- */
.hero {
	padding: 20rpx 8rpx 32rpx;
}

.hero-hi {
	display: block;
	font-size: 56rpx;
	font-weight: 600;
	letter-spacing: -1.4rpx;
	line-height: 1.2;
	color: #1C1C1E;
}

.hero-role {
	display: block;
	font-size: 26rpx;
	color: #8E8E93;
	margin-top: 10rpx;
}

/* ---------- 分区标题（iOS 分组表头：小、灰、缩进） ---------- */
.sec {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin: 36rpx 8rpx 16rpx;
}

.sec-title {
	font-size: 26rpx;
	font-weight: 500;
	color: #6C6C70;
}

.sec-extra {
	font-size: 24rpx;
	color: #8E8E93;
}

/* ---------- 状态徽章：浅底 + 同色深字（tinted） ---------- */
.badge {
	display: inline-block;
	font-size: 22rpx;
	font-weight: 500;
	line-height: 1.7;
	padding: 2rpx 16rpx;
	border-radius: 999rpx;
	color: #6C6C70;
	background: rgba(120, 120, 128, 0.12);
	flex-shrink: 0;
}

.badge-todo {
	color: #6C6C70;
	background: rgba(120, 120, 128, 0.12);
}

.badge-doing {
	color: #007AFF;
	background: rgba(0, 122, 255, 0.12);
}

.badge-done {
	color: #248A3D;
	background: rgba(52, 199, 89, 0.16);
}

.badge-paused {
	color: #C93400;
	background: rgba(255, 149, 0, 0.16);
}

.badge-plain {
	color: #6C6C70;
	background: rgba(120, 120, 128, 0.12);
}

.badge-leader {
	color: #5856D6;
	background: rgba(88, 86, 214, 0.12);
}

/* ---------- 进度条：细、圆、淡轨 ---------- */
.pg {
	display: flex;
	align-items: center;
	margin-top: 20rpx;
}

.pg-bar {
	flex: 1;
	height: 10rpx;
	background: rgba(120, 120, 128, 0.16);
	border-radius: 999rpx;
	overflow: hidden;
}

.pg-fill {
	height: 10rpx;
	border-radius: 999rpx;
	background: #007AFF;
}

.pg-fill-done {
	background: #34C759;
}

.pg-text {
	font-size: 22rpx;
	color: #8E8E93;
	margin-left: 18rpx;
	width: 76rpx;
	text-align: right;
}

/* ---------- 按钮（填充 / 淡底两档，无边框） ---------- */
/* 小程序 button 默认带一圈 ::after 边框，这里统一去掉，靠自绘样式 */
button::after {
	border: none;
}

/* Apple HIG：可点区域不得小于 44×44pt（≈88rpx）。
   小程序 button 的 mini 尺寸只有约 60rpx，手指容易点不中，这里统一抬高。 */
button {
	min-height: 88rpx;
	line-height: 88rpx;
	box-sizing: border-box;
}

.btn-row {
	display: flex;
	flex-wrap: wrap;
	margin-top: 24rpx;
}

.btn {
	font-size: 28rpx;
	font-weight: 500;
	min-height: 88rpx;
	line-height: 88rpx;
	box-sizing: border-box;
	padding: 0 34rpx;
	margin: 0 16rpx 16rpx 0;
	border-radius: 20rpx;
	background: rgba(120, 120, 128, 0.12);
	color: #007AFF;
	border: none;
}

.btn::after {
	border: none;
}

.btn-primary {
	background: #007AFF;
	color: #fff;
}

.btn-danger {
	background: rgba(255, 59, 48, 0.12);
	color: #FF3B30;
}

.btn-block {
	display: block;
	width: 100%;
	margin: 28rpx 0 0;
	border-radius: 24rpx;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 96rpx;
	background: #007AFF;
	color: #fff;
	border: none;
}

.btn-block::after {
	border: none;
}

/* ---------- 列表行（hairline 分隔，最后一行不画） ---------- */
.list-item {
	padding: 26rpx 0;
	border-bottom: 1rpx solid rgba(60, 60, 67, 0.12);
}

.list-item:last-child {
	border-bottom: none;
	padding-bottom: 0;
}

.avatar {
	width: 84rpx;
	height: 84rpx;
	border-radius: 50%;
	background: rgba(120, 120, 128, 0.12);
	flex-shrink: 0;
}

.avatar-text {
	width: 84rpx;
	height: 84rpx;
	border-radius: 50%;
	background: rgba(0, 122, 255, 0.12);
	color: #007AFF;
	font-size: 32rpx;
	font-weight: 600;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}

/* ---------- 胶囊筛选（iOS 分段控件观感） ---------- */
.chips {
	display: flex;
	background: rgba(120, 120, 128, 0.12);
	border-radius: 999rpx;
	padding: 6rpx;
	margin-bottom: 24rpx;
}

.chip {
	flex: 1;
	text-align: center;
	font-size: 26rpx;
	min-height: 88rpx;
	line-height: 88rpx;
	box-sizing: border-box;
	border-radius: 999rpx;
	color: #1C1C1E;
}

.chip-on {
	background: #fff;
	font-weight: 600;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.10);
}

/* ---------- 表单 ---------- */
.field {
	margin-bottom: 32rpx;
}

.label {
	display: block;
	font-size: 26rpx;
	color: #6C6C70;
	margin-bottom: 14rpx;
}

.input {
	background: rgba(120, 120, 128, 0.10);
	height: 88rpx;
	line-height: 88rpx;
	padding: 0 24rpx;
	border-radius: 20rpx;
	font-size: 30rpx;
	box-sizing: border-box;
}

.textarea {
	background: rgba(120, 120, 128, 0.10);
	padding: 22rpx 24rpx;
	border-radius: 20rpx;
	font-size: 30rpx;
	width: 100%;
	height: 200rpx;
	box-sizing: border-box;
}

.picker {
	background: rgba(120, 120, 128, 0.10);
	padding: 22rpx 24rpx;
	border-radius: 20rpx;
	font-size: 30rpx;
	color: #1C1C1E;
}

.picker-off {
	color: #C7C7CC;
}

.hint {
	display: block;
	font-size: 22rpx;
	color: #8E8E93;
	margin-top: 14rpx;
	line-height: 1.5;
}

/* ---------- 空状态 / 加载 ---------- */
.empty-state {
	padding: 120rpx 48rpx;
	text-align: center;
}

.empty-icon {
	width: 140rpx;
	height: 140rpx;
	border-radius: 50%;
	background: rgba(120, 120, 128, 0.10);
	margin: 0 auto 28rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 56rpx;
	color: #C7C7CC;
}

.empty-title {
	display: block;
	font-size: 30rpx;
	font-weight: 500;
	color: #6C6C70;
	margin-bottom: 10rpx;
}

.empty-tip {
	display: block;
	font-size: 24rpx;
	color: #8E8E93;
	line-height: 1.5;
}

.loading-text {
	text-align: center;
	color: #8E8E93;
	font-size: 26rpx;
	padding: 100rpx 0;
}

/* ============================================================
 * 触感与加载体验
 * ============================================================ */

/* ---------- 按压反馈 ----------
 * 用法：可点的卡片/行加 hover-class="pressed" hover-stay-time="60"
 * 按钮不用管：小程序默认的 hover-class 就是 button-hover，下面统一了样式 */
.pressed {
	background: rgba(120, 120, 128, 0.09);
}

.card {
	transition: background 0.12s ease;
}

.button-hover {
	opacity: 0.86;
}

/* ---------- 骨架屏 ----------
 * 用法：<view v-if="loading"><view class="sk-card" v-for="i in 3" :key="i">…</view></view> */
.sk-card {
	background: #fff;
	border-radius: 24rpx;
	padding: 32rpx;
	margin-bottom: 24rpx;
	box-shadow: 0 1rpx 3rpx rgba(0, 0, 0, 0.03);
}

.sk-line {
	height: 28rpx;
	border-radius: 8rpx;
	background: linear-gradient(
		90deg,
		rgba(120, 120, 128, 0.10) 25%,
		rgba(120, 120, 128, 0.18) 37%,
		rgba(120, 120, 128, 0.10) 63%
	);
	background-size: 400% 100%;
	animation: sk-shimmer 1.4s ease infinite;
}

.sk-line-mid {
	width: 62%;
}

.sk-line-short {
	width: 38%;
}

.sk-line-bar {
	height: 10rpx;
	border-radius: 999rpx;
	margin-top: 26rpx;
	width: 100%;
}

.sk-gap {
	margin-top: 18rpx;
}

@keyframes sk-shimmer {
	0% {
		background-position: 100% 50%;
	}
	100% {
		background-position: 0 50%;
	}
}

/* ---------- 数字等宽（统计数字跳动时不会抖） ---------- */
.num {
	font-feature-settings: "tnum";
	font-variant-numeric: tabular-nums;
}

/* ============================================================
 * 吸顶毛玻璃标题栏（iOS 观感）
 * 用法：页面加 <view class="nav-blur" v-if="navShow"><text class="nav-blur-title">…</text></view>
 *      再在 onPageScroll 里按 scrollTop 切换 navShow（约 80px 阈值）
 * 说明：backdrop-filter 在 iOS 微信生效、部分安卓不生效，
 *      所以底色给了接近不透明的回退值，不模糊时也不难看。
 * ============================================================ */
.nav-blur {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	z-index: 100;
	height: 96rpx;
	padding: 0 32rpx;
	display: flex;
	align-items: center;
	background: rgba(242, 242, 247, 0.86);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	border-bottom: 1rpx solid rgba(60, 60, 67, 0.10);
}

.nav-blur-title {
	font-size: 32rpx;
	font-weight: 600;
	letter-spacing: -0.3rpx;
	color: #1C1C1E;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

/* ============================================================
 * 空状态插图（纯 CSS 画的"文档"图形，不用图片资源）
 * ============================================================ */
.empty-art {
	width: 180rpx;
	height: 180rpx;
	border-radius: 50%;
	background: rgba(120, 120, 128, 0.08);
	margin: 0 auto 28rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.empty-doc {
	width: 96rpx;
	height: 120rpx;
	background: #fff;
	border-radius: 16rpx;
	box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.06);
	padding: 22rpx 18rpx;
	box-sizing: border-box;
}

.empty-doc-line {
	height: 12rpx;
	border-radius: 6rpx;
	background: rgba(120, 120, 128, 0.22);
	margin-bottom: 16rpx;
}

.empty-doc-line-short {
	width: 62%;
	margin-bottom: 0;
}
</style>
